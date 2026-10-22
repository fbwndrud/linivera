import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionHost } from './support/production-host.js';
import { syntheticPng, syntheticWav } from './support/synthetic-media.js';
import { syntheticEditXml, syntheticOtioEdit, syntheticDependencyContract, syntheticExtensionModel } from './support/synthetic-edit.js';

/** Real stdio data continuity; synthetic bytes do not assert codec or editor compatibility. */
export async function runTimelineContinuity({ change = 'media' } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'linivera-editing-')); const host = await productionHost(join(base, 'work'));
  const { call, json, select, input } = host;
  try {
    await call('folio_init', { title: 'Synthetic timeline continuity', preset: 'picturebook' });
    const scope = ['image', 'audio', 'package', 'model', 'buffer', 'texture', 'contract', 'workflow', 'gltf', 'xml', 'otio', 'workflow-map', 'model-map', 'xml-map', 'otio-map', 'edit-summary', 'next'];
    for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 8 * 1024 * 1024 }], ['pipeline', { version: 1, steps: [{ id: 'inspect', capability: 'analyze' }] }],
      ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish', 'select-source'] }]]) {
      const r = await json(kind, value, kind); await select(r); host.definitions[kind + 'RevisionId'] = r.revisionId;
    }
    async function binary(resourceId, bytes, mediaType) {
      const r = await call('folio_resources', { op: 'propose', resourceId, kind: 'synthetic-artifact', owned: { base64: bytes.toString('base64'), mediaType } }); await select(r); return r;
    }
    const image = await binary('image', syntheticPng(), 'image/png'); const audio = await binary('audio', syntheticWav(), 'audio/wav');
    const packageFile = await json('package', { synthetic: 'package source' }); await select(packageFile);
    const model = await json('model', { synthetic: 'model weights' }); await select(model);
    const buffer = await binary('buffer', Buffer.alloc(96), 'application/octet-stream'); const texture = await binary('texture', Buffer.from('synthetic codec fixture'), 'image/ktx2');
    const contract = await json('contract', syntheticDependencyContract()); await select(contract);
    const workflow = await json('workflow', { '9': { class_type: 'SyntheticCustom', inputs: { model: 'synthetic.model' } } }, 'workflow-source'); await select(workflow);
    const modelSource = await json('gltf', syntheticExtensionModel(), 'model'); await select(modelSource);
    const xml = await call('folio_resources', { op: 'propose', resourceId: 'xml', kind: 'editing-project', owned: { bytes: syntheticEditXml(), mediaType: 'text/plain' } }); await select(xml);
    const otio = await json('otio', syntheticOtioEdit(), 'editing-project'); await select(otio);
    const maps = [];
    async function connect(resourceId, source, format, targets, extras = {}) {
      const inspected = await call('folio_resources', { op: 'inspectStructure', revisionId: source.revisionId, format, ...extras });
      const structureBindings = inspected.structure.references.map((ref) => {
        const target = targets[ref.role] ?? targets[ref.hint]; assert.ok(target, ref.key); return { referenceKey: ref.key, revisionId: target.revisionId };
      });
      const map = await call('folio_resources', { op: 'normalizeStructure', resourceId, sourceRevisionId: source.revisionId, format, structureBindings, ...extras }); await select(map); maps.push(map);
    }
    await connect('workflow-map', workflow, 'comfy-api', { 'node-package': packageFile, model }, { dependencyManifestRevisionId: contract.revisionId });
    await connect('model-map', modelSource, 'gltf', { buffer, image: texture });
    await connect('xml-map', xml, 'xmeml', { 'file:///synthetic/image.png': image, 'file:///synthetic/voice.wav': audio });
    await connect('otio-map', otio, 'otio', { media: image }); await host.restart();
    const snapshot = await input(maps);
    assert.deepEqual(new Set(snapshot.manifest.resources.map((r) => r.resourceId)), new Set(scope.filter((id) => !['edit-summary', 'next'].includes(id))));
    const summaries = [];
    for (const map of maps) {
      const value = JSON.parse((await call('folio_resources', { op: 'read', revisionId: map.revisionId })).content);
      const hashes = [];
      for (const binding of value.bindings) hashes.push((await host.read(binding.revisionId)).contentHash);
      summaries.push({ format: value.format, sourceHash: value.sourceContentHash, parserVersion: value.parserVersion,
        clipRanges: value.structure.units.filter((u) => u.kind === 'clip').map((u) => u.parentRange), linkedHashes: hashes });
    }
    async function produce(id, sealed, value) {
      const op = await call('folio_operations', { op: 'start', inputSnapshotId: sealed.inputSnapshotId, actor: 'user', idempotencyKey: id });
      const out = await json(id, value); await call('folio_operations', { op: 'submit', ...op, inputSnapshotId: sealed.inputSnapshotId, resultRevisionIds: [out.revisionId] });
      await host.approve(op.operationId, out.revisionId); return out;
    }
    const summary = await produce('edit-summary', snapshot, { summaries });
    const content = JSON.parse((await call('folio_resources', { op: 'read', revisionId: summary.revisionId })).content);
    assert.equal(content.summaries.find((s) => s.format === 'otio').clipRanges[0].duration, 2);
    const next = await produce('next', await input([summary]), { previousResultHash: summary.contentHash, formats: content.summaries.map((s) => s.format) });
    if (change === 'contract') { const changed = await json('contract', syntheticDependencyContract('2.0')); await select(changed); }
    else await binary('image', Buffer.concat([syntheticPng(), Buffer.from('synthetic revision')]), 'image/png');
    const graph = await host.graph();
    for (const result of [summary, next]) assert.equal(graph.nodes.find((n) => n.revisionId === result.revisionId).reviewRequired, true);
    assert.ok(graph.edges.some((edge) => edge.kind === 'structure-reference' && edge.target === 'revision:' + contract.revisionId));
    const historical = await call('folio_inputs', { op: 'verify', inputSnapshotId: snapshot.inputSnapshotId });
    assert.equal(historical.manifest.resources.find((r) => r.resourceId === 'contract').revisionId, contract.revisionId);
    return { verified: true, serverRestarted: true, actualModelGeneration: false, timelineFeedsNextWork: true, dependencyClosure: true, changed: change, transitiveReviewRequired: true };
  } finally { await host.close(); await rm(base, { recursive: true, force: true }); }
}
const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === fileURLToPath(import.meta.url)) runTimelineContinuity({ change: process.argv.includes('--contract') ? 'contract' : 'media' })
  .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
