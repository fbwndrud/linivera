import assert from 'node:assert/strict';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionHost } from './support/production-host.js';
import { scopedScenario, scopedBinding, chooseScope, prepareScope } from './support/scoped-scenario.js';
import { scopedGeneration } from './support/scoped-generation.js';
import { generatedMotion } from './support/generated-motion.js';

export async function runScopedContinuity({ keep = false } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'linivera-scoped-continuity-')); const root = join(base, 'work');
  let host = await productionHost(root);
  try {
    const scenario = await scopedScenario(host);
    const initial8 = await prepareScope(host, 'episode-8', ['face']);
    const initial9 = await prepareScope(host, 'episode-9', ['face']);
    assert.equal(initial8.manifest.resources.find((item) => item.resourceId === 'face').revisionId, scenario.face1.revisionId);
    assert.equal(initial9.manifest.resources.find((item) => item.resourceId === 'face').revisionId, scenario.face2.revisionId);
    // A new host has no prior in-memory context choices or selection map.
    await host.close(); host = await productionHost(root);
    const recoveredSelection = await host.call('folio_inputs', { op: 'getSelection', scopeId: 'episode-8' });
    for (const kind of ['profile', 'pipeline', 'policy']) host.definitions[kind + 'RevisionId'] = recoveredSelection[kind + 'RevisionId'];
    const context = await host.call('folio_resource_query', { op: 'context', scopeId: 'episode-8', pathId: 'path-main', purpose: 'revise expression and prepare next shot',
      budget: { maxTextBytes: 1024, maxItems: 3, maxManifestBytes: 32768 } });
    assert.ok(context.package.items.some((item) => item.revisionId === scenario.face1.revisionId));
    assert.ok(!context.package.items.some((item) => item.revisionId === scenario.face2.revisionId));
    assert.ok(context.coverage.unknown.length > 0);
    const packageRevision = await host.json('package-8', context.package, 'context-package');
    const generated = await scopedGeneration(host, scenario, packageRevision, root);
    assert.ok(generated.snapshot.manifest.resources.some((item) => item.revisionId === packageRevision.revisionId));
    const originalInput = host.input;
    host.input = async (revisions) => {
      const current = await host.call('folio_inputs', { op: 'getSelection', scopeId: 'motion-8' });
      const byKey = new Map((current?.bindings ?? []).map((binding) => [binding.bindingKey, binding]));
      for (const revision of revisions) byKey.set(revision.resourceId, scopedBinding(revision.resourceId, revision));
      await chooseScope(host, 'motion-8', [...byKey.values()], 'synthetic user selects exact retained motion inputs');
      return prepareScope(host, 'motion-8', revisions.map((revision) => revision.resourceId));
    };
    const motion = await generatedMotion(host, generated.edited, scenario.voice); host.input = originalInput;
    const historical = await host.call('folio_inputs', { op: 'getSelection', scopeId: 'episode-8', checkpoint: scenario.initial8.checkpoint });
    await chooseScope(host, 'episode-8', historical.bindings, 'synthetic user restores the previous episode choices');
    const restored = await host.call('folio_inputs', { op: 'getSelection', scopeId: 'episode-8' });
    assert.deepEqual(restored.bindings, historical.bindings);
    assert.equal((await host.call('folio_inputs', { op: 'getSelection', scopeId: 'episode-9' })).bindings[0].revisionId, scenario.face2.revisionId);
    assert.deepEqual((await host.call('folio_inputs', { op: 'verify', inputSnapshotId: initial8.inputSnapshotId })).manifest, initial8.manifest);
    const graph = await host.graph();
    assert.ok(graph.edges.some((edge) => edge.source === 'revision:' + packageRevision.revisionId && edge.target === 'operation:' + generated.operation.operationId && edge.kind === 'input'));
    assert.ok(graph.edges.some((edge) => edge.source === 'revision:' + packageRevision.revisionId && edge.kind === 'context-input'));
    assert.ok(!graph.nodes.find((node) => node.revisionId === generated.edited.revisionId).reviewRequired);
    const newDesign = await host.call('folio_resources', { op: 'propose', resourceId: 'design', kind: 'text', parents: [scenario.design.revisionId], owned: { bytes: 'Synthetic changed design', mediaType: 'text/plain' } });
    await host.call('folio_resource_query', { op: 'refresh' });
    const evidence = await host.call('folio_resource_query', { op: 'query', resourceId: 'design' });
    await host.call('folio_resources', { op: 'decideSource', revisionId: newDesign.revisionId,
      expectedSelectionRevision: evidence.entries.find((item) => item.role === 'source').selectionRevision, action: { actor: 'user', type: 'select' } });
    const changed = await host.graph();
    for (const revision of [generated.edited, motion.shot, motion.timeline, motion.video]) assert.equal(changed.nodes.find((node) => node.revisionId === revision.revisionId).reviewRequired, true, revision.resourceId);
    return { verified: true, synthetic: true, actualModelGeneration: false, scopeIsolation: true, oldRevisionPreserved: true,
      selectionRestored: true, contextFeedsNextWork: true, videoAudio: motion.videoAudio, transitiveReviewRequired: true, ...(keep ? { root } : {}) };
  } finally { await host.close(); if (!keep) await rm(base, { recursive: true, force: true }); }
}
const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === fileURLToPath(import.meta.url)) runScopedContinuity({ keep: process.argv.includes('--keep') })
  .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
