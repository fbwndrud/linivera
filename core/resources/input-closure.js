import { createResourceStore } from './revisions.js';
import { readBundle, MAX_BUNDLE_BYTES } from './bundles.js';
import { readContextReferences } from './context-references.js';
import { readIterationReferences } from '../operations/iteration.js';
import { invalidInput } from './input-definitions.js';
import { assertRevisionId } from './schema.js';
import { validateProductionRequest } from '../../packs/production/request-schema.js';
import { CONTEXT_KINDS } from './context-records.js';
import { FolioError } from '../errors.js';
import { readStructureRelations } from './structure-bindings.js';
import { resolveParserVersion } from '../../packs/production/structures/versions.js';
import { assertContextRequirements } from '../context/requirements.js';
import { assertReadinessCurrent, assertReadinessRequirements } from '../readiness/verify.js';
import { ACCESS_KINDS } from '../access/records.js';
import { assertConnectionRequirements } from '../access/verify.js';
import { assertContextIsolation } from '../context/isolation.js';
import { assertInputReadinessContracts } from '../readiness/request-contract.js';
export function hasInputReferences(kind) {
  return ACCESS_KINDS.has(kind) || CONTEXT_KINDS.has(kind) || ['iteration', 'audio-alignment', 'normalization-map', 'generation-request', 'structure-map', 'capability-readiness', 'capability-specification'].includes(kind);
}
/** Historical snapshots still verify; new work must use the typed-reference closure contract. */
export async function assertNewOperationInputClosure(root, manifest) {
  const store = createResourceStore(root);
  await assertInputReadinessContracts(root, manifest);
  if (manifest.version === 2) await assertContextIsolation(root, manifest.resources.map((row) => row.revisionId), { scopeId: manifest.scopeId });
  for (const resource of manifest.resources) {
    const revision = await store.readRevision(resource.revisionId);
    if (manifest.version === 1 && manifest.referenceClosureVersion !== 1 && hasInputReferences(revision.kind)) throw new FolioError('INPUT_REFERENCE_CLOSURE_REQUIRED', 'Prepare a fresh input snapshot or use version 2 before starting new work with typed context references.');
    if (revision.kind === 'capability-readiness') await assertReadinessCurrent(root, revision.revisionId, manifest);
    if (revision.kind === 'structure-map') {
      const value = JSON.parse((await store.readContent(revision.revisionId)).toString('utf8'));
      if (value.parserVersion !== resolveParserVersion(value.format, undefined)) throw new FolioError('STRUCTURE_PARSER_UPGRADE_REQUIRED', 'Reinspect and normalize the retained source with the current parser before starting a new operation. Historical inputs and existing operations remain readable.');
    }
  }
}
/** Expand only typed actual-input references; provenance-only references stay outside this closure. */
export async function collectInputClosure(root, revisionIds) {
  const store = createResourceStore(root); const visited = new Set(); const active = new Set(); const resources = []; let edges = 0;
  async function visit(id, depth) {
    assertRevisionId(id);
    if (active.has(id) || depth > 32) invalidInput('cyclic or excessively nested input references');
    if (visited.has(id)) return;
    if (visited.size >= 4096) invalidInput('too many input revisions');
    active.add(id); visited.add(id);
    const revision = await store.readRevision(id); resources.push(revision); let refs;
    if (revision.kind === 'artifact-bundle') {
      const bundle = await readBundle(root, id);
      if (bundle.completeness !== 'complete') invalidInput('required bundle member is unavailable');
      for (const member of bundle.members) if ((await store.readRevision(member.revisionId)).resourceId !== member.resourceId) invalidInput('bundle member identity differs');
      refs = bundle.members.map((member) => member.revisionId);
    } else if (revision.kind === 'generation-request') {
      if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') invalidInput('owned JSON generation request required');
      const value = validateProductionRequest(JSON.parse((await store.readContent(id)).toString('utf8')));
      refs = [...(value.inputBindings ?? []).flatMap((binding) => [binding.revisionId, ...(binding.transformRevisionId ? [binding.transformRevisionId] : [])]), ...(value.iteration?.baseRevisionIds ?? []), ...(value.iteration?.preserveRefs ?? []), ...(value.iteration?.changeRequestRevisionId ? [value.iteration.changeRequestRevisionId] : [])];
    } else if (revision.kind === 'structure-map') refs = (await readStructureRelations(root, revision, { requireComplete: true })).map((ref) => ref.targetRevisionId);
    else {
      refs = [...await readContextReferences(root, revision), ...await readIterationReferences(root, revision)];
      if (revision.kind === 'connection-readiness') await assertConnectionRequirements(root, revision.revisionId);
      if (revision.kind === 'capability-readiness') await assertReadinessRequirements(root, revision.revisionId);
      if (revision.kind === 'usage-context') await assertContextRequirements(root, JSON.parse((await store.readContent(id)).toString('utf8')));
    }
    for (const ref of refs) { if (++edges > 8192) invalidInput('too many input references'); await visit(ref, depth + 1); }
    active.delete(id);
  }
  for (const id of revisionIds) await visit(id, 0);
  if (resources.some((revision) => revision.kind === 'artifact-bundle') && resources.reduce((total, revision) => total + (revision.byteLength ?? 0), 0) > MAX_BUNDLE_BYTES) invalidInput('expanded bundle input exceeds 8GiB');
  return resources;
}
