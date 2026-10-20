import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { lineageFixture } from '../support/lineage.js';
import { buildMetadataProjection, metadataEntries, metadataManifest } from '../../core/projections/metadata.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { saveGeneration } from '../../core/projections/manifest.js';
import { queryResources } from '../../core/query/resources.js';
import { resourceQueryTool } from '../../server/tools/resource-query.js';

test('changing a character marks its pose and downstream shot without rewriting pinned inputs', async (t) => {
  const f = await lineageFixture(t);
  const next = await f.propose('hero', { color: 'green' }, [f.hero.revisionId]); await f.select(next);
  await buildMetadataProjection(f.root);
  const entries = (await queryResources(f.root, {})).entries.filter((e) => e.role === 'output');
  assert.equal(entries.find((e) => e.resourceId === 'pose').reviewRequired, true);
  const shot = entries.find((e) => e.resourceId === 'shot');
  assert.equal(shot.reviewRequired, true);
  assert.equal(shot.inputRefs[0].revisionId, f.pose.revisionId);
  assert.ok(shot.reviewReasons.some((r) => r.reason === 'upstream-review-required'));
});

test('one pose revision is shared by two workflows in the same verified resource graph', async (t) => {
  const f = await lineageFixture(t);
  const panel = await f.propose('panel', { synthetic: 'comic panel' }); await f.produce([f.pose], panel, 'panel');
  const candidate = await f.propose('unselected', { synthetic: true });
  const rejected = await f.propose('rejected', { synthetic: true }); await f.produce([f.hero], rejected, 'reject', 'reject');
  const graph = await resourceQueryTool(f.root, { op: 'graph' });
  assert.equal(graph.nodes.filter((n) => n.revisionId === f.pose.revisionId).length, 1);
  for (const revision of [f.hero, f.pose, f.shot, panel, candidate, rejected]) assert.ok(graph.nodes.some((n) => n.revisionId === revision.revisionId));
  assert.ok(graph.nodes.find((n) => n.revisionId === rejected.revisionId).states.includes('rejected'));
  assert.ok(graph.nodes.find((n) => n.revisionId === candidate.revisionId).states.includes('candidate'));
  const downstream = await resourceQueryTool(f.root, { op: 'graph', resourceId: 'pose', direction: 'downstream' });
  assert.ok(downstream.nodes.some((n) => n.revisionId === panel.revisionId));
  assert.ok(downstream.nodes.some((n) => n.revisionId === f.shot.revisionId));
  assert.equal(downstream.nodes.some((n) => n.revisionId === f.hero.revisionId), false);
  const limited = await resourceQueryTool(f.root, { op: 'graph', resourceId: 'pose', depth: 1, limit: 2 });
  assert.equal(limited.truncated, true); assert.ok(limited.nodes.length <= 2);
});

test('graph refuses corrupted or linked retained resource bytes', async (t) => {
  const f = await lineageFixture(t);
  const path = join(f.root, '.folio', 'resources', 'content', f.pose.contentHash.slice(7) + '.bin');
  const original = await f.store.readContent(f.pose.revisionId);
  await writeFile(path, 'damaged');
  await assert.rejects(resourceQueryTool(f.root, { op: 'graph' }), { code: 'RESOURCE_INTEGRITY_FAILURE' });
  await writeFile(path, original);
  const target = join(f.root, '.folio', 'resources', 'revisions', 'a'.repeat(64) + '.json');
  await symlink(path, target);
  await assert.rejects(resourceQueryTool(f.root, { op: 'graph' }), { code: 'MANAGED_PATH_UNSAFE' });
});

test('legacy metadata remains readable as stale and refresh selects the current generator at the same checkpoint', async (t) => {
  const f = await lineageFixture(t); const state = await readWorkspaceState(f.root);
  const oldEntries = await metadataEntries(f.root, state, { transitive: false });
  await saveGeneration(f.root, metadataManifest(oldEntries, state, 'folio-metadata-v1'), oldEntries);
  await assert.rejects(queryResources(f.root, {}), { code: 'PROJECTION_NOT_CURRENT' });
  assert.equal((await queryResources(f.root, { freshness: 'allowStale' })).freshness, 'stale');
  await buildMetadataProjection(f.root);
  assert.equal((await queryResources(f.root, {})).freshness, 'current');
});
