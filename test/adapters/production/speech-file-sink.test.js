import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElevenLabsAdapter } from '../../../adapters/production/elevenlabs.js';
import { importResourceFile } from '../../../core/resources/intake.js';
import { sha256 } from '../../../core/util/hash.js';

const request = { version: 1, provider: 'elevenlabs', endpoint: '/v1/text-to-speech/fixture/with-timestamps', capability: 'text-to-speech',
  parameters: { text: 'Hi' }, inputBindings: [], outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: [] }] } };
const bytes = Buffer.alloc(9 * 1024 * 1024, 42);
const response = () => ({ audio_base64: bytes.toString('base64'), alignment: { characters: ['H', 'i'], character_start_times_seconds: [0, 1], character_end_times_seconds: [1, 2] } });

test('a mutating speech sink cannot redefine the original response fingerprint', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'linivera-speech-sink-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'changed.mp3');
  const adapter = createElevenLabsAdapter({ accountAlias: 'fixture', transport: { convertWithTimestamps: async () => response(),
    captureAudio: async (audio) => { audio[0] = 43; await writeFile(path, audio); return { path }; } } });
  const { handle } = await adapter.submit(await adapter.prepare(request));
  const artifact = (await adapter.collect(handle, ['audio'])).artifacts[0];
  assert.equal(artifact.contentHash, sha256(bytes));
  await assert.rejects(importResourceFile(root, { resourceId: artifact.resourceId, kind: 'production-artifact', path: artifact.path,
    contentHash: artifact.contentHash, mediaType: artifact.mediaType }), { code: 'RESOURCE_HASH_MISMATCH' });
});

test('late alignment-only capture never depends on the audio file sink', async () => {
  let available = true; let writes = 0;
  const adapter = createElevenLabsAdapter({ accountAlias: 'fixture', transport: { convertWithTimestamps: async () => response(),
    captureAudio: async () => { writes++; if (!available) throw new Error('Sink offline'); return { path: '/tmp/synthetic-speech.mp3' }; } } });
  const { handle } = await adapter.submit(await adapter.prepare(request));
  const audio = (await adapter.collect(handle, ['audio'])).artifacts[0]; available = false;
  const alignment = (await adapter.collect(handle, ['alignment'])).artifacts[0];
  assert.equal(alignment.role, 'alignment'); assert.equal(alignment.metadata.sourceArtifactKey, 'audio');
  assert.equal(JSON.parse(alignment.bytes).audioResourceId, audio.resourceId); assert.equal(writes, 1);
});
