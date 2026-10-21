import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lineageFixture } from '../support/lineage.js';
import { buildGraphIndex } from '../../core/query/graph-index.js';
import { queryResourceGraph } from '../../core/query/resource-graph.js';

test('explicit graph index finds related revisions and revalidates returned files without claiming global content coverage', async (t) => {
  const f = await lineageFixture(t);
  const unrelated = await f.propose('background', { synthetic: 'unrelated' });
  const index = await buildGraphIndex(f.root);
  await writeFile(join(f.root, '.folio/resources/content', unrelated.contentHash.slice(7) + '.bin'), 'corrupted');
  const scoped = await queryResourceGraph(f.root, { generationId: index.generationId, resourceId: 'hero', direction: 'downstream' });
  assert.ok(scoped.nodes.some((n) => n.revisionId === f.shot.revisionId));
  assert.equal(scoped.coverage.contentVerification, 'returned-scope-verified');
  assert.equal(scoped.coverage.discoveryComplete, false);
  assert.ok(scoped.coverage.unknown.some((item) => item.reason === 'indexed-discovery-only'));
  await assert.rejects(queryResourceGraph(f.root, { generationId: index.generationId, resourceId: 'background' }), { code: 'RESOURCE_INTEGRITY_FAILURE' });
  await assert.rejects(queryResourceGraph(f.root), { code: 'RESOURCE_INTEGRITY_FAILURE' });
});

test('graph index refuses a changed authoritative catalog rather than serving a silently incomplete view', async (t) => {
  const f = await lineageFixture(t); const index = await buildGraphIndex(f.root);
  await f.propose('new-source', { synthetic: 'new' });
  await assert.rejects(queryResourceGraph(f.root, { generationId: index.generationId }), { code: 'RESOURCE_GRAPH_INDEX_STALE' });
});
