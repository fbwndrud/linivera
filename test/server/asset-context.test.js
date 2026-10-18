import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { setupAssets } from '../support/assets.js';
import { openWork } from '../../core/store/work.js';
import { gatherScope } from '../../core/scope/scope.js';

async function character(s) {
  await mkdir(join(s.root, 'entities', 'character'), { recursive: true });
  const path = join(s.root, 'entities', 'character', 'toy.md');
  await writeFile(path, '---\nid: toy\nkind: character\nname: 합성인물\n---\n파란 옷.\n');
  return path;
}

test('changing or deleting a reviewed entity invalidates current approval and requires a new review', async () => {
  const s = await setupAssets(); const path = await character(s);
  let a = s.ok(await s.asset({ op: 'add', id: 'toy-image', brief: { entities: ['toy'] } })).asset;
  a = await s.approve(await s.review(await s.put(a)));
  const history = (await s.get()).history;
  await writeFile(path, (await readFile(path, 'utf8')).replace('파란', '빨간'));
  const current = (await s.get()).asset;
  assert.equal(current.approved, false); assert.equal(current.status, 'review_stale');
  assert.notEqual(current.rev, a.rev);
  assert.deepEqual((await s.get()).history, history, 'history is never rewritten');
  assert.equal((await s.asset({ op: 'decide', id: a.id, expectedRev: current.rev, reviewId: a.review.reviewId, action: 'approve' })).error.code, 'ASSET_REVIEW_STALE');
  a = await s.approve(await s.review(current)); assert.equal(a.approved, true);
  await unlink(path); assert.equal((await s.get()).asset.approved, false);
});

test('an explicit asset scope limits automatic and direct scene references', async () => {
  const s = await setupAssets(); await character(s);
  s.ok(await s.call('folio_structure', { op: 'add', level: 'scene', id: 'scene-b' }));
  let a = s.ok(await s.asset({ op: 'add', id: 'toy-image', brief: { entities: ['toy'], scope: { nodeIds: ['toy-scene'] } } })).asset;
  a = await s.put(a);
  const work = await openWork(s.root);
  const scope = (nodeId, draftText = '합성인물.') => gatherScope({ work, events: [], nodeId, draftText });
  assert.deepEqual(scope('scene-b').assets, []);
  assert.deepEqual(scope('toy-scene').assets.map((a) => a.id), ['toy-image']);
  assert.throws(() => scope('scene-b', '![[asset:toy-image]]'), { code: 'ASSET_SCOPE_MISMATCH' });
  assert.equal((await s.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: ['scene-b'] })).error.code, 'ASSET_SCOPE_MISMATCH');
  assert.equal((await s.asset({ op: 'add', id: 'invalid-scope', brief: { scope: { nodeIds: ['missing'] } } })).error.code, 'ASSET_INPUT_INVALID');
});
