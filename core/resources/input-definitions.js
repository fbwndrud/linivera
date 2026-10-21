import { createResourceStore } from './revisions.js';
import { validateDefinition } from './definitions.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';
export function invalidInput(message) { throw new FolioError('INPUT_INVALID', message); }
export function sourceDependency(revision, state) {
  const marker = state.sourceSelections[revision.resourceId];
  if (!marker || marker.revisionId !== revision.revisionId || marker.action?.actor !== 'user' || marker.action?.type !== 'select') invalidInput('input must name a user-selected revision at checkpoint');
  return { resourceId: revision.resourceId, revisionId: revision.revisionId, selectionRevision: marker.selectionRevision, checkpoint: marker.checkpoint };
}
export async function readInputDefinitions(root, input, state) {
  const store = createResourceStore(root); const definitions = {}; const selections = [];
  for (const kind of ['profile', 'pipeline', 'policy']) {
    const revision = await store.readRevision(input[kind + 'RevisionId']); selections.push(sourceDependency(revision, state));
    if (revision.kind !== kind || revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') invalidInput('owned JSON definition of matching kind required');
    const value = validateDefinition(kind, JSON.parse((await store.readContent(revision.revisionId)).toString('utf8')));
    definitions[kind] = { revisionId: revision.revisionId, contentHash: revision.contentHash, definitionHash: sha256(canonicalJson(value)), byteLength: revision.byteLength, value };
  }
  return { definitions, selections };
}
export function assertInputScope(definitions, resourceId) {
  if (!definitions.profile.value.scope.includes(resourceId) || !definitions.policy.value.scope.includes(resourceId)) invalidInput('input exceeds profile or policy scope');
}
