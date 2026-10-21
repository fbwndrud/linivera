import { createResourceStore } from '../../resources/revisions.js';
import { canonicalJson, sha256 } from '../../util/hash.js';
import { fail } from '../objects.js';
export async function verifyNativeRequest(root, request, event) {
  const store = createResourceStore(root);
  const revision = await store.readRevision(event.nativeRecordRevisionId);
  if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') fail('EXECUTION_BINDING_INVALID', 'native request JSON must be owned');
  const record = JSON.parse((await store.readContent(revision.revisionId)).toString('utf8'));
  if (sha256(canonicalJson(record)) !== event.requestDigest) fail('EXECUTION_BINDING_INVALID', 'native request digest differs');
  const expected = request.inputBindings.map((binding) => ({ fieldPath: binding.fieldPath, revisionId: binding.transformRevisionId ?? binding.revisionId })).sort((a, b) => a.fieldPath.localeCompare(b.fieldPath));
  const actual = event.remoteInputBindings.map((binding) => ({ fieldPath: binding.fieldPath, revisionId: binding.revisionId })).sort((a, b) => a.fieldPath.localeCompare(b.fieldPath));
  if (canonicalJson(expected) !== canonicalJson(actual)) fail('EXECUTION_BINDING_INVALID', 'native mappings must match every sealed input binding');
  return record;
}
export async function bindArtifacts(root, artifacts) {
  const store = createResourceStore(root); const bound = [];
  for (const artifact of artifacts) {
    if (!artifact || Object.keys(artifact).some((key) => !['artifactKey', 'groupId', 'role', 'revisionId', 'resourceId', 'contentHash', 'mediaType'].includes(key))
      || ['artifactKey', 'groupId', 'role', 'revisionId'].some((key) => typeof artifact[key] !== 'string' || !artifact[key].length)) fail('EXECUTION_BINDING_INVALID', 'invalid observed artifact');
    const revision = await store.readRevision(artifact.revisionId);
    if (revision.storageStatus !== 'owned_snapshot') fail('EXECUTION_BINDING_INVALID', 'observed artifact must have retained bytes');
    const value = { artifactKey: artifact.artifactKey, groupId: artifact.groupId, role: artifact.role, revisionId: revision.revisionId, resourceId: revision.resourceId, contentHash: revision.contentHash, mediaType: revision.mediaType };
    for (const key of ['resourceId', 'contentHash', 'mediaType']) if (artifact[key] !== undefined && artifact[key] !== value[key]) fail('EXECUTION_BINDING_INVALID', 'observed artifact hash differs');
    bound.push(value);
  }
  return bound;
}
