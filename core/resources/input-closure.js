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
export function hasInputReferences(kind) {
  return CONTEXT_KINDS.has(kind) || ['iteration', 'audio-alignment', 'normalization-map', 'generation-request', 'structure-map'].includes(kind);
}
/** Historical snapshots still verify; new work must use the typed-reference closure contract. */
export async function assertNewOperationInputClosure(root, manifest) {
  if (manifest.version !== 1 || manifest.referenceClosureVersion === 1) return;
  const store = createResourceStore(root);
  for (const resource of manifest.resources) {
    const revision = await store.readRevision(resource.revisionId);
    if (hasInputReferences(revision.kind)) throw new FolioError('INPUT_REFERENCE_CLOSURE_REQUIRED', 'Prepare a fresh input snapshot or use version 2 before starting new work with typed context references.');
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
    else refs = [...await readContextReferences(root, revision), ...await readIterationReferences(root, revision)];
    for (const ref of refs) { if (++edges > 8192) invalidInput('too many input references'); await visit(ref, depth + 1); }
    active.delete(id);
  }
  for (const id of revisionIds) await visit(id, 0);
  if (resources.some((revision) => revision.kind === 'artifact-bundle') && resources.reduce((total, revision) => total + (revision.byteLength ?? 0), 0) > MAX_BUNDLE_BYTES) invalidInput('expanded bundle input exceeds 8GiB');
  return resources;
}
