import test from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture } from '../operations/production-fixture.js';
import { productionHost } from '../../examples/support/production-host.js';
import { createProductionRecorder } from '../../server/production/recorder.js';
import { prepareRequest, digest } from '../../adapters/production/common.js';
import { retainProductionArtifacts } from '../../server/production/retain.js';
import { syntheticWav } from '../../examples/support/synthetic-media.js';

test('multiple native observations remain connected through one redacted retained batch', async (t) => {
  const f = await fixture(t); const recorder = f.recorder();
  await recorder.prepared(f.prepared); await recorder.submitting();
  await recorder.accepted({ handle: { jobId: 'batch-job' }, nativeRecords: [
    { stage: 'submit', record: { request_id: 'batch-job', api_key: 'synthetic-secret' } },
    { stage: 'download', record: { result: 'https://example.invalid/result?token=synthetic-secret' } },
  ] });
  const event = (await recorder.resume()).events.at(-1).payload.event;
  const retained = await f.host.call('folio_resources', { op: 'read', revisionId: event.nativeRecordRevisionId });
  const batch = JSON.parse(retained.content);
  assert.deepEqual(batch.observations.map((item) => item.stage), ['submit', 'download']);
  assert.equal(batch.observations[0].record.api_key, '[redacted]');
  assert.equal(batch.observations[1].record.result, 'https://example.invalid/result');
  assert.ok(!retained.content.includes('synthetic-secret'));
});
import { createFalAdapter } from '../../adapters/production/fal.js';

async function fixture(t, options = {}) {
  let f = await productionFixture(t, options);
  const host = await productionHost(f.root); t.after(() => host.close());
  let operation;
  if (options.textInput || options.providerFields) {
    const requestValue = { ...f.requestValue, parameters: { text: 'synthetic source' }, ...options.providerFields,
      inputBindings: [{ fieldPath: options.fieldPath ?? 'text', revisionId: f.source.revisionId, role: 'speech' }] };
    const revision = await host.json('request', requestValue, 'generation-request', [f.requestResource.revisionId]);
    await f.select(revision);
    const snapshot = await host.call('folio_inputs', { op: 'prepare', revisionIds: [f.source.revisionId, revision.revisionId],
      profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, policyRevisionId: f.ids.policy });
    operation = await host.call('folio_operations', { op: 'start', ...f.start,
      inputSnapshotId: snapshot.inputSnapshotId, requestRevisionId: revision.revisionId });
    f = { ...f, requestValue, snapshot };
  } else operation = await f.operation();
  const recorder = () => createProductionRecorder({ call: host.call, root: f.root,
    operationId: operation.operationId, executionId: 'fixture-execution' });
  const prepared = prepareRequest(f.requestValue, f.requestValue.provider, {
    input: f.requestValue.parameters, headers: { Authorization: 'Bearer top-secret' },
    reference: 'https://example.invalid/input?signature=temporary-secret',
  }, f.requestValue.inputBindings.map(({ fieldPath, revisionId }) => ({ fieldPath, revisionId })));
  return { ...f, host, recorder, prepared };
}

test('recorder retains redacted native requests and observations with a matching digest through public MCP', async (t) => {
  const f = await fixture(t); const recorder = f.recorder();
  await recorder.prepared(f.prepared);
  const result = await recorder.resume();
  const event = result.events[0].payload.event;
  const retained = await f.host.call('folio_resources', { op: 'read', revisionId: event.nativeRecordRevisionId });
  const record = JSON.parse(retained.content);
  assert.equal(digest(record), f.prepared.requestDigest);
  assert.equal(record.headers.Authorization, '[redacted]');
  assert.equal(record.reference, 'https://example.invalid/input');
  assert.ok(event.omittedPaths.includes('headers.Authorization'));
  await recorder.submitting();
  await recorder.accepted({ handle: { jobId: 'fixture-job' }, nativeRecords: [{ stage: 'submit', record: {
    request_id: 'fixture-job', api_key: 'top-secret', result: 'https://example.invalid/result?token=temporary-secret',
    headers: { 'set-cookie': 'cookie-secret', 'x-amz-security-token': 'sts-secret', 'X-Api-Key': 'api-secret' },
    client_secret: 'client-secret', secret_access_key: 'access-secret',
  } }] });
  const accepted = (await recorder.resume()).events.at(-1).payload.event;
  const observation = await f.host.call('folio_resources', { op: 'read', revisionId: accepted.nativeRecordRevisionId });
  assert.equal(JSON.parse(observation.content).api_key, '[redacted]');
  assert.equal(JSON.parse(observation.content).result, 'https://example.invalid/result');
  for (const secret of ['top-secret', 'cookie-secret', 'sts-secret', 'api-secret', 'client-secret', 'access-secret']) assert.ok(!observation.content.includes(secret));
});

