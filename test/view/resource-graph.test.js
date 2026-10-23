import test from 'node:test';
import assert from 'node:assert/strict';
import * as view from '../../core/view/index.js';
import { buildSnapshot } from '../../core/view/snapshot.js';
import { lineageFixture } from '../support/lineage.js';
import { sourceSnapshot } from '../support/export-work.js';

test('resource lineage is available read-only in resource-only live and exported viewers', async (t) => {
  assert.equal(typeof view.viewResourceGraph, 'function', 'viewer must expose the shared lineage');
  const f = await lineageFixture(t); const before = await sourceSnapshot(f.root);
  const graph = await view.viewResourceGraph(f.root);
  assert.ok(graph.nodes.some((n) => n.revisionId === f.shot.revisionId)); assert.ok(graph.edges.some((e) => e.kind === 'input'));
  const outline = await view.viewOutline(f.root, { packs: new Map() }); assert.ok(outline.availableScreens.includes('graph'));
  const snapshot = await buildSnapshot(f.root, { packs: new Map() }); assert.deepEqual(snapshot.resourceGraph, graph);
  assert.deepEqual(await sourceSnapshot(f.root), before);
});
