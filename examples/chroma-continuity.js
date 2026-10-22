import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionHost } from './support/production-host.js';
import { syntheticPng } from './support/synthetic-media.js';
import { chromaStages } from './support/chroma-stages.js';
import { chromaGuards } from './support/chroma-guards.js';
import { chromaChanges } from './support/chroma-changes.js';
import { chromaReadiness, readinessScope } from './support/chroma-readiness.js';
import { chromaGeneration } from './support/chroma-generation.js';
import { chromaInitialGeneration, initialScope } from './support/chroma-initial-generation.js';
import { chromaScope, guardScope, syntheticDownloads, syntheticWorkflow, syntheticNodeContract, syntheticTimeline, syntheticProject, syntheticRecords, nextTaskContext } from './support/synthetic-chroma.js';

const unit = (map, kind) => map.structure.units.find((u) => u.kind === kind);

/**
 * One workspace, public stdio MCP only: provider files → P0 links → P1 workflow/model → P2 edit →
 * P3 project/external state → P4 brief/rights/release/performance → one context package → two later tasks.
 * Entirely synthetic. No model, provider, playback, editor/engine restore, publication or legal judgment.
 */
export async function runChromaContinuity({ keep = false } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'linivera-chroma-'))); const root = join(base, 'work');
  const host = await productionHost(root); const s = chromaStages(host); const { call } = host;
  try {
    await call('folio_init', { title: 'Synthetic single-workspace P0-P4 continuity', preset: 'picturebook' });
    await s.define([...chromaScope, ...readinessScope, ...initialScope, ...guardScope]);
    const initial = await chromaInitialGeneration(root, host, s);
    // Provider responses, declaration and media arrive as local files; the originals are deleted after retention.
    const downloads = syntheticDownloads(); const video = Buffer.from('synthetic opaque provider video v1');
    const originals = await s.importDownloads(join(base, 'downloads'), { ...Object.fromEntries(Object.entries(downloads).map(([id, value]) => [id, { bytes: JSON.stringify(value), mediaType: 'application/json' }])),
      'provider-video': { bytes: video, mediaType: 'application/octet-stream' },
      'brief-proof': { bytes: 'synthetic brief source document', mediaType: 'text/plain' }, 'rights-proof': { bytes: 'synthetic rights report: distribution in KR', mediaType: 'text/plain' },
      'release-proof': { bytes: 'synthetic release confirmation', mediaType: 'text/plain' }, 'analytics-export': { bytes: 'synthetic analytics export: 120 views', mediaType: 'text/plain' } });
    originals.set('provider-image', initial.bytes);
    // P0: provider responses bind exact retained files; the generic response also pins its declaration.
    await s.connect('runware-map', 'runware', 'runware-image-response', { image: 'provider-image' });
    await s.connect('minimax-map', 'minimax', 'minimax-video-query', { video: 'provider-video' });
    await s.connect('generic-map', 'generic', 'provider-response', { image: 'provider-image' }, { dependencyManifestRevisionId: s.resources.get('response-contract').revisionId });
    await host.restart();
    assert.deepEqual(await s.readBytes('provider-image'), originals.get('provider-image'));
    // P1: the workflow loads the file ID that the retained Runware map reported, pinned with node package/model.
    const runware = await s.readJson('runware-map'); const remoteImageId = unit(runware, 'provider-output').remoteId;
    await s.retainJson('workflow', syntheticWorkflow(remoteImageId), 'workflow-source'); await s.retainJson('node-contract', syntheticNodeContract());
    await s.retainJson('node-package', { synthetic: 'custom node package source' }); await s.retain('model', Buffer.from('synthetic model weights'), 'application/octet-stream');
    await s.connect('workflow-map', 'workflow', 'comfy-api', { image: 'provider-image', 'node-package': 'node-package', model: 'model' },
      { dependencyManifestRevisionId: s.resources.get('node-contract').revisionId });
    const p1 = await s.produce('frame', await s.prepare(['workflow-map']), async () => {
      const wf = await s.readJson('workflow-map'); const linked = await host.read(wf.bindings.find((b) => b.referenceKey === '/1/inputs/image').revisionId);
      assert.equal(wf.structure.references.find((r) => r.key === '/1/inputs/image').hint, `${remoteImageId}.png`);
      const [red, green] = Buffer.from(linked.contentHash.slice(-4), 'hex');
      return s.draft('frame', syntheticPng(red, green), 'image/png', 'render');
    });
    // P2: the edit places the P1 frame and the retained provider video; the cut consumes clip ranges and linked hashes.
    await s.retainJson('timeline', syntheticTimeline(2), 'editing-project');
    await s.connect('timeline-map', 'timeline', 'otio', { 'file:///synthetic/frame.png': 'frame', 'file:///synthetic/provider.bin': 'provider-video' });
    const p2 = await s.produce('cut', await s.prepare(['timeline-map']), async () => {
      const edit = await s.readJson('timeline-map'); const hashes = [];
      for (const binding of edit.bindings) hashes.push((await host.read(binding.revisionId)).contentHash);
      const clips = edit.structure.units.filter((u) => u.kind === 'clip').map((u) => u.parentRange);
      assert.deepEqual(clips.map((c) => c.duration), [2, 1]);
      return s.draft('cut', Buffer.from(JSON.stringify({ clips, hashes })), 'application/octet-stream', 'render');
    });
    // P3: the project declares the cut, scene and a database snapshot as external-state evidence.
    await s.retainJson('project', syntheticProject(), 'project-source'); await s.retainJson('scene', { name: 'Synthetic harbor scene', media: 'media/cut.bin' });
    await s.retainJson('environment', { variableNames: ['WORLD_ID'], runtime: 'synthetic' });
    await s.connect('project-map', 'project', 'project-manifest', { scene: 'scene', media: 'cut', 'db-snapshot': 'db-snapshot', environment: 'environment' });
    const p3 = await s.produce('deliverable', await s.prepare(['project-map']), async () => {
      const project = await s.readJson('project-map'); const db = JSON.parse((await s.readBytes('db-snapshot')).toString('utf8'));
      const cut = JSON.parse((await s.readBytes('cut')).toString('utf8'));
      const states = project.structure.units.filter((u) => u.kind === 'external-state').map((u) => u.name);
      return s.draft('deliverable', Buffer.from(JSON.stringify({ cutHash: s.resources.get('cut').contentHash, world: db.rows[0].label, states, clips: cut.clips.length })), 'application/octet-stream', 'deliverable');
    });
    // P4: brief/rights/release name the P3 deliverable; performance names the identity-matched release map.
    for (const [id, value] of Object.entries(syntheticRecords())) await s.retainJson(id, value, 'delivery-source');
    for (const id of ['brief', 'rights', 'release']) await s.connect(id + '-map', id, 'delivery-record', { deliverable: 'deliverable', 'source-document': id + '-proof' });
    await s.connect('performance-map', 'performance', 'delivery-record', { release: 'release-map', 'source-document': 'analytics-export' });
    await host.restart();
    for (const id of ['db-snapshot', 'rights-proof', 'response-contract']) assert.deepEqual(await s.readBytes(id), originals.get(id), id);
    // Reverse relations are discovered, then chosen explicitly; nothing is added automatically.
    const graph = await host.graph(); const node = (id) => 'revision:' + s.resources.get(id).revisionId;
    const pointing = (id) => graph.edges.filter((e) => e.kind === 'structure-reference' && e.target === node(id)).map((e) => graph.nodes.find((n) => n.id === e.source).resourceId).sort();
    assert.deepEqual(pointing('deliverable'), ['brief-map', 'release-map', 'rights-map']); assert.deepEqual(pointing('release-map'), ['performance-map']);
    const R = (id) => s.resources.get(id);
    const comparisonRoles = await chromaReadiness(host, s);
    const roles = { ...comparisonRoles, 'initial-input': R('initial-package'), 'initial-provider-response': R('initial-response'), deliverable: R('deliverable'), 'provider-response': [R('runware-map'), R('minimax-map'), R('generic-map')], workflow: R('workflow-map'),
      edit: R('timeline-map'), project: R('project-map'), brief: R('brief-map'), rights: R('rights-map'), release: R('release-map'), performance: R('performance-map') };
    await s.retainJson('context', nextTaskContext(roles), 'usage-context');
    const budget = { maxTextBytes: 4096, maxItems: 32, maxManifestBytes: 131072 };
    const preview = await call('folio_resource_query', { op: 'context', scopeId: 'episode-1', pathId: 'main', purpose: 'plan the next cut from delivery feedback', contextRevisionId: R('context').revisionId, budget });
    assert.equal(preview.ready, true); assert.ok(preview.requirements.every((row) => row.status === 'provided' && row.included));
    const bundle = await s.retainJson('package', preview.package, 'context-package');
    const snapshot = await s.prepare(['package']);
    const expected = [...chromaScope, ...readinessScope, ...initialScope].filter((id) => !['context', 'initial-context', 'next', 'final'].includes(id));
    assert.deepEqual(snapshot.manifest.resources.map((r) => r.resourceId).sort(), expected.sort());
    for (const r of snapshot.manifest.resources) assert.equal(r.contentHash, (await host.read(r.revisionId)).contentHash);
    // Task 4 consumes values read from the one sealed bundle; task 5 consumes task 4.
    const next = await chromaGeneration(root, host, s, snapshot, R('generation-request'), async () => {
      const brief = await s.readJson('brief-map'); const rights = await s.readJson('rights-map'); const performance = await s.readJson('performance-map');
      const minimax = await s.readJson('minimax-map'); const contract = await s.readJson('response-contract'); const edit = await s.readJson('timeline-map');
      const deliverable = JSON.parse((await s.readBytes('deliverable')).toString('utf8'));
      return s.draftJson('next', { requirement: unit(brief, 'brief-requirement').text, rightsStatus: unit(rights, 'rights-claim').status, rightsEvidence: (await s.readBytes('rights-proof')).toString('utf8'),
        views: unit(performance, 'performance-metric').value, providerFileId: unit(minimax, 'provider-output').remoteId, declaredSchema: contract.schemaVersion,
        clipSeconds: edit.structure.units.filter((u) => u.kind === 'clip').map((u) => u.parentRange.duration), world: deliverable.world, deliverableHash: R('deliverable').contentHash });
    });
    const used = await s.readJson('next');
    assert.deepEqual([used.views, used.rightsStatus, used.providerFileId, used.world, used.declaredSchema], [120, 'reported-granted', '90071992547409931234', 'Synthetic harbor world', 'fixture-v1']);
    const final = await s.produce('final', await s.prepare(['next']), () => s.draftJson('final', { previousHash: R('next').contentHash, keepRequirement: used.requirement, compareViews: used.views }));
    const approvedStates = (await host.graph()).nodes.filter((n) => ['rights-map', 'package'].includes(n.resourceId)).flatMap((n) => n.states);
    assert.ok(!approvedStates.includes('approved'), 'linked rights and context are never approvals');
    const guards = await chromaGuards(host, s, { roles, budget, bundle, snapshot });
    const changes = await chromaChanges(host, s, { outputs: ['next', 'final'], intermediates: { 'provider-video': ['cut', 'deliverable'], 'db-snapshot': ['deliverable'] },
      unaffected: { 'provider-video': ['frame'], 'db-snapshot': ['frame', 'cut'] } });
    assert.deepEqual((await call('folio_inputs', { op: 'verify', inputSnapshotId: snapshot.inputSnapshotId })).manifest, snapshot.manifest);
    for (const stage of [initial, p1, p2, p3, next, final]) await call('folio_inputs', { op: 'verify', inputSnapshotId: stage.snapshot.inputSnapshotId });
    return { verified: true, synthetic: true, singleWorkspace: true, serverRestarts: 2, originalsDeleted: true, bundleFeedsNextWork: true, exactBundleClosure: expected.length,
      capabilityCompared: true, requestBindingsPinned: true, productionOperation: true,
      ...guards, ...changes, historicalInputsVerified: true, actualModelGeneration: false, actualProviderNetwork: false, mediaPlayback: false, editorRestore: false,
      externalPublication: false, legalApproval: false, ...(keep ? { root } : {}) };
  } finally { await host.close(); if (!keep) await rm(base, { recursive: true, force: true }); }
}
const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === fileURLToPath(import.meta.url)) runChromaContinuity({ keep: process.argv.includes('--keep') })
  .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