test('durable submission-unknown and submitting both prevent POST after a host restart', async (t) => {
  const f = await fixture(t); let posts = 0;
  const adapter = { async submit() { posts++; throw new Error('connection lost after remote acceptance'); } };
  let recorder = f.recorder(); await recorder.prepared(f.prepared);
  const result = await recorder.submit(adapter, f.prepared);
  assert.equal(result.status, 'submission-unknown'); assert.equal(posts, 1);
  await f.host.restart(); recorder = f.recorder();
  await assert.rejects(() => recorder.submit(adapter, structuredClone(f.prepared)), /PRODUCTION_SUBMISSION_BLOCKED/);
  assert.equal(posts, 1);
  assert.equal((await recorder.resume()).executions[0].status, 'submission-unknown');

  const other = await fixture(t); let crashRecorder = other.recorder();
  await crashRecorder.prepared(other.prepared); await crashRecorder.submitting();
  await other.host.restart(); crashRecorder = other.recorder();
  await assert.rejects(() => crashRecorder.submit(adapter, other.prepared), /PRODUCTION_SUBMISSION_BLOCKED/);
  assert.equal(posts, 1);
});

test('partial collections retain incomplete groups while submitting complete groups only', async (t) => {
  const slot = (role) => ({ role, required: true, acceptableMediaTypes: ['text/plain'] });
  const f = await fixture(t, { outputSpec: { groupPolicy: 'fixed', groups: [
    { groupId: 'A', slots: [slot('audio'), slot('sidecar')] }, { groupId: 'B', slots: [slot('image')] },
  ] } });
  const recorder = f.recorder(); await recorder.prepared(f.prepared);
  await recorder.submit({ async submit() { return { status: 'complete', handle: { jobId: 'synthetic-job' } }; } }, f.prepared);
  const artifact = (artifactKey, groupId, role) => ({ artifactKey, groupId, role,
    resourceId: `fixture-${artifactKey}`, mediaType: 'text/plain', bytes: Buffer.from(`synthetic ${artifactKey}`) });
  const retained = await recorder.collect(f.prepared, { status: 'partial',
    artifacts: [artifact('audio', 'A', 'audio'), artifact('image', 'B', 'image')], nativeRecords: [] }, { inputSnapshotId: f.snapshot.inputSnapshotId });
  assert.deepEqual(retained.groups.map((group) => group.groupId), ['B']);
  assert.deepEqual(retained.incompleteGroups.map((group) => group.groupId), ['A']);
  assert.deepEqual(retained.incompleteGroups[0].missingRoles, ['sidecar']);
  assert.equal((await recorder.resume()).executions[0].artifacts.length, 2);
  const completed = await recorder.collect(f.prepared, { status: 'complete',
    artifacts: [artifact('sidecar', 'A', 'sidecar')], nativeRecords: [] }, { inputSnapshotId: f.snapshot.inputSnapshotId });
  assert.deepEqual(completed.groups.map((group) => group.groupId), ['A']);
  assert.equal(completed.groups[0].resultRevisionIds.length, 2);
  assert.deepEqual(completed.incompleteGroups, []);
  await f.host.restart(); const resumed = f.recorder();
  const again = await resumed.collect(f.prepared, { status: 'complete', artifacts: [
    artifact('audio', 'A', 'audio'), artifact('sidecar', 'A', 'sidecar'), artifact('image', 'B', 'image'),
  ], nativeRecords: [] }, { inputSnapshotId: f.snapshot.inputSnapshotId });
  assert.deepEqual(again.groups.map((group) => group.groupId), ['A', 'B']);
  assert.deepEqual(again.groups.find((group) => group.groupId === 'A'), completed.groups[0]);
});

