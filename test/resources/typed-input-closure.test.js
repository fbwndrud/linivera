import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';

test('v1 alignment and normalization inputs enforce nested selection, scope and byte budgets', async (t) => {
  const f = await scopedFixture(t);
  const text = await f.resource('text', 'Synthetic retained narration');
  const normalized = await f.resource('normalized', 'Synthetic normalized narration');
  const audio = await f.store.propose({ resourceId: 'audio', kind: 'production-artifact', owned: { bytes: Buffer.alloc(12000), mediaType: 'audio/mpeg' } });
  const map = await f.resource('map', { version: 1, textRevisionId: text.revisionId, normalizedTextRevisionId: normalized.revisionId,
    indexUnit: 'unicode-code-points', segments: [] }, 'normalization-map');
  const alignment = await f.resource('alignment', { version: 1, audioRevisionId: audio.revisionId, textRevisionId: text.revisionId,
    normalizedTextRevisionId: normalized.revisionId, normalizationMapRevisionId: map.revisionId,
    alignmentKind: 'character', timebase: { unit: 'seconds', origin: 0 }, segments: [] }, 'audio-alignment');
  const scope = ['alignment', 'map', 'audio', 'text', 'normalized'];
  async function definitions(allowed, maxInputBytes = 100000) {
    const ids = { pipelineRevisionId: f.definitions.pipelineRevisionId };
    for (const [kind, value] of [['profile', { version: 1, scope: allowed, maxInputBytes }],
      ['policy', { version: 1, scope: allowed, allowedActions: ['create-candidate', 'select-source'] }]]) {
      const revision = await f.resource(kind, value, kind); await f.select(revision); ids[kind + 'RevisionId'] = revision.revisionId;
    }
    return ids;
  }
  const all = await definitions(scope);
  await f.select(alignment); await f.select(map);
  for (const revision of [alignment, map]) await assert.rejects(prepareInput(f.root, { revisionIds: [revision.revisionId], ...all }), { code: 'INPUT_INVALID' });
  for (const revision of [audio, text, normalized]) await f.select(revision);
  const outside = await definitions(['alignment', 'map']);
  await assert.rejects(prepareInput(f.root, { revisionIds: [alignment.revisionId], ...outside }), { code: 'INPUT_INVALID' });
  const small = await definitions(scope, 10000);
  await assert.rejects(prepareInput(f.root, { revisionIds: [alignment.revisionId], ...small }), { code: 'INPUT_INVALID' });
  const complete = await prepareInput(f.root, { revisionIds: [alignment.revisionId], ...await definitions(scope) });
  assert.equal(complete.manifest.referenceClosureVersion, 1);
  assert.deepEqual(new Set(complete.manifest.resources.map((item) => item.resourceId)), new Set(scope));
  assert.ok(complete.manifest.totalBytes >= audio.byteLength);
});
