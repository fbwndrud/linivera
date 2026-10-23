import test from 'node:test';
import assert from 'node:assert/strict';
import { lineageFixture } from '../support/lineage.js';
import { startOperation, submitResult } from '../../core/operations/requests.js';
import { queryResourceGraph } from '../../core/query/resource-graph.js';
import { buildMetadataProjection, metadataEntries, metadataManifest } from '../../core/projections/metadata.js';
import { saveGeneration } from '../../core/projections/manifest.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { queryResources } from '../../core/query/resources.js';
async function submit(f, snapshot, output, key) {
  const request = await startOperation(f.root, { inputSnapshotId: snapshot.inputSnapshotId, idempotencyKey: key, actor: 'user' });
  return submitResult(f.root, { ...request, inputSnapshotId: snapshot.inputSnapshotId, resultRevisionIds: [output.revisionId] });
}
test('an unapproved selected intermediate carries source changes into approved descendants', async (t) => {
  const f = await lineageFixture(t); const intermediate = await f.propose('background', { synthetic: 'unapproved intermediate' });
  await submit(f, await f.input([f.hero]), intermediate, 'unapproved'); await f.select(intermediate);
  const final = await f.propose('panel', { synthetic: 'approved descendant' }); await f.produce([intermediate], final, 'descendant');
  await buildMetadataProjection(f.root);
  const changed = await f.propose('hero', { color: 'red' }, [f.hero.revisionId]); await f.select(changed);
  const graph = await queryResourceGraph(f.root);
  assert.equal(graph.nodes.find((n) => n.revisionId === intermediate.revisionId).reviewRequired, true);
  assert.equal(graph.nodes.find((n) => n.revisionId === final.revisionId).reviewRequired, true);
  const old = await queryResources(f.root, { resourceId: 'panel', freshness: 'allowStale' });
  assert.equal(old.entries.find((e) => e.role === 'output').reviewRequired, true);
});
test('a later submitted producer changes live impact without corrupting the same-checkpoint metadata cache', async (t) => {
  const f = await lineageFixture(t);
  const source = await f.propose('background', { color: 'blue' }); await f.select(source); const input = await f.input([source]);
  const changed = await f.propose('background', { color: 'green' }, [source.revisionId]); await f.select(changed);
  const generation = await buildMetadataProjection(f.root);
  await submit(f, input, f.pose, 'late-producer');
  // A caller can declare a second producer that closes an exact-revision cycle.
  await submit(f, await f.input([f.pose]), f.hero, 'declared-cycle');
  const current = await queryResources(f.root, { resourceId: 'shot' });
  assert.equal(current.manifest.generationId, generation.generationId); assert.equal(current.freshness, 'current');
  assert.equal(current.entries.find((e) => e.role === 'output').reviewRequired, true);
});
test('v2 generations keep their historical approved-only verification but require a v3 refresh', async (t) => {
  const f = await lineageFixture(t); const state = await readWorkspaceState(f.root);
  const entries = await metadataEntries(f.root, state, { includeSubmitted: false });
  await saveGeneration(f.root, metadataManifest(entries, state, 'folio-metadata-v2'), entries);
  await assert.rejects(queryResources(f.root, {}), { code: 'PROJECTION_NOT_CURRENT' });
  assert.equal((await queryResources(f.root, { freshness: 'allowStale' })).freshness, 'stale');
  await buildMetadataProjection(f.root); assert.equal((await queryResources(f.root, {})).freshness, 'current');
});
