import test from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture } from '../operations/production-fixture.js';
import { productionHost } from '../../examples/support/production-host.js';
import { createProductionRecorder } from '../../server/production/recorder.js';
import { prepareRequest } from '../../adapters/production/common.js';

test('partial bundle survives MCP restart and completes without rebinding a prior output artifact', async (t) => {
  const f = await productionFixture(t, { outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: [
    { role: 'source', required: true, acceptableMediaTypes: ['text/plain'] },
    { role: 'build', required: true, acceptableMediaTypes: ['text/plain'] },
    { role: 'bundle', required: true, acceptableMediaTypes: ['application/json'] },
  ] }] } });
  const operation = await f.operation(); const host = await productionHost(f.root); t.after(() => host.close());
  const recorder = () => createProductionRecorder({ call: host.call, root: f.root, operationId: operation.operationId, executionId: 'capture' });
  const prepared = prepareRequest(f.requestValue, 'synthetic', { input: f.requestValue.parameters }, [{ fieldPath: 'image', revisionId: f.source.revisionId }]);
  let recording = recorder(); await recording.prepared(prepared); let submits = 0;
  await recording.submit({ async submit() { submits++; return { status: 'accepted', handle: { jobId: 'one-task' } }; } }, prepared);
  const file = (key, role) => ({ artifactKey: key, role, groupId: 'A', resourceId: `captured-${key}`, mediaType: 'text/plain', bytes: Buffer.from(`synthetic ${key}`) });
  const member = (key, role) => ({ artifactKey: key, role, relativePath: `${key}.txt`, required: true });
  const bundle = { artifactKey: 'bundle', groupId: 'A', role: 'bundle', resourceId: 'capture-bundle', bundleType: 'game-project',
    members: [member('source', 'source')], unavailable: [{ relativePath: 'build.txt', role: 'build', required: true, reason: 'Download was interrupted' }],
    dependencyCoverage: 'unknown', restorability: 'unknown' };
  const partial = await recording.collect(prepared, { artifacts: [file('source', 'source')], bundles: [bundle], nativeRecords: [] }, { inputSnapshotId: f.snapshot.inputSnapshotId });
  assert.equal(partial.groups.length, 0); assert.equal(partial.bundleObservations.length, 1);
  assert.equal(partial.artifacts.length, 1); assert.ok(partial.incompleteGroups[0].missingRoles.includes('bundle'));
  const partialRevision = partial.bundleObservations[0].revisionId;
  const partialManifest = await host.call('folio_resources', { op: 'read', revisionId: partialRevision });
  assert.equal(partialManifest.revision.kind, 'artifact-bundle');
  assert.equal(JSON.parse(partialManifest.content).completeness, 'incomplete');
  await host.restart(); recording = recorder();
  const completeBundle = { ...bundle, members: [member('source', 'source'), member('build', 'build')], unavailable: [] };
  const completed = await recording.collect(prepared, { artifacts: [file('build', 'build')], bundles: [completeBundle], nativeRecords: [] }, { inputSnapshotId: f.snapshot.inputSnapshotId });
  assert.equal(completed.groups.length, 1); assert.deepEqual(completed.incompleteGroups, []);
  assert.equal(completed.groups[0].resultRevisionIds.length, 3); assert.equal(submits, 1);
  const saved = await host.call('folio_resources', { op: 'read', revisionId: completed.artifacts.find((artifact) => artifact.role === 'bundle').revisionId });
  const value = JSON.parse(saved.content);
  assert.equal(value.completeness, 'complete'); assert.equal(value.members[0].revisionId, partial.artifacts[0].revisionId);
  assert.notEqual(saved.revision.revisionId, partialRevision);
  const again = await recording.collect(prepared, { artifacts: [file('source', 'source'), file('build', 'build')], bundles: [completeBundle], nativeRecords: [] }, { inputSnapshotId: f.snapshot.inputSnapshotId });
  assert.deepEqual(again.groups[0], completed.groups[0]); assert.equal(submits, 1);
});
