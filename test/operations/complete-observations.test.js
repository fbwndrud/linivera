import test from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture } from './production-fixture.js';
import { recordExecution, inspectExecution } from '../../core/operations/executions.js';
import { submitGroup, readGroup } from '../../core/operations/output-groups.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';

test('later excess outputs invalidate current completeness while retaining a sealed group prefix', async (t) => {
  const f = await productionFixture(t, { outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: [{ role: 'image', required: true, acceptableMediaTypes: ['text/plain'] }] }] } });
  const operation = await f.operation(); const native = await f.resource('native', 'native-request', {}); const digest = sha256(canonicalJson({}));
  let executionHead = null;
  const event = async (event) => { ({ executionHead } = await recordExecution(f.root, { operationId: operation.operationId, executionId: 'first', expectedExecutionHead: executionHead, event })); };
  await event({ type: 'prepared', requestDigest: digest, nativeRecordRevisionId: native.revisionId, remoteInputBindings: [{ fieldPath: 'image', revisionId: f.source.revisionId }] });
  await event({ type: 'submitting' }); await event({ type: 'accepted', providerJobId: 'synthetic-job' });
  const image = await f.resource('image', 'result', 'Synthetic first image', 'text/plain');
  const member = { artifactKey: 'first-image', role: 'image', revisionId: image.revisionId };
  await event({ type: 'outputs-observed', artifacts: [{ ...member, groupId: 'A' }] }); await event({ type: 'complete' });
  const completeHead = executionHead;
  const manifest = await f.resource('group', 'production-group', { version: 1, groupId: 'A', members: [member] });
  const group = await submitGroup(f.root, { operationId: operation.operationId, groupId: 'A', inputSnapshotId: f.snapshot.inputSnapshotId,
    executionId: 'first', executionHead, requestDigest: digest, resultRevisionIds: [image.revisionId], groupManifestRevisionId: manifest.revisionId });
  await event({ type: 'outputs-observed', artifacts: [{ ...member, groupId: 'A' }] });
  assert.equal((await inspectExecution(f.root, { operationId: operation.operationId })).executions[0].status, 'complete');
  const extra = await f.resource('extra', 'result', 'Synthetic extra image', 'text/plain');
  await event({ type: 'outputs-observed', artifacts: [{ artifactKey: 'extra-image', groupId: 'A', role: 'image', revisionId: extra.revisionId }] });
  assert.equal((await inspectExecution(f.root, { operationId: operation.operationId })).executions[0].status, 'partial');
  assert.equal((await inspectExecution(f.root, { operationId: operation.operationId, executionHead: completeHead })).executions[0].status, 'complete');
  assert.deepEqual((await readGroup(f.root, operation.operationId, 'A')).group, group);
  await assert.rejects(event({ type: 'complete' }), { code: 'EXECUTION_INCOMPLETE' });
});
