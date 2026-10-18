import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scanMentions } from '../../core/index/scan.js';
import { openWork } from '../../core/store/work.js';
import { gatherScope } from '../../core/scope/scope.js';
import { candidatesFor } from '../../core/occurrences/candidates.js';
import { rebuildIndex } from '../../core/index/rebuild.js';
import { openIndex, usagesOf } from '../../core/index/query.js';
import { copyFixture } from '../support/fixtures.js';

const IDS = ['a-place', 'z-sword'];
async function homonyms() {
  const root = await copyFixture('novel-3level');
  for (const [kind, id] of [['location', IDS[0]], ['weapon', IDS[1]]]) {
    await mkdir(join(root, 'entities', kind), { recursive: true });
    await writeFile(join(root, 'entities', kind, `${id}.md`), `---\nid: ${id}\nkind: ${kind}\nname: 백야\naliases: [흰밤, 백야]\n---\n`);
  }
  return root;
}

test('homonymous names and aliases never pick an ID by iteration order', async () => {
  const root = await homonyms(); const work = await openWork(root);
  for (const entities of [work.entities.values(), [...work.entities.values()].reverse()]) {
    assert.deepEqual([...scanMentions('백야와 흰밤.', entities)], []);
  }
  const scope = gatherScope({ work, events: [], nodeId: 'market', draftText: '백야를 휘둘렀다.' });
  assert.deepEqual(scope.entityIds, IDS, 'both candidates remain in conservative review scope');
  assert.deepEqual(scope.ambiguousReferences, [{ quote: '백야', start: 0, entityIds: IDS }]);
  const marked = candidatesFor({ ...work, tree: { ...work.tree, nodes: new Map([...work.tree.nodes].map(([id, n]) => [id, id === 'market' ? { ...n, body: '백야를 휘둘렀다.' } : n])) } }, [], { kind: 'node', id: 'market' });
  assert.deepEqual(marked.map((m) => m.entityId), IDS);
  assert.ok(marked.every((m) => m.ambiguous && m.candidateIds.join() === IDS.join()));
});

test('the rebuilt usage index labels homonymous hits as ambiguous for every candidate', async () => {
  const root = await homonyms(); const work = await openWork(root);
  const node = work.tree.nodes.get('market');
  await writeFile(join(root, 'tree', node.path), node.fileText + '\n백야를 휘둘렀다.\n');
  await rebuildIndex(root); const db = openIndex(root);
  try {
    for (const id of IDS) {
      assert.ok(usagesOf(db, id).some((u) => u.surfaceId === 'market' && u.origin === 'ambiguous'));
      assert.ok(!usagesOf(db, id).some((u) => u.surfaceId === 'market' && u.origin === 'scan'));
    }
  } finally { db.close(); }
});
