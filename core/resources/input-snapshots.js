import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { withWorkspaceStateTransaction, readWorkspaceState } from '../publications/state.js';
import { createResourceStore } from './revisions.js';
import { assertRevisionId } from './schema.js';
import { readObject, writeImmutable } from './files.js';
import { validateDefinition } from './definitions.js';
import { collectBundleClosure } from './bundles.js';
import { buildInputManifestV2 } from './input-snapshots-v2.js';
import { collectInputClosure } from './input-closure.js';
import { CONTEXT_KINDS } from './context-records.js';
function invalid(message) { throw new FolioError('INPUT_INVALID', message); }
function path(root, id) { assertRevisionId(id); return join(root, '.folio', 'resources', 'inputs', id.slice(7) + '.json'); }
function copy(value) { try { return JSON.parse(canonicalJson(value)); } catch { invalid('JSON input required'); } }
async function buildManifest(root, input, state, { historical = false, referenceClosureVersion = undefined } = {}) {
  if (input.version === 2) return buildInputManifestV2(root, input, state);
  if (input.version === 1) { const { version: _version, ...legacy } = input; input = legacy; }
  if (!Array.isArray(input.revisionIds) || !input.revisionIds.length || new Set(input.revisionIds).size !== input.revisionIds.length || Object.keys(input).some((key) => !['revisionIds', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId', 'externalMode'].includes(key)) || !['reject', 'reference-only'].includes(input.externalMode ?? 'reject')) invalid('invalid revision set or external mode');
  const store = createResourceStore(root);
  const definitions = {};
  const selections = [];
  async function selected(id) {
    const revision = await store.readRevision(id);
    const marker = state.sourceSelections[revision.resourceId];
    if (!marker || marker.revisionId !== id || marker.action?.actor !== 'user' || marker.action?.type !== 'select') invalid('input must name a user-selected revision at checkpoint');
    selections.push({ resourceId: revision.resourceId, revisionId: id, selectionRevision: marker.selectionRevision, checkpoint: marker.checkpoint });
    return revision;
  }
  for (const kind of ['profile', 'pipeline', 'policy']) {
    const revision = await selected(input[kind + 'RevisionId']);
    if (revision.kind !== kind || revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') invalid('owned JSON definition of matching kind required');
    const value = validateDefinition(kind, JSON.parse((await store.readContent(revision.revisionId)).toString('utf8')));
    definitions[kind] = { revisionId: revision.revisionId, contentHash: revision.contentHash, definitionHash: sha256(canonicalJson(value)), byteLength: revision.byteLength, value };
  }
  const resources = []; let totalBytes = Object.values(definitions).reduce((total, definition) => total + definition.byteLength, 0);
  let expanded = await collectBundleClosure(root, input.revisionIds);
  if (referenceClosureVersion !== undefined && referenceClosureVersion !== 1) invalid('unsupported reference closure version');
  const typedClosure = referenceClosureVersion === 1 || (!historical && expanded.some((revision) => CONTEXT_KINDS.has(revision.kind) || revision.kind === 'iteration'));
  if (typedClosure) expanded = await collectInputClosure(root, input.revisionIds);
  for (const { revisionId: id } of expanded) {
    const revision = await selected(id);
    if (resources.some((item) => item.resourceId === revision.resourceId) || !definitions.profile.value.scope.includes(revision.resourceId) || !definitions.policy.value.scope.includes(revision.resourceId)) invalid('input exceeds scope or duplicates a resource');
    if (revision.storageStatus === 'external_unobserved' && input.externalMode !== 'reference-only') invalid('external input requires explicit reference-only');
    resources.push({ resourceId: revision.resourceId, revisionId: id, contentHash: revision.contentHash, storageStatus: revision.storageStatus, byteLength: revision.byteLength ?? null, observation: revision.storageStatus === 'external_unobserved' ? 'reference-only' : 'folio-executed' });
    totalBytes += revision.byteLength ?? 0;
  }
  const maxInputBytes = Math.min(definitions.profile.value.maxInputBytes, definitions.policy.value.maxInputBytes ?? Number.MAX_SAFE_INTEGER);
  if (totalBytes > maxInputBytes) invalid('input exceeds byte budget');
  return { version: 1, ...(typedClosure ? { referenceClosureVersion: 1 } : {}), revisionIds: input.revisionIds, profileRevisionId: input.profileRevisionId, pipelineRevisionId: input.pipelineRevisionId, policyRevisionId: input.policyRevisionId, externalMode: input.externalMode ?? 'reject', workspaceCheckpoint: state.checkpoint, selections, resources, definitions, scope: resources.map((item) => item.resourceId), totalBytes, maxInputBytes, byteBudgetComplete: resources.every((item) => item.byteLength !== null) };
}
export async function prepareInput(root, input) {
  input = copy(input);
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    const manifest = await buildManifest(root, input, state);
    const bytes = canonicalJson(manifest); const inputSnapshotId = sha256(bytes);
    await writeImmutable(root, path(root, inputSnapshotId), bytes);
    return { inputSnapshotId, manifest };
  });
}
export async function verifyInput(root, inputSnapshotId) {
  const bytes = await readObject(root, path(root, inputSnapshotId));
  let manifest; try { manifest = JSON.parse(bytes.toString('utf8')); } catch { invalid('invalid snapshot JSON'); }
  if (sha256(bytes) !== inputSnapshotId || canonicalJson(manifest) !== bytes.toString('utf8')) invalid('input snapshot hash differs');
  const state = await readWorkspaceState(root, { checkpoint: manifest.workspaceCheckpoint });
  const selector = manifest.version === 2 ? { version: 2, scopeId: manifest.scopeId, scopeSelectionRevision: manifest.scopeSelectionRevision, bindingKeys: manifest.bindingKeys } : { revisionIds: manifest.revisionIds };
  const rebuilt = await buildManifest(root, { ...selector, profileRevisionId: manifest.profileRevisionId, pipelineRevisionId: manifest.pipelineRevisionId, policyRevisionId: manifest.policyRevisionId, externalMode: manifest.externalMode }, state, { historical: true, referenceClosureVersion: manifest.referenceClosureVersion });
  if (canonicalJson(rebuilt) !== canonicalJson(manifest)) invalid('input snapshot references differ');
  return { inputSnapshotId, manifest };
}

/** Derive a smaller sealed input at the original user-selection checkpoint. */
export async function restrictInput(root, inputSnapshotId, revisionIds) {
  return withWorkspaceStateTransaction(root, async () => {
    const { manifest: original } = await verifyInput(root, inputSnapshotId);
    if (!Array.isArray(revisionIds) || revisionIds.some((id) => !original.revisionIds.includes(id))) invalid('subset must retain pinned revisions only');
    const state = await readWorkspaceState(root, { checkpoint: original.workspaceCheckpoint });
    const selector = original.version === 2 ? { version: 2, scopeId: original.scopeId, scopeSelectionRevision: original.scopeSelectionRevision, bindingKeys: original.bindings.filter((binding) => revisionIds.includes(binding.revisionId)).map((binding) => binding.bindingKey) } : { revisionIds };
    const manifest = await buildManifest(root, { ...selector, profileRevisionId: original.profileRevisionId,
      pipelineRevisionId: original.pipelineRevisionId, policyRevisionId: original.policyRevisionId, externalMode: original.externalMode }, state, { historical: true, referenceClosureVersion: original.referenceClosureVersion });
    const bytes = canonicalJson(manifest); const id = sha256(bytes);
    await writeImmutable(root, path(root, id), bytes);
    return { inputSnapshotId: id, manifest };
  });
}
