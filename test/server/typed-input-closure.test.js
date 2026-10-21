import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../context/fixture.js';
import { connectFolio } from '../support/mcp-client.js';

test('MCP v1 alignment preparation cannot hide unselected or unauthorized source bytes', async (t) => {
  const f = await fixture(t); const folio = await connectFolio(); t.after(() => folio.close());
  const call = (name, args) => folio.call(name, { root: f.root, ...args });
  const select = (revision) => f.store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
  const text = await f.text('text', 'Synthetic narration');
  const audio = await f.store.propose({ resourceId: 'audio', kind: 'production-artifact', owned: { bytes: Buffer.from('Synthetic audio'), mediaType: 'audio/mpeg' } });
  const alignment = await f.json('alignment', 'audio-alignment', { version: 1, audioRevisionId: audio.revisionId, textRevisionId: text.revisionId,
    alignmentKind: 'character', timebase: { unit: 'seconds', origin: 0 }, segments: [] }); await select(alignment);
  const scope = ['alignment', 'audio', 'text']; const definitions = {};
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 100000 }],
    ['pipeline', { version: 1, steps: [{ id: 'continue', capability: 'transform' }] }],
    ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'select-source'] }]]) {
    const revision = await f.json(kind, kind, value); await select(revision); definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  const request = { op: 'prepare', revisionIds: [alignment.revisionId], ...definitions };
  const denied = await call('folio_inputs', request); assert.equal(denied.ok, false); assert.equal(denied.error.code, 'INPUT_INVALID');
  await select(audio); await select(text);
  const prepared = await call('folio_inputs', request); assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.deepEqual(new Set(prepared.result.manifest.resources.map((item) => item.resourceId)), new Set(scope));
  const started = await call('folio_operations', { op: 'start', inputSnapshotId: prepared.result.inputSnapshotId, idempotencyKey: 'aligned-source', actor: 'user' });
  assert.equal(started.ok, true, JSON.stringify(started));
});
