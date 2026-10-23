import test from 'node:test';
import assert from 'node:assert/strict';
import { createElevenLabsAdapter } from '../../../adapters/production/elevenlabs.js';

const textRevisionId = `sha256:${'b'.repeat(64)}`;
function request() {
  return {
    version: 1, provider: 'elevenlabs', product: 'tts', endpoint: '/v1/text-to-speech/fixture-voice/with-timestamps',
    capability: 'text-to-speech', schemaVersion: '2026-10-22', parameters: { text: 'Hi', output_format: 'mp3_44100_128', voice_settings: { stability: 0.4 } },
    inputBindings: [{ fieldPath: 'text', revisionId: textRevisionId, role: 'dialogue' }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'speech', slots: [
      { role: 'audio', required: true, acceptableMediaTypes: ['audio/mpeg'] },
      { role: 'alignment', required: true, acceptableMediaTypes: ['application/json'] },
    ] }] },
  };
}
const timing = { characters: ['H', 'i'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.3] };

test('speech and character timing retain original and normalized text in one candidate group', async () => {
  const calls = [];
  const adapter = createElevenLabsAdapter({ accountAlias: 'fixture', transport: {
    convertWithTimestamps: async (...args) => { calls.push(args); return { requestId: 'speech-job', data: {
      audio_base64: Buffer.from('synthetic-audio').toString('base64'), alignment: timing,
      normalized_alignment: { ...timing, characters: ['h', 'i'] },
    } }; },
  } });
  const prepared = await adapter.prepare(request(), [{ revisionId: textRevisionId, mediaType: 'text/plain', bytes: Buffer.from('Hi') }]);
  const submitted = await adapter.submit(prepared);
  assert.equal(submitted.status, 'complete');
  assert.equal((await adapter.inspect(submitted.handle)).status, 'complete');
  const collected = await adapter.collect(submitted.handle);
  assert.deepEqual(calls[0], ['fixture-voice', { text: 'Hi', voice_settings: { stability: 0.4 } }, { output_format: 'mp3_44100_128' }]);
  assert.deepEqual(collected.artifacts.map((item) => item.role), ['audio', 'alignment']);
  assert.ok(collected.artifacts.every((item) => item.groupId === 'speech'));
  const alignment = JSON.parse(collected.artifacts[1].bytes.toString());
  assert.equal(alignment.original.text, 'Hi');
  assert.equal(alignment.normalized.text, 'hi');
  assert.equal(alignment.textRevisionId, textRevisionId);
  assert.equal(alignment.audioResourceId, collected.artifacts[0].resourceId);
  assert.equal(alignment.original.segments[1].end, 0.3);
  assert.equal(collected.artifacts[1].metadata.sourceArtifactKey, 'audio');
  assert.equal(collected.nativeRecords[0].record.data.audio_base64, '[redacted]');
  assert.equal(collected.artifacts[0].bytes.toString(), 'synthetic-audio');
});

test('synchronous handles omit raw audio and secrets while timing stays bound to its actual input', async () => {
  const adapter = createElevenLabsAdapter({ accountAlias: 'fixture', transport: {
    convertWithTimestamps: async () => ({ data: { audio_base64: Buffer.from('synthetic-secret-audio').toString('base64'), alignment: timing }, headers: { 'xi-api-key': 'synthetic-private-key' } }),
  } });
  const prepared = await adapter.prepare(request(), [{ revisionId: textRevisionId, mediaType: 'text/plain', bytes: Buffer.from('Hi') }]);
  const submitted = await adapter.submit(prepared);
  const serialized = JSON.stringify(submitted);
  assert.ok(!serialized.includes('synthetic-private-key'));
  assert.ok(!serialized.includes(Buffer.from('synthetic-secret-audio').toString('base64')));
  const collected = await adapter.collect(JSON.parse(JSON.stringify(submitted.handle)));
  assert.equal(collected.artifacts[0].bytes.toString(), 'synthetic-secret-audio');
  assert.ok(collected.unavailableFields.includes('providerJobId'));
  await assert.rejects(adapter.prepare({ ...request(), parameters: { text: 'Changed' } }, [{ revisionId: textRevisionId, mediaType: 'text/plain', bytes: Buffer.from('Hi') }]), { code: 'PRODUCTION_INPUT_INVALID' });
});

test('missing character timing stays partial and malformed timing is rejected', async () => {
  let alignment = null;
  const adapter = createElevenLabsAdapter({ accountAlias: 'fixture', transport: {
    convertWithTimestamps: async () => ({ data: { audio_base64: Buffer.from('synthetic-audio').toString('base64'), alignment } }),
  } });
  const artifacts = [{ revisionId: textRevisionId, mediaType: 'text/plain', bytes: Buffer.from('Hi') }];
  const submitted = await adapter.submit(await adapter.prepare(request(), artifacts));
  const partial = await adapter.collect(submitted.handle);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.artifacts.map((item) => item.role), ['audio']);
  assert.ok(partial.unavailableFields.includes('alignment'));
  alignment = { ...timing, character_end_times_seconds: [0.1] };
  const malformed = await adapter.submit(await adapter.prepare(request(), artifacts));
  await assert.rejects(adapter.collect(malformed.handle), { code: 'PRODUCTION_INPUT_INVALID' });
});
