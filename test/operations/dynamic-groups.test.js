import test from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture } from './production-fixture.js';
import { recordExecution, inspectExecution } from '../../core/operations/executions.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
test('dynamic candidates obey stable native keys, allowed kinds, bounds and final enumeration', async (t) => {
  const f = await productionFixture(t, { outputSpec: { groupPolicy: 'dynamic', groupRules: { keyFields: ['itemId'], maxGroups: 1, allowedKinds: ['image'] }, slotsSchema: [{ role: 'image', required: true, acceptableMediaTypes: ['text/plain'] }] } });
  const operation = await f.operation(); const record = await f.resource('native', 'native-request', {}); let executionHead = null;
  async function event(event) { const next = await recordExecution(f.root, { operationId: operation.operationId, executionId: 'first', expectedExecutionHead: executionHead, event }); executionHead = next.executionHead; }
  await event({ type: 'prepared', requestDigest: sha256(canonicalJson({})), nativeRecordRevisionId: record.revisionId, remoteInputBindings: [{ fieldPath: 'image', revisionId: f.source.revisionId }] });
  await event({ type: 'submitting' }); await event({ type: 'accepted', providerJobId: 'synthetic' });
  const nativeKey = { itemId: 'first-image' }; const groupId = sha256(canonicalJson(nativeKey));
  await assert.rejects(event({ type: 'group-discovered', groupId: 'invented', nativeKey, kind: 'image' }), { code: 'OUTPUT_GROUP_INVALID' });
  await event({ type: 'group-discovered', groupId, nativeKey, kind: 'image' });
  const another = { itemId: 'another' };
  await assert.rejects(event({ type: 'group-discovered', groupId: sha256(canonicalJson(another)), nativeKey: another, kind: 'image' }), { code: 'OUTPUT_GROUP_INVALID' });
  const output = await f.resource('dynamic', 'result', 'synthetic image', 'text/plain');
  await event({ type: 'outputs-observed', artifacts: [{ artifactKey: 'first-image', groupId, role: 'image', revisionId: output.revisionId }] });
  await assert.rejects(event({ type: 'complete' }), { code: 'EXECUTION_INCOMPLETE' });
  await event({ type: 'complete', enumerationComplete: true });
  assert.equal((await inspectExecution(f.root, { operationId: operation.operationId })).executions[0].status, 'complete');
});
