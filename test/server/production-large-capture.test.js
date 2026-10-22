import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { productionFixture } from '../operations/production-fixture.js';
import { productionHost } from '../../examples/support/production-host.js';
import { createProductionRecorder } from '../../server/production/recorder.js';
import { createFalAdapter } from '../../adapters/production/fal.js';
import { createElevenLabsAdapter } from '../../adapters/production/elevenlabs.js';
import { sha256 } from '../../core/util/hash.js';

for (const audioSize of [0, 4000000, 9 * 1024 * 1024]) test(`MCP retains ${audioSize ? `${audioSize}-byte synchronous audio` : '9MB fal file'} and recovers exact bytes after restart`, async (t) => {
  const speech = audioSize > 0;
  const f = await productionFixture(t); const host = await productionHost(f.root); t.after(() => host.close());
  const bytes = Buffer.alloc(audioSize || 9 * 1024 * 1024, 42); const contentHash = sha256(bytes);
  const path = join(f.root, 'synthetic-output'); if (!speech) await writeFile(path, bytes);
  const text = 'synthetic source';
  const value = { ...f.requestValue, provider: speech ? 'elevenlabs' : 'fal',
    endpoint: speech ? '/v1/text-to-speech/fixture/with-timestamps' : 'fal-ai/flux/schnell', capability: speech ? 'text-to-speech' : 'text-to-image',
    parameters: speech ? { text } : { prompt: text }, inputBindings: [{ fieldPath: speech ? 'text' : 'prompt', role: 'source', revisionId: f.source.revisionId }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: speech ? [
      { role: 'audio', required: true, acceptableMediaTypes: ['audio/mpeg'] }, { role: 'alignment', required: true, acceptableMediaTypes: ['application/json'] },
    ] : [{ role: 'image', required: true, acceptableMediaTypes: ['image/png'] }] }] } };
  const request = await host.json('request', value, 'generation-request'); await f.select(request);
  const snapshot = await host.call('folio_inputs', { op: 'prepare', revisionIds: [f.source.revisionId, request.revisionId],
    profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, policyRevisionId: f.ids.policy });
  const operation = await host.call('folio_operations', { op: 'start', ...f.start, inputSnapshotId: snapshot.inputSnapshotId, requestRevisionId: request.revisionId });
  let posts = 0;
  const transport = { submit: async () => { posts++; return { request_id: 'large-file' }; }, status: async () => ({}),
    result: async () => ({ images: [{ url: 'https://example.invalid/expired-image', content_type: 'image/png' }] }), download: async () => ({ path, contentHash }),
    captureAudio: async (observed) => { await writeFile(path, observed); return { path }; },
    convertWithTimestamps: async () => { posts++; return { request_id: 'large-audio', audio_base64: bytes.toString('base64'),
      alignment: { characters: [text], character_start_times_seconds: [0], character_end_times_seconds: [50] } }; } };
  const adapter = (speech ? createElevenLabsAdapter : createFalAdapter)({ accountAlias: 'fixture', transport });
  const prepared = await adapter.prepare(value, [{ revisionId: f.source.revisionId, mediaType: 'text/plain', bytes: Buffer.from(text) }]);
  const recorder = createProductionRecorder({ call: host.call, root: f.root, operationId: operation.operationId, executionId: 'first' });
  await recorder.prepared(prepared); const submission = await recorder.submit(adapter, prepared);
  const collection = await adapter.collect(submission.handle);
  const captured = await recorder.collect(prepared, collection, { inputSnapshotId: snapshot.inputSnapshotId });
  assert.equal(captured.groups.length, 1); assert.equal(captured.artifacts[0].contentHash, contentHash);
  assert.equal(captured.artifacts[0].byteLength, bytes.length);
  if (!speech) {
    for (const length of [6 * 1024 * 1024 + 1, 8 * 1024 * 1024, bytes.length]) {
      await assert.rejects(recorder.collect(prepared, { artifacts: [{ ...collection.artifacts[0], bytes: Buffer.alloc(length), path: undefined }], nativeRecords: [] },
        { inputSnapshotId: snapshot.inputSnapshotId }), { code: 'PRODUCTION_CAPTURE_INVALID' });
    }
  }
  if (collection.artifacts[0].path) await rm(path);
  await host.restart();
  const restored = await host.call('folio_resources', { op: 'describe', revisionId: captured.artifacts[0].revisionId });
  assert.equal(restored.revision.contentHash, contentHash); assert.equal(restored.revision.byteLength, bytes.length);
  assert.equal((await recorder.resume()).executions[0].artifacts.length, speech ? 2 : 1); assert.equal(posts, 1);
});