test('host correlation identifiers do not become observed provider job identifiers', async (t) => {
  const f = await fixture(t); const recorder = f.recorder(); await recorder.prepared(f.prepared);
  await recorder.submit({ async submit() { return { status: 'complete', handle: {
    provider: 'elevenlabs', jobId: 'local-synthetic-correlation', jobIdSource: 'local-correlation',
  } }; } }, f.prepared);
  const result = await recorder.resume(); const event = result.events.at(-1).payload.event;
  assert.equal(result.executions[0].providerJobId, null);
  assert.deepEqual(event.unavailableFields, ['providerJobId']);
  const retained = await f.host.call('folio_resources', { op: 'read', revisionId: event.nativeRecordRevisionId });
  assert.equal(JSON.parse(retained.content).correlationId, 'local-synthetic-correlation');
});

test('late alignment can bind earlier retained audio and always seals the exact text and audio revisions', async () => {
  const textRevisionId = `sha256:${'a'.repeat(64)}`; const audioRevisionId = `sha256:${'b'.repeat(64)}`;
  const prepared = { request: { inputBindings: [{ fieldPath: 'text', revisionId: textRevisionId }] } };
  const artifact = { artifactKey: 'alignment', groupId: 'A', role: 'alignment', resourceId: 'timing',
    mediaType: 'application/json', metadata: { sourceArtifactKey: 'audio', textRevisionId },
    bytes: Buffer.from(JSON.stringify({ audioRevisionId: 'untrusted-audio', textRevisionId: 'untrusted-text',
      original: { text: 'Hi', segments: [{ index: 0, character: 'H', start: 0, end: 0.2 }] } })) };
  let captured;
  const args = { prepared, collection: { artifacts: [artifact] }, priorArtifacts: [
    { artifactKey: 'audio', groupId: 'A', role: 'audio', revisionId: audioRevisionId },
  ], invoke: async () => assert.fail('alignment is retained as typed JSON'),
  json: async (resourceId, value) => { captured = value; return { resourceId, revisionId: 'timing-revision' }; } };
  await retainProductionArtifacts(args);
  assert.equal(captured.audioRevisionId, audioRevisionId); assert.equal(captured.textRevisionId, textRevisionId);
  assert.equal(captured.original.segments[0].character, 'H');
  artifact.metadata.textRevisionId = 'different-text';
  await assert.rejects(() => retainProductionArtifacts(args), { code: 'PRODUCTION_CAPTURE_INVALID' });
});

