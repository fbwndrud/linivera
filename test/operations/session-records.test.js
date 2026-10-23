import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordSessionObservation, readSessionRecords, sessionResourceValue, readSessionRelations } from '../../core/operations/session-records.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { resourceObjectPath } from '../../core/resources/files.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'linivera-session-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root); let head = null;
  const append = async (event) => { const result = await recordSessionObservation(root, { sessionId: 'synthetic-live', expectedHead: head, event }); head = result.sessionHead; return result; };
  const command = await store.propose({ resourceId: 'command', kind: 'session-command', owned: { bytes: '{"command":"synthetic turn"}', mediaType: 'application/json' } });
  const media = await store.propose({ resourceId: 'track', kind: 'session-media', owned: { bytes: Buffer.from('synthetic media chunk'), mediaType: 'application/octet-stream' } });
  await append({ type: 'opened', version: 1, timebase: { unit: 'seconds', origin: 0 } });
  return { root, store, append, command, media };
}
test('session observations preserve ordered commands, media intervals and explicit gaps across restart', async (t) => {
  const f = await fixture(t);
  await f.append({ type: 'observation-window', start: 0, end: 12 });
  await f.append({ type: 'command', order: 1, at: 1, revisionId: f.command.revisionId });
  await f.append({ type: 'command-gap', fromOrder: 2, toOrder: 3, reason: 'Two commands were not observed' });
  await f.append({ type: 'command', order: 4, at: 3, revisionId: f.command.revisionId });
  await f.append({ type: 'media', trackId: 'video', start: 0, end: 5, revisionId: f.media.revisionId, contentHash: f.media.contentHash });
  const prefix = (await readSessionRecords(f.root, { sessionId: 'synthetic-live' })).sessionHead;
  await f.append({ type: 'gap', trackId: 'video', start: 5, end: 12, reason: 'No retained frames' });
  const result = await readSessionRecords(f.root, { sessionId: 'synthetic-live' });
  assert.equal(result.nextCommandOrder, 5); assert.equal(result.intervals.length, 1); assert.equal(result.gaps.length, 2);
  assert.equal(result.restorability, 'unknown'); assert.equal(result.observation, 'host-reported');
  assert.equal((await readSessionRecords(f.root, { sessionId: 'synthetic-live', sessionHead: prefix })).gaps.length, 1);
  await assert.rejects(() => recordSessionObservation(f.root, { sessionId: 'synthetic-live', expectedHead: prefix,
    event: { type: 'command', order: 5, at: 4, revisionId: f.command.revisionId } }), { code: 'SESSION_HEAD_CONFLICT' });
});
test('session rejects undeclared command gaps, wrong hashes and media that contradict an explicit gap', async (t) => {
  const f = await fixture(t);
  await assert.rejects(() => f.append({ type: 'command', order: 2, at: 0, revisionId: f.command.revisionId }), { code: 'SESSION_INVALID' });
  await assert.rejects(() => f.append({ type: 'media', trackId: 'video', start: 0, end: 1, revisionId: f.media.revisionId, contentHash: `sha256:${'0'.repeat(64)}` }), { code: 'SESSION_INVALID' });
  await f.append({ type: 'gap', trackId: 'video', start: 0, end: 2, reason: 'Not observed' });
  await assert.rejects(() => f.append({ type: 'media', trackId: 'video', start: 1, end: 2, revisionId: f.media.revisionId, contentHash: f.media.contentHash }), { code: 'SESSION_INVALID' });
});
test('session reads verify retained file bytes instead of trusting metadata-only observations', async (t) => {
  const f = await fixture(t);
  await f.append({ type: 'media', trackId: 'audio', start: 0, end: 1, revisionId: f.media.revisionId, contentHash: f.media.contentHash });
  await writeFile(resourceObjectPath(f.root, f.media.contentHash, 'content'), 'damaged synthetic content');
  await assert.rejects(() => readSessionRecords(f.root, { sessionId: 'synthetic-live' }), { code: 'RESOURCE_INTEGRITY_FAILURE' });
});
test('typed session Resources connect only the exact command and media revisions from a verified prefix', async (t) => {
  const f = await fixture(t);
  await f.append({ type: 'command', order: 1, at: 0, revisionId: f.command.revisionId });
  await f.append({ type: 'media', trackId: 'video', start: 0, end: 1, revisionId: f.media.revisionId, contentHash: f.media.contentHash });
  const value = sessionResourceValue(await readSessionRecords(f.root, { sessionId: 'synthetic-live' }));
  const save = (resourceId, content) => f.store.propose({ resourceId, kind: 'session-record', owned: { bytes: JSON.stringify(content), mediaType: 'application/json' } });
  const revision = await save('session-manifest', value);
  assert.deepEqual(await readSessionRelations(f.root, revision), [
    { targetRevisionId: f.command.revisionId, kind: 'session-command' }, { targetRevisionId: f.media.revisionId, kind: 'session-artifact' },
  ]);
  value.media[0].revisionId = f.command.revisionId;
  await assert.rejects(() => save('invalid-session', value).then((result) => readSessionRelations(f.root, result)), { code: 'SESSION_INVALID' });
});
