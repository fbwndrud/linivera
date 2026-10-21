import { FolioError } from '../errors.js';
import { createResourceStore } from '../resources/revisions.js';
import { assertResourceId, assertRevisionId } from '../resources/schema.js';
import { readWorkspaceState } from '../publications/state.js';
function invalid(message) { throw new FolioError('ITERATION_INVALID', message); }
/** Iteration is retained intent and exact references, never an approval or an automatic edit. */
export async function validateIteration(root, value) {
  if (!value || value.version !== 1 || Object.keys(value).some((key) => !['version', 'scopeId', 'baseRevisionIds', 'preserveRefs', 'changeRequestRevisionId', 'previousSelection'].includes(key))) invalid('unsupported iteration schema');
  assertResourceId(value.scopeId);
  for (const key of ['baseRevisionIds', 'preserveRefs']) {
    if (!Array.isArray(value[key]) || (key === 'baseRevisionIds' && !value[key].length) || value[key].length > 4096 || new Set(value[key]).size !== value[key].length) invalid('bounded unique iteration revisions required');
    for (const id of value[key]) assertRevisionId(id);
  }
  assertRevisionId(value.changeRequestRevisionId);
  if (value.previousSelection !== undefined) {
    const previous = value.previousSelection;
    if (!previous || Object.keys(previous).some((key) => !['scopeId', 'scopeSelectionRevision'].includes(key)) || previous.scopeId !== value.scopeId) invalid('previous scope selection differs');
    const state = await readWorkspaceState(root);
    const marker = state.markers.find((record) => record.hash === previous.scopeSelectionRevision && record.type === 'input-selection' && record.payload.scopeId === previous.scopeId && record.payload.actor === 'user');
    if (!marker) invalid('previous user scope selection is absent');
    if (!value.baseRevisionIds.every((id) => marker.payload.bindings.some((binding) => binding.revisionId === id))) invalid('base revisions must be present in the previous selection');
  }
  const store = createResourceStore(root);
  const change = await store.readRevision(value.changeRequestRevisionId);
  if (change.storageStatus !== 'owned_snapshot' || change.mediaType !== 'text/plain') invalid('change request must retain exact text');
  const refs = [...new Set([...value.baseRevisionIds, ...value.preserveRefs, value.changeRequestRevisionId])];
  for (const id of refs) await store.readRevision(id);
  return refs;
}
export async function readIterationReferences(root, revision) {
  if (revision.kind !== 'iteration') return [];
  if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') invalid('owned JSON iteration required');
  return validateIteration(root, JSON.parse((await createResourceStore(root).readContent(revision.revisionId)).toString('utf8')));
}
