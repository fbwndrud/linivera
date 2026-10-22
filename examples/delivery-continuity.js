import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionHost } from './support/production-host.js';
import { syntheticPng } from './support/synthetic-media.js';
import { syntheticDeliveryData } from './support/synthetic-delivery.js';

/** Exact delivery knowledge is reused through public MCP; no legal, provider or playback approval is inferred. */
export async function runDeliveryContinuity({ change = 'rights' } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'linivera-delivery-')); const host = await productionHost(join(base, 'work'));
  const { call, json, select, input } = host;
  try {
    await call('folio_init', { title: 'Synthetic provider and delivery continuity', preset: 'picturebook' });
    const data = syntheticDeliveryData(); const resources = new Map(); const maps = [];
    const scope = ['image', 'video-b', 'video-c', 'brief', 'rights', 'release', 'performance', 'runware', 'minimax', 'kling', 'generic', 'contract',
      'brief-proof', 'rights-proof', 'release-proof', 'analytics-export', 'brief-map', 'rights-map', 'release-map', 'performance-map', 'runware-map', 'minimax-map', 'kling-map', 'generic-map', 'iteration', 'next'];
    for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 8 * 1024 * 1024 }], ['pipeline', { version: 1, steps: [{ id: 'iterate', capability: 'analyze' }] }],
      ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish', 'select-source'] }]]) {
      const r = await json(kind, value, kind); await select(r); host.definitions[kind + 'RevisionId'] = r.revisionId;
    }
    async function retain(id, bytes, mediaType = 'text/plain') {
      const r = await call('folio_resources', { op: 'propose', resourceId: id, kind: 'synthetic-artifact', owned: Buffer.isBuffer(bytes)
        ? { base64: bytes.toString('base64'), mediaType } : { bytes, mediaType } }); await select(r); resources.set(id, r); return r;
    }
    await retain('image', syntheticPng(), 'image/png');
    for (const id of ['video-b', 'video-c']) await retain(id, Buffer.from('synthetic opaque video fixture ' + id), 'application/octet-stream');
    for (const id of ['brief-proof', 'rights-proof', 'release-proof', 'analytics-export']) await retain(id, 'synthetic evidence ' + id);
    for (const [id, value] of Object.entries(data)) { const r = await json(id, value); await select(r); resources.set(id, r); }
    async function connect(id, sourceId, format, targets, extras = {}) {
      const source = resources.get(sourceId); const inspected = await call('folio_resources', { op: 'inspectStructure', revisionId: source.revisionId, format, ...extras });
      const bindings = inspected.structure.references.map((ref) => { const target = resources.get(targets[ref.key] ?? targets[ref.role]); assert.ok(target, ref.key); return { referenceKey: ref.key, revisionId: target.revisionId }; });
      const map = await call('folio_resources', { op: 'normalizeStructure', resourceId: id, sourceRevisionId: source.revisionId, format, structureBindings: bindings, ...extras });
      await select(map); resources.set(id, map); maps.push(map); return map;
    }
    await connect('runware-map', 'runware', 'runware-image-response', { image: 'image' });
    await connect('minimax-map', 'minimax', 'minimax-video-query', { video: 'video-b' });
    await connect('kling-map', 'kling', 'kling-video-query', { video: 'video-c' });
    await connect('generic-map', 'generic', 'provider-response', { image: 'image' }, { dependencyManifestRevisionId: resources.get('contract').revisionId });
    await connect('brief-map', 'brief', 'delivery-record', { deliverable: 'video-c', 'source-document': 'brief-proof' });
    await connect('rights-map', 'rights', 'delivery-record', { deliverable: 'video-c', 'source-document': 'rights-proof' });
    const releaseMap = await connect('release-map', 'release', 'delivery-record', { deliverable: 'video-c', 'source-document': 'release-proof' });
    await connect('performance-map', 'performance', 'delivery-record', { release: 'release-map', 'source-document': 'analytics-export' });
    await host.restart();
    // The performance map alone brings the actual release map and its deliverable/evidence into closure.
    const roots = maps.filter((map) => map.revisionId !== releaseMap.revisionId); const snapshot = await input(roots);
    assert.deepEqual(new Set(snapshot.manifest.resources.map((r) => r.resourceId)), new Set(scope.filter((id) => !['iteration', 'next'].includes(id))));
    const readJson = async (r) => JSON.parse((await call('folio_resources', { op: 'read', revisionId: r.revisionId })).content);
    const brief = await readJson(resources.get('brief-map')); const rights = await readJson(resources.get('rights-map')); const performance = await readJson(resources.get('performance-map'));
    const response = await readJson(resources.get('minimax-map'));
    const evidence = await call('folio_resources', { op: 'read', revisionId: resources.get('rights-proof').revisionId });
    async function produce(id, sealed, value) {
      const op = await call('folio_operations', { op: 'start', inputSnapshotId: sealed.inputSnapshotId, actor: 'user', idempotencyKey: id });
      const out = await json(id, value); await call('folio_operations', { op: 'submit', ...op, inputSnapshotId: sealed.inputSnapshotId, resultRevisionIds: [out.revisionId] });
      await host.approve(op.operationId, out.revisionId); return out;
    }
    const iteration = await produce('iteration', snapshot, { requirement: brief.structure.units.find((u) => u.kind === 'brief-requirement').text,
      rightsStatus: rights.structure.units.find((u) => u.kind === 'rights-claim').status, evidence: evidence.content,
      views: performance.structure.units.find((u) => u.kind === 'performance-metric').value,
      remoteFileId: response.structure.units.find((u) => u.kind === 'provider-output').remoteId });
    const used = await readJson(iteration); assert.equal(used.views, 120); assert.equal(used.rightsStatus, 'reported-granted'); assert.equal(used.remoteFileId, '90071992547409931234');
    const next = await produce('next', await input([iteration]), { previousHash: iteration.contentHash, preserveRequirement: used.requirement, reconsiderViews: used.views });
    const original = resources.get(change);
    if (change === 'rights-proof') await retain(change, 'synthetic amended rights document');
    else {
      const value = structuredClone(data[change]);
      if (change === 'contract') value.schemaVersion = 'fixture-v2';
      else if (change === 'performance') value.details.metrics[0].value = 125;
      else value.details.claims[0].status = 'reported-revoked';
      await select(await json(change, value));
    }
    const graph = await host.graph(); for (const r of [iteration, next]) assert.equal(graph.nodes.find((node) => node.revisionId === r.revisionId).reviewRequired, true);
    for (const id of ['rights-map', 'release-map']) assert.ok(!graph.nodes.find((node) => node.revisionId === resources.get(id).revisionId).states.includes('approved'));
    const historical = await call('folio_inputs', { op: 'verify', inputSnapshotId: snapshot.inputSnapshotId });
    assert.equal(historical.manifest.resources.find((r) => r.resourceId === change).revisionId, original.revisionId);
    return { verified: true, serverRestarted: true, deliveryFeedsNextWork: true, exactDependencyClosure: true, releaseIdentityMatched: true,
      transitiveReviewRequired: true, changed: change, actualModelGeneration: false, externalPublication: false, legalApproval: false };
  } finally { await host.close(); await rm(base, { recursive: true, force: true }); }
}
const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === fileURLToPath(import.meta.url)) runDeliveryContinuity({ change: process.argv.find((arg) => arg.startsWith('--change='))?.slice(9) ?? 'rights' })
  .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
