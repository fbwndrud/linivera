import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionHost } from './support/production-host.js';
import { syntheticPng } from './support/synthetic-media.js';

/** Retained output → source structure → next task → later task, using actual MCP and synthetic data. */
export async function runStructureContinuity() {
  const base = await mkdtemp(join(tmpdir(), 'linivera-structure-')); const root = join(base, 'work');
  const host = await productionHost(root); const { call, json, select, input } = host;
  try {
    await call('folio_init', { title: 'Synthetic structure continuity', preset: 'picturebook' });
    const scope = ['prompt', 'image', 'workflow', 'structure', 'next', 'final'];
    for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 8 * 1024 * 1024 }],
      ['pipeline', { version: 1, steps: [{ id: 'transform', capability: 'transform' }] }],
      ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish', 'select-source'] }]]) {
      const r = await json(kind, value, kind); await select(r); host.definitions[kind + 'RevisionId'] = r.revisionId;
    }
    const prompt = await json('prompt', { synthetic: 'source description' }); await select(prompt);
    async function produce(refs, resultId, createResult) {
      const snapshot = await input(refs);
      const op = await call('folio_operations', { op: 'start', inputSnapshotId: snapshot.inputSnapshotId, idempotencyKey: resultId, actor: 'user' });
      const output = await createResult();
      await call('folio_operations', { op: 'submit', ...op, inputSnapshotId: snapshot.inputSnapshotId, resultRevisionIds: [output.revisionId] });
      await host.approve(op.operationId, output.revisionId); return { snapshot, output };
    }
    const image = (await produce([prompt], 'image', () => call('folio_resources', { op: 'propose', resourceId: 'image', kind: 'image',
      owned: { base64: syntheticPng().toString('base64'), mediaType: 'image/png' } }))).output;
    const workflowValue = { '1': { class_type: 'LoadImage', inputs: { image: 'synthetic-output.png' } }, '2': { class_type: 'PreviewImage', inputs: { images: ['1', 0] } } };
    const workflow = await json('workflow', workflowValue, 'workflow-source'); await select(workflow);
    const inspected = await call('folio_resources', { op: 'inspectStructure', revisionId: workflow.revisionId, format: 'comfy-api' });
    const structure = await call('folio_resources', { op: 'normalizeStructure', resourceId: 'structure', sourceRevisionId: workflow.revisionId, format: 'comfy-api',
      structureBindings: [{ referenceKey: inspected.structure.references[0].key, revisionId: image.revisionId }] });
    await select(structure); await host.restart();
    const recovered = await call('folio_resources', { op: 'read', revisionId: structure.revisionId });
    const recoveredValue = JSON.parse(recovered.content);
    assert.equal(recoveredValue.sourceContentHash, workflow.contentHash);
    const linkedImage = await host.read(recoveredValue.bindings[0].revisionId);
    const next = await produce([structure], 'next', () => json('next', { sourceHash: recoveredValue.sourceContentHash,
      unitCount: recoveredValue.structure.units.length, linkedImageHash: linkedImage.contentHash }));
    assert.deepEqual(new Set(next.snapshot.manifest.resources.map((r) => r.resourceId)), new Set(['structure', 'workflow', 'image']));
    const nextContent = JSON.parse((await call('folio_resources', { op: 'read', revisionId: next.output.revisionId })).content);
    assert.equal(nextContent.linkedImageHash, image.contentHash); assert.equal(nextContent.unitCount, 2);
    const final = await produce([next.output], 'final', () => json('final', { previousResultHash: next.output.contentHash, ...nextContent }));
    const graph = await host.graph();
    for (const kind of ['structure-source', 'structure-reference']) assert.ok(graph.edges.some((edge) => edge.kind === kind));
    assert.equal(graph.nodes.find((n) => n.revisionId === structure.revisionId).family, 'structure');
    const index = await call('folio_resource_query', { op: 'indexGraph' });
    const indexed = await call('folio_resource_query', { op: 'graph', generationId: index.generationId, resourceId: 'structure', depth: 2 });
    assert.ok(indexed.edges.some((edge) => edge.kind === 'structure-reference'));
    assert.equal(indexed.coverage.contentVerification, 'returned-scope-verified');
    const changed = await json('workflow', { ...workflowValue, '3': { class_type: 'PreviewImage', inputs: { images: ['1', 0] } } }, 'workflow-source', [workflow.revisionId]);
    await select(changed);
    const stale = await host.graph();
    for (const r of [next.output, final.output]) assert.equal(stale.nodes.find((n) => n.revisionId === r.revisionId).reviewRequired, true);
    const verified = await call('folio_inputs', { op: 'verify', inputSnapshotId: next.snapshot.inputSnapshotId });
    assert.equal(verified.manifest.resources.find((r) => r.resourceId === 'workflow').revisionId, workflow.revisionId);
    return { verified: true, synthetic: true, actualModelGeneration: false, serverRestarted: true,
      structureFeedsNextWork: true, exactDependencyClosure: true, indexedRelationsVerified: true, transitiveReviewRequired: true };
  } finally { await host.close(); await rm(base, { recursive: true, force: true }); }
}
const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === fileURLToPath(import.meta.url)) runStructureContinuity()
  .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