test('audio-only then alignment-only collection completes the exact group through MCP after restart', async (t) => {
  const f = await fixture(t, { textInput: true, outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: [
    { role: 'audio', required: true, acceptableMediaTypes: ['audio/wav'] },
    { role: 'alignment', required: true, acceptableMediaTypes: ['application/json'] },
  ] }] } });
  let recorder = f.recorder(); await recorder.prepared(f.prepared);
  await recorder.submit({ async submit() { return { status: 'complete', handle: { jobId: 'speech-job' } }; } }, f.prepared);
  const first = await recorder.collect(f.prepared, { artifacts: [{ artifactKey: 'audio', groupId: 'A', role: 'audio',
    resourceId: 'fixture-speech', mediaType: 'audio/wav', bytes: syntheticWav() }], nativeRecords: [] }, { inputSnapshotId: f.snapshot.inputSnapshotId });
  assert.equal(first.groups.length, 0); assert.deepEqual(first.incompleteGroups[0].missingRoles, ['alignment']);
  await f.host.restart(); recorder = f.recorder();
  const text = f.requestValue.parameters.text;
  const timing = { requestText: text, original: { text, segments: [...text].map((character, index) => ({
    index, character, start: index / 100, end: (index + 1) / 100,
  })) } };
  const collection = { artifacts: [{ artifactKey: 'alignment', groupId: 'A', role: 'alignment',
    resourceId: 'fixture-timing', mediaType: 'application/json', bytes: Buffer.from(JSON.stringify(timing)),
    metadata: { sourceArtifactKey: 'audio', textRevisionId: f.source.revisionId } }], nativeRecords: [] };
  const completed = await recorder.collect(f.prepared, collection, { inputSnapshotId: f.snapshot.inputSnapshotId });
  assert.equal(completed.groups.length, 1); assert.deepEqual(completed.incompleteGroups, []);
  const saved = await f.host.call('folio_resources', { op: 'read', revisionId: completed.artifacts[0].revisionId });
  assert.equal(JSON.parse(saved.content).audioRevisionId, first.artifacts[0].revisionId);
  assert.equal(JSON.parse(saved.content).textRevisionId, f.source.revisionId);
  const again = await recorder.collect(f.prepared, collection, { inputSnapshotId: f.snapshot.inputSnapshotId });
  assert.deepEqual(again.groups[0], completed.groups[0]);
});

test('claimed pinned prompt bytes cannot replace actual sealed text even when contentHash is omitted', async (t) => {
  const f = await fixture(t, { fieldPath: 'prompt', providerFields: { provider: 'fal', product: 'flux',
    endpoint: 'fal-ai/flux/schnell', capability: 'text-to-image', parameters: { prompt: 'synthetic source' } },
  outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: [{ role: 'image', required: true, acceptableMediaTypes: ['image/png'] }] }] } });
  let posts = 0;
  const adapter = createFalAdapter({ accountAlias: 'synthetic', transport: {
    submit: async () => { posts++; return { request_id: 'must-not-submit' }; }, status: async () => ({}),
    result: async () => ({}), download: async () => Buffer.alloc(0),
  } });
  const forgedRequest = structuredClone(f.requestValue);
  forgedRequest.parameters.prompt = 'synthetic different transmission';
  const claimed = await adapter.prepare(forgedRequest, [{ revisionId: f.source.revisionId,
    mediaType: 'text/plain', bytes: Buffer.from(forgedRequest.parameters.prompt) }]);
  const recorder = f.recorder();
  await assert.rejects(() => recorder.prepared(claimed), { code: 'PRODUCTION_INPUT_BINDING_INVALID' });
  assert.equal(posts, 0); assert.equal((await recorder.resume()).events.length, 0);
  const nativeOnlyForgery = structuredClone(claimed); nativeOnlyForgery.request = structuredClone(f.requestValue);
  await assert.rejects(() => recorder.prepared(nativeOnlyForgery), { code: 'PRODUCTION_INPUT_BINDING_INVALID' });
  await assert.rejects(() => adapter.prepare(f.requestValue, [{ revisionId: f.source.revisionId,
    mediaType: 'text/plain', bytes: Buffer.from('forged pinned bytes') }]), { code: 'PRODUCTION_INPUT_INVALID' });

  const goodPrepared = await adapter.prepare(f.requestValue, [{ revisionId: f.source.revisionId,
    mediaType: 'text/plain', bytes: Buffer.from('synthetic source') }]);
  const goodRecorder = f.recorder(); await goodRecorder.prepared(goodPrepared);
  const changedAfterPrepare = structuredClone(goodPrepared);
  changedAfterPrepare.request.parameters.prompt = 'changed request';
  await assert.rejects(() => goodRecorder.submit(adapter, changedAfterPrepare), { code: 'PRODUCTION_INPUT_BINDING_INVALID' });
  const changedNativePayload = structuredClone(goodPrepared);
  changedNativePayload.nativeRequest.input.prompt = 'changed native payload';
  await assert.rejects(() => goodRecorder.submit(adapter, changedNativePayload), { code: 'PRODUCTION_SUBMISSION_BLOCKED' });
  assert.equal(posts, 0);
});
