import test from 'node:test';
import assert from 'node:assert/strict';
import { lineageFixture } from '../support/lineage.js';
import { queryResourceGraph } from '../../core/query/resource-graph.js';

test('graph pages retain cross-page connections and cursors bind the exact view', async (t) => {
  const f = await lineageFixture(t); const all = await queryResourceGraph(f.root);
  const ids = new Set(); const edges = new Set(); let cursor;
  do {
    const page = await queryResourceGraph(f.root, { limit: 2, ...(cursor ? { cursor } : {}) });
    assert.ok(page.nodes.length <= 2);
    for (const node of page.nodes) { assert.ok(!ids.has(node.id)); ids.add(node.id); }
    for (const edge of [...page.edges, ...page.boundaryEdges]) edges.add(edge.id);
    assert.equal(page.coverage.contentVerification, 'verified');
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual([...ids].sort(), all.nodes.map((n) => n.id).sort());
  assert.deepEqual([...edges].sort(), all.edges.map((e) => e.id).sort());
  const first = await queryResourceGraph(f.root, { limit: 2 });
  const changed = await f.propose('hero', { color: 'green' }, [f.hero.revisionId]); await f.select(changed);
  await assert.rejects(queryResourceGraph(f.root, { limit: 2, cursor: first.nextCursor }), { code: 'RESOURCE_GRAPH_CURSOR_STALE' });
});
