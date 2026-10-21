import { recordExecution } from '../../core/operations/executions.js';
import { submitGroup } from '../../core/operations/output-groups.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
export async function observeGroups(f) {
  const operation = await f.operation(); const native = { prompt: 'synthetic' };
  const record = await f.resource('native', 'native-request', native);
  const base = { operationId: operation.operationId, executionId: 'first' };
  let executionHead = null;
  async function event(event) {
    ({ executionHead } = await recordExecution(f.root, { ...base, expectedExecutionHead: executionHead, event }));
  }
  const requestDigest = sha256(canonicalJson(native));
  await event({ type: 'prepared', requestDigest, nativeRecordRevisionId: record.revisionId, remoteInputBindings: [{ fieldPath: 'image', revisionId: f.source.revisionId }] });
  await event({ type: 'submitting' }); await event({ type: 'accepted', providerJobId: 'synthetic-job' });
  const artifacts = [];
  for (const groupId of ['A', 'B']) {
    const artifact = await f.resource(groupId, 'result', `synthetic ${groupId}`, 'text/plain');
    artifacts.push({ artifactKey: groupId + '/image', groupId, role: 'image', revisionId: artifact.revisionId });
  }
  await event({ type: 'outputs-observed', artifacts }); await event({ type: 'partial' });
  async function submit(groupId, overrides = {}) {
    const members = artifacts.filter((artifact) => artifact.groupId === groupId).map(({ groupId: _group, ...member }) => member);
    const manifest = await f.resource('manifest-' + groupId, 'production-group', { version: 1, groupId, members });
    return submitGroup(f.root, { operationId: operation.operationId, groupId, inputSnapshotId: f.snapshot.inputSnapshotId, executionId: base.executionId, executionHead, requestDigest, resultRevisionIds: members.map((member) => member.revisionId), groupManifestRevisionId: manifest.revisionId, ...overrides });
  }
  return { operation, artifacts, submit, event, base, get executionHead() { return executionHead; } };
}
