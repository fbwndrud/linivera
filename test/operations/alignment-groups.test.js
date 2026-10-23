import test from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture } from './production-fixture.js';
import { recordExecution } from '../../core/operations/executions.js';
import { submitGroup } from '../../core/operations/output-groups.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
test('typed alignment cannot name another candidate audio even when its slot and artifact key look correct', async (t) => {
  const outputSpec = { groupPolicy: 'fixed', groups: ['A', 'B'].map((groupId) => ({ groupId, slots: [{ role: 'audio', required: true, acceptableMediaTypes: ['audio/wav'] }, { role: 'alignment', required: true, acceptableMediaTypes: ['application/json'] }] })) };
  const f = await productionFixture(t, { outputSpec, inputFieldPath: 'text', inputRole: 'dialogue', parameters: { text: 'synthetic source' } });
  const operation = await f.operation(); let executionHead = null;
  const record = await f.resource('native', 'native-request', f.requestValue.parameters); const requestDigest = sha256(canonicalJson(f.requestValue.parameters));
  async function event(event) { ({ executionHead } = await recordExecution(f.root, { operationId: operation.operationId, executionId: 'first', expectedExecutionHead: executionHead, event })); }
  await event({ type: 'prepared', requestDigest, nativeRecordRevisionId: record.revisionId, remoteInputBindings: [{ fieldPath: 'text', revisionId: f.source.revisionId }] });
  await event({ type: 'submitting' }); await event({ type: 'accepted', providerJobId: 'synthetic' });
  const audioA = await f.resource('audioA', 'audio', Buffer.from('synthetic audio A'), 'audio/wav');
  const audioB = await f.resource('audioB', 'audio', Buffer.from('synthetic audio B'), 'audio/wav');
  const alignment = { audioRevisionId: audioB.revisionId, textRevisionId: f.source.revisionId, alignmentKind: 'character', timebase: { unit: 'seconds', origin: 0 }, segments: [] };
  const alignmentA = await f.resource('alignmentA', 'audio-alignment', alignment);
  const alignmentB = await f.resource('alignmentB', 'audio-alignment', alignment);
  const artifacts = [{ artifactKey: 'A/audio', groupId: 'A', role: 'audio', revisionId: audioA.revisionId }, { artifactKey: 'A/alignment', groupId: 'A', role: 'alignment', revisionId: alignmentA.revisionId },
    { artifactKey: 'B/audio', groupId: 'B', role: 'audio', revisionId: audioB.revisionId }, { artifactKey: 'B/alignment', groupId: 'B', role: 'alignment', revisionId: alignmentB.revisionId }];
  await event({ type: 'outputs-observed', artifacts });
  async function submit(groupId) {
    const members = artifacts.filter((artifact) => artifact.groupId === groupId).map(({ groupId: _groupId, ...artifact }) => artifact);
    const manifest = await f.resource('group-' + groupId, 'production-group', { version: 1, groupId, members });
    return submitGroup(f.root, { operationId: operation.operationId, groupId, inputSnapshotId: f.snapshot.inputSnapshotId, executionId: 'first', executionHead, requestDigest, resultRevisionIds: members.map((member) => member.revisionId), groupManifestRevisionId: manifest.revisionId });
  }
  await assert.rejects(submit('A'), { code: 'ALIGNMENT_BINDING_INVALID' });
  assert.equal((await submit('B')).groupId, 'B');
});
