import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lineageFixture } from '../support/lineage.js';
import { productionFixture } from '../operations/production-fixture.js';
import { observeGroups } from '../operations/group-fixture.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { buildGraphIndex } from '../../core/query/graph-index.js';
import { queryResourceGraph } from '../../core/query/resource-graph.js';
import { importResourceFile } from '../../core/resources/intake.js';
import { scopedFixture } from './scoped-fixture.js';
import { selectInput } from '../../core/resources/input-selections.js';
async function forged(root, generationId, mutate) {
  const value = JSON.parse(await readFile(join(root, '.folio/projections/graph', generationId.slice(7) + '.json'), 'utf8'));
  mutate(value.graph); const bytes = canonicalJson(value); const id = sha256(bytes);
  await writeFile(join(root, '.folio/projections/graph', id.slice(7) + '.json'), bytes); return id;
}
test('self-consistent indexes cannot multiply nodes beyond the requested page budget', async (t) => {
  const f = await lineageFixture(t); const index = await buildGraphIndex(f.root);
  const generationId = await forged(f.root, index.generationId, (graph) => graph.nodes.push({ ...graph.nodes[0] }));
  await assert.rejects(queryResourceGraph(f.root, { generationId, limit: 1 }), { code: 'RESOURCE_GRAPH_INDEX_INVALID' });
});
test('indexed relationships cannot carry invented metadata or nonexistent causal edges', async (t) => {
  const f = await lineageFixture(t); const index = await buildGraphIndex(f.root);
  let generationId = await forged(f.root, index.generationId, (graph) => { graph.edges[0].approved = true; });
  await assert.rejects(queryResourceGraph(f.root, { generationId }), { code: 'RESOURCE_GRAPH_INDEX_INVALID' });
  generationId = await forged(f.root, index.generationId, (graph) => {
    const source = 'revision:' + f.hero.revisionId; const target = 'revision:' + f.shot.revisionId;
    graph.edges.push({ id: `revision:${source}:${target}`, source, target, kind: 'revision' });
  });
  await assert.rejects(queryResourceGraph(f.root, { generationId }), { code: 'RESOURCE_GRAPH_INDEX_INVALID' });
});
test('indexed output relationships retain the exact candidate group', async (t) => {
  const f = await productionFixture(t); await observeGroups(f); const index = await buildGraphIndex(f.root);
  const generationId = await forged(f.root, index.generationId, (graph) => {
    const edge = graph.edges.find((edge) => edge.kind === 'output'); delete edge.groupId; edge.id = `${edge.kind}:${edge.source}:${edge.target}`;
  });
  await assert.rejects(queryResourceGraph(f.root, { generationId }), { code: 'RESOURCE_GRAPH_INDEX_INVALID' });
});
test('indexed coverage does not promote cached execution heads or catalog claims to authority', async (t) => {
  const f = await lineageFixture(t); const index = await buildGraphIndex(f.root);
  const generationId = await forged(f.root, index.generationId, (graph) => {
    graph.coverage.executionHeads = [{ operationId: 'invented', head: { seq: 999, hash: 'invented' } }];
    graph.coverage.operationResultCatalogDigest = 'invented'; graph.coverage.approved = true;
  });
  const result = await queryResourceGraph(f.root, { generationId });
  assert.equal(result.coverage.executionHeads, undefined); assert.equal(result.coverage.operationResultCatalogDigest, undefined); assert.equal(result.coverage.approved, undefined);
  assert.equal(result.coverage.discoveryComplete, false);
});
test('indexed reads stream-verify returned large files and source selection changes invalidate discovery', async (t) => {
  const f = await lineageFixture(t); const bytes = Buffer.alloc(8 * 1024 * 1024 + 17, 31);
  const path = join(f.root, 'synthetic-large.bin'); await writeFile(path, bytes);
  const large = await importResourceFile(f.root, { resourceId: 'background', kind: 'opaque', mediaType: 'application/octet-stream', path });
  const index = await buildGraphIndex(f.root);
  const valid = await queryResourceGraph(f.root, { generationId: index.generationId, resourceId: 'background' });
  assert.equal(valid.nodes[0].byteLength, bytes.length);
  await writeFile(join(f.root, '.folio/resources/content', large.contentHash.slice(7) + '.bin'), Buffer.alloc(bytes.length, 32));
  assert.ok((await queryResourceGraph(f.root, { generationId: index.generationId, resourceId: 'hero' })).nodes.length);
  await assert.rejects(queryResourceGraph(f.root, { generationId: index.generationId, resourceId: 'background' }), { code: 'RESOURCE_INTEGRITY_FAILURE' });
  await assert.rejects(queryResourceGraph(f.root), { code: 'RESOURCE_INTEGRITY_FAILURE' });
  await f.select(f.hero);
  await assert.rejects(queryResourceGraph(f.root, { generationId: index.generationId, resourceId: 'hero' }), { code: 'RESOURCE_GRAPH_INDEX_STALE' });
});
test('indexed resource states keep authoritative scope selections independently of global choice', async (t) => {
  const f = await scopedFixture(t);
  await selectInput(f.root, { scopeId: 'episode-8', expectedScopeSelectionRevision: null, actor: 'user', reason: 'use original face', bindings: [f.binding('face', f.face1, 'fixed')], ...f.definitions });
  const index = await buildGraphIndex(f.root);
  const page = await queryResourceGraph(f.root, { generationId: index.generationId, resourceId: 'face' });
  const node = page.nodes.find((node) => node.revisionId === f.face1.revisionId);
  assert.equal(node.selected, false); assert.ok(node.states.includes('scoped-source'));
  assert.equal(node.scopedSelections[0].scopeId, 'episode-8'); assert.equal(node.reviewStatus, 'unknown');
});
