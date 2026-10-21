import test from 'node:test';
import assert from 'node:assert/strict';
import { createFalAdapter } from '../../../adapters/production/fal.js';
import { createElevenLabsAdapter } from '../../../adapters/production/elevenlabs.js';
import { sha256 } from '../../../core/util/hash.js';

const outputSpec = { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: [] }] };
test('valid multi-megabyte synchronous audio survives canonical base64 validation and remains collectable', async () => {
  const audio = Buffer.alloc(4000000, 42);
  const request = { version: 1, provider: 'elevenlabs', endpoint: '/v1/text-to-speech/fixture/with-timestamps', capability: 'text-to-speech',
    parameters: { text: 'Synthetic speech' }, inputBindings: [], outputSpec };
  const adapter = createElevenLabsAdapter({ accountAlias: 'fixture', transport: { convertWithTimestamps: async () => ({ audio_base64: audio.toString('base64') }) } });
  const submission = await adapter.submit(await adapter.prepare(request));
  assert.equal(submission.status, 'complete');
  assert.deepEqual((await adapter.collect(submission.handle)).artifacts[0].bytes, audio);
});

test('large synchronous speech remains recoverable without another generation after a missing or invalid file sink', async () => {
  const bytes = Buffer.alloc(9 * 1024 * 1024, 42); let posts = 0;
  const transport = { captureAudio: null, convertWithTimestamps: async () => { posts++; return { audio_base64: bytes.toString('base64') }; } };
  const adapter = createElevenLabsAdapter({ accountAlias: 'fixture', transport });
  const request = { version: 1, provider: 'elevenlabs', endpoint: '/v1/text-to-speech/fixture/with-timestamps', capability: 'text-to-speech',
    parameters: { text: 'Synthetic large speech' }, inputBindings: [], outputSpec };
  const submission = await adapter.submit(await adapter.prepare(request)); assert.equal(submission.status, 'complete');
  await assert.rejects(adapter.collect(submission.handle), { code: 'PRODUCTION_INPUT_INVALID' });
  assert.equal((await adapter.inspect(submission.handle)).status, 'complete');
  transport.captureAudio = async () => { throw new Error('Synthetic sink interruption'); };
  await assert.rejects(adapter.collect(submission.handle), /Synthetic sink interruption/);
  transport.captureAudio = async () => ({ path: '/tmp/synthetic-speech.mp3', contentHash: `sha256:${'f'.repeat(64)}` });
  await assert.rejects(adapter.collect(submission.handle), { code: 'PRODUCTION_INPUT_INVALID' });
  transport.captureAudio = async () => ({ path: '/tmp/synthetic-speech.mp3' });
  const recovered = await adapter.collect(submission.handle);
  assert.equal(recovered.artifacts[0].contentHash, sha256(bytes)); assert.equal(posts, 1);
});
test('fal accepts large local file descriptors and refuses oversized inline bytes before MCP encoding', async () => {
  let download = { path: '/tmp/synthetic-large-image.png', contentHash: `sha256:${'a'.repeat(64)}` };
  const request = { version: 1, provider: 'fal', endpoint: 'fal-ai/flux/schnell', capability: 'text-to-image', parameters: { prompt: 'Synthetic image' }, inputBindings: [], outputSpec };
  const adapter = createFalAdapter({ accountAlias: 'fixture', transport: {
    submit: async () => ({ request_id: 'file-task' }), status: async () => ({}),
    result: async () => ({ images: [{ url: 'https://example.invalid/image', content_type: 'image/png' }] }), download: async () => download,
  } });
  const { handle } = await adapter.submit(await adapter.prepare(request));
  assert.equal((await adapter.collect(handle)).artifacts[0].path, download.path);
  for (const length of [6 * 1024 * 1024 + 1, 8 * 1024 * 1024, 8 * 1024 * 1024 + 1]) {
    download = Buffer.alloc(length);
    await assert.rejects(adapter.collect(handle), { code: 'PRODUCTION_INPUT_INVALID' });
  }
});
