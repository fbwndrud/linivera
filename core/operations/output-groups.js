import { join } from 'node:path';
import { canonicalJson, sha256 } from '../util/hash.js';
import { createResourceStore } from '../resources/revisions.js';
import { objectIds } from '../resources/catalog.js';
import { withWorkspaceStateTransaction } from '../publications/state.js';
import { validateGroupManifest } from '../../packs/production/artifact-schema.js';
import { readOperation, outputBindings } from './requests.js';
import { readExecution } from './executions.js';
import { assertOperationContract } from './production-request.js';
import { checkAuthority } from './authority.js';
import { verifyGroupAlignments } from './alignment-bindings.js';
import { copy, fail, get, put } from './objects.js';
const groupKey = (operationId, groupId) => sha256(canonicalJson({ operationId, groupId }));
const directory = (operationId) => 'groups/' + operationId.slice(7);
/** Verify retained group bytes, the exact observed prefix and every sealed slot. */
async function groupCandidate(root, input) {
  const context = await readExecution(root, input.operationId, input.executionHead);
  if (context.request.inputSnapshotId !== input.inputSnapshotId) fail('REQUEST_MISMATCH', 'group input snapshot differs');
  const execution = context.executions.find((execution) => execution.executionId === input.executionId);
  if (!execution || execution.requestDigest !== input.requestDigest) fail('OUTPUT_GROUP_INVALID', 'group does not bind the observed request');
  const group = execution.groups.find((group) => group.groupId === input.groupId);
  if (!group) fail('OUTPUT_GROUP_INVALID', 'group was not declared or discovered');
  const store = createResourceStore(root); const envelope = await store.readRevision(input.groupManifestRevisionId);
  if (envelope.mediaType !== 'application/json' || envelope.storageStatus !== 'owned_snapshot') fail('OUTPUT_GROUP_INVALID', 'owned output group JSON required');
  const manifest = validateGroupManifest(JSON.parse((await store.readContent(envelope.revisionId)).toString('utf8')));
  if (manifest.groupId !== input.groupId || canonicalJson(manifest.members.map((member) => member.revisionId)) !== canonicalJson(input.resultRevisionIds)) fail('OUTPUT_GROUP_INVALID', 'group manifest members differ');
  const outputs = await outputBindings(root, input.resultRevisionIds);
  const observed = execution.artifacts.filter((artifact) => artifact.groupId === input.groupId);
  if (observed.length !== manifest.members.length) fail('OUTPUT_GROUP_INVALID', 'group must retain every observed member');
  for (const member of manifest.members) if (!observed.some((artifact) => artifact.artifactKey === member.artifactKey && artifact.revisionId === member.revisionId && artifact.role === member.role)) fail('OUTPUT_GROUP_INVALID', 'member comes from a different candidate or execution');
  for (const slot of group.slots) {
    const count = manifest.members.filter((member) => member.role === slot.role).length;
    if (count !== (slot.cardinality ?? 1) && !(count === 0 && !slot.required)) fail('OUTPUT_GROUP_INVALID', 'required output slot or cardinality differs');
  }
  await verifyGroupAlignments(root, manifest.members, context.value);
  const manifestBinding = (await outputBindings(root, [input.groupManifestRevisionId]))[0];
  if (outputs.some((output) => output.resourceId === manifestBinding.resourceId)) fail('OUTPUT_GROUP_INVALID', 'manifest must have an independent resource identity');
  const value = { version: 2, operationId: input.operationId, requestId: context.request.requestId, groupId: input.groupId, inputSnapshotId: input.inputSnapshotId,
    executionId: input.executionId, executionHead: input.executionHead, requestDigest: input.requestDigest, resultRevisionIds: input.resultRevisionIds,
    groupManifestRevisionId: input.groupManifestRevisionId, outputs: [...outputs, manifestBinding] };
  return { candidate: { ...value, groupHash: sha256(canonicalJson(value)) }, context };
}
export async function submitGroup(root, input) {
  input = copy(input);
  const keys = ['operationId', 'groupId', 'inputSnapshotId', 'executionId', 'executionHead', 'requestDigest', 'resultRevisionIds', 'groupManifestRevisionId'];
  if (!input || keys.some((key) => input[key] === undefined) || Object.keys(input).some((key) => !keys.includes(key))) fail('OUTPUT_GROUP_INVALID', 'complete group binding required');
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    const { candidate, context } = await groupCandidate(root, input);
    checkAuthority(context.manifest, state, context.request.actor, context.request.grantId, 'create-candidate');
    if (state.publications.some((publication) => publication.operationId === input.operationId) || state.groupPublications.some((publication) => publication.operationId === input.operationId && publication.groupId === input.groupId)) fail('LATE_RESULT', 'group is already finalized');
    const id = groupKey(input.operationId, input.groupId); const old = await get(root, directory(input.operationId), id, true);
    if (old && canonicalJson(old) !== canonicalJson(candidate)) fail('LATE_RESULT', 'group already has another immutable submission');
    await put(root, directory(input.operationId), candidate, id); return candidate;
  });
}
export async function readGroup(root, operationId, groupId) {
  const request = await readOperation(root, operationId); assertOperationContract(request, 2);
  const group = await get(root, directory(operationId), groupKey(operationId, groupId));
  const { candidate, context } = await groupCandidate(root, group);
  if (canonicalJson(candidate) !== canonicalJson(group)) fail('OUTPUT_GROUP_INTEGRITY_FAILURE', 'submitted group differs from retained observation');
  return { request, group, manifest: context.manifest };
}
export async function listGroups(root, operationId) {
  const groups = [];
  for (const id of await objectIds(root, join(root, '.folio', 'operations', directory(operationId)))) {
    const stored = await get(root, directory(operationId), id);
    if (groupKey(operationId, stored.groupId) !== id) fail('OUTPUT_GROUP_INTEGRITY_FAILURE', 'group identity differs');
    groups.push((await readGroup(root, operationId, stored.groupId)).group);
  }
  return groups;
}
