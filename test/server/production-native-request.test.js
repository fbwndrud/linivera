import test from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture } from '../operations/production-fixture.js';
import { productionHost } from '../../examples/support/production-host.js';
import { createProductionRecorder } from '../../server/production/recorder.js';
import { createFalAdapter } from '../../adapters/production/fal.js';
import { createElevenLabsAdapter } from '../../adapters/production/elevenlabs.js';
import { createMeshyAdapter } from '../../adapters/production/meshy.js';
import { prepareRequest } from '../../adapters/production/common.js';

for (const provider of ['fal', 'elevenlabs', 'meshy']) test(`MCP binds every ${provider} native parameter even without input mappings`, async (t) => {
  const f = await productionFixture(t); const host = await productionHost(f.root); t.after(() => host.close());
  const speech = provider === 'elevenlabs'; const model = provider === 'meshy'; let posts = 0;
  const value = { ...f.requestValue, provider, endpoint: model ? '/openapi/v2/text-to-3d' : speech ? '/v1/text-to-speech/fixture/with-timestamps' : 'fal-ai/flux/schnell',
    capability: model ? 'text-to-3d' : speech ? 'text-to-speech' : 'text-to-image', inputBindings: [], parameters: model ? { mode: 'preview', prompt: 'Synthetic sealed model', target_formats: ['glb'] } : speech ? { text: 'Synthetic sealed speech', output_format: 'mp3_44100_128' } : { prompt: 'Synthetic sealed prompt', seed: 1 },
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: [{ role: 'image', required: true, acceptableMediaTypes: ['image/png'] }] }] } };
  const request = await host.json('request', value, 'generation-request'); await f.select(request);
  const snapshot = await host.call('folio_inputs', { op: 'prepare', revisionIds: [request.revisionId],
    profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, policyRevisionId: f.ids.policy });
  const operation = await host.call('folio_operations', { op: 'start', ...f.start, inputSnapshotId: snapshot.inputSnapshotId, requestRevisionId: request.revisionId });
  const transport = { submit: async () => { posts++; return model ? { result: 'sealed-job' } : { request_id: 'sealed-job' }; }, get: async () => ({}), status: async () => ({}), result: async () => ({}), download: async () => Buffer.alloc(0),
    convertWithTimestamps: async () => { posts++; return { request_id: 'sealed-job', audio_base64: Buffer.from('synthetic audio').toString('base64') }; } };
  const adapter = (model ? createMeshyAdapter : speech ? createElevenLabsAdapter : createFalAdapter)({ accountAlias: 'fixture', transport });
  const prepared = await adapter.prepare(value);
  const native = structuredClone(prepared.nativeRequest); (speech ? native.body : native.input)[speech ? 'text' : 'prompt'] = 'Synthetic unsealed transmission';
  const forged = prepareRequest(value, provider, native, []);
  const recorder = createProductionRecorder({ call: host.call, root: f.root, operationId: operation.operationId, executionId: 'first' });
  await assert.rejects(recorder.prepared(forged), { code: 'PRODUCTION_INPUT_BINDING_INVALID' });
  const record = await host.json('forged-native', native, 'execution-request');
  await assert.rejects(host.call('folio_operations', { op: 'recordExecution', operationId: operation.operationId, executionId: 'first', expectedExecutionHead: null,
    event: { type: 'prepared', requestDigest: forged.requestDigest, nativeRecordRevisionId: record.revisionId, remoteInputBindings: [] } }), /EXECUTION_BINDING_INVALID/);
  assert.equal((await recorder.resume()).events.length, 0); assert.equal(posts, 0);
  await recorder.prepared(prepared); await recorder.submit(adapter, prepared); assert.equal(posts, 1);
});
