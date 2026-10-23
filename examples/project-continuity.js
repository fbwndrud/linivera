import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionHost } from './support/production-host.js';
import { syntheticProjectFiles } from './support/synthetic-project.js';
import { syntheticPng } from './support/synthetic-media.js';
import { createVersionedExportAdapter, MANUAL_EXPORT_VERSION } from '../adapters/production/versioned-export.js';
import { createProductionRecorder } from '../server/production/recorder.js';

/** A synthetic broker supplies local files; the public MCP records capture and subsequent real reads. */
export async function runProjectContinuity({ change = 'database' } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'linivera-project-')); const host = await productionHost(join(base, 'work'));
  const { call, json, select, input } = host;
  try {
    await call('folio_init', { title: 'Synthetic partner project', preset: 'picturebook' });
    async function definitions(scope) {
      for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 8 * 1024 * 1024 }],
        ['pipeline', { version: 1, steps: [{ id: 'iterate', capability: 'analyze' }] }],
        ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish', 'select-source'] }]]) {
        const r = await json(kind, value, kind); await select(r); host.definitions[kind + 'RevisionId'] = r.revisionId;
      }
    }
    // Real acquisition is a host/broker responsibility. These are locally supplied synthetic exports.
    const files = syntheticProjectFiles(); const provider = 'synthetic-partner';
    const requestValue = { version: 1, provider, product: 'file-export', endpoint: `manual-export/${provider}/v1`, capability: 'manual-export', schemaVersion: MANUAL_EXPORT_VERSION,
      parameters: { captureId: 'project-v1' }, inputBindings: [], outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'project', slots: [
        ...files.map((file) => ({ role: file.role, required: true, acceptableMediaTypes: [file.mediaType] })),
        { role: 'bundle', required: true, acceptableMediaTypes: ['application/json'] }], }] } };
    const request = await json('capture-request', requestValue, 'generation-request'); await select(request); await definitions(['capture-request']);
    const sealed = await input([request]);
    const operation = await call('folio_operations', { op: 'start', inputSnapshotId: sealed.inputSnapshotId, actor: 'user', idempotencyKey: 'capture', operationContractVersion: 2, requestRevisionId: request.revisionId });
    const adapter = createVersionedExportAdapter({ provider, bundleType: 'game-project', requiredRoles: files.map((file) => file.role) });
    const opaquePath = join(base, 'broker-unknown.data'); await writeFile(opaquePath, files.find((file) => file.artifactKey === 'opaque').bytes);
    const captureFiles = files.map((file) => { if (file.artifactKey !== 'opaque') return file; const copy = { ...file, path: opaquePath }; delete copy.bytes; return copy; });
    const prepared = await adapter.prepare(requestValue, { files: captureFiles, native: { acquisition: 'synthetic-broker', originalGeneration: 'unknown' } });
    const recorder = createProductionRecorder({ call, root: join(base, 'work'), operationId: operation.operationId, executionId: 'broker-capture' });
    await recorder.prepared(prepared); const submitted = await recorder.submit(adapter, prepared);
    const collected = await recorder.collect(prepared, await adapter.collect(submitted.handle), { inputSnapshotId: sealed.inputSnapshotId });
    await rm(opaquePath);
    assert.equal(collected.groups.length, 1);
    const artifacts = new Map(collected.artifacts.map((file) => [file.artifactKey, file]));
    const retained = collected.artifacts.filter((file) => file.artifactKey !== 'export-bundle'); for (const file of retained) await select(file);
    const scope = [...retained.map((file) => file.resourceId), 'project-map', 'atlas-map', 'iteration', 'next']; await definitions(scope);
    const targets = new Map(files.map((file) => [file.relativePath, artifacts.get(file.artifactKey)]));
    async function map(resourceId, key, format, bindings) {
      const r = await call('folio_resources', { op: 'normalizeStructure', resourceId, sourceRevisionId: artifacts.get(key).revisionId, format, structureBindings: bindings }); await select(r); return r;
    }
    const projectMap = await map('project-map', 'manifest', 'project-manifest', files.filter((file) => file.artifactKey !== 'manifest').map((file, i) => ({ referenceKey: `/files/${i}/path`, revisionId: targets.get(file.relativePath).revisionId })));
    const atlasMap = await map('atlas-map', 'atlas', 'aseprite', [{ referenceKey: '/meta/image', revisionId: artifacts.get('sheet').revisionId }]);
    await host.restart(); const snapshot = await input([projectMap, atlasMap]);
    assert.deepEqual(new Set(snapshot.manifest.resources.map((r) => r.resourceId)), new Set(scope.filter((id) => !['iteration', 'next'].includes(id))));
    const readJson = async (revisionId) => JSON.parse((await call('folio_resources', { op: 'read', revisionId })).content);
    const project = await readJson(projectMap.revisionId); const atlas = await readJson(atlasMap.revisionId);
    const database = await readJson(artifacts.get('database').revisionId);
    const opaque = await call('folio_resources', { op: 'read', revisionId: artifacts.get('opaque').revisionId });
    assert.deepEqual([...Buffer.from(opaque.base64, 'base64')], [0, 255, 7, 31, 128]);
    async function produce(id, sealedInput, value) {
      const op = await call('folio_operations', { op: 'start', inputSnapshotId: sealedInput.inputSnapshotId, actor: 'user', idempotencyKey: id });
      const output = await json(id, value); await call('folio_operations', { op: 'submit', ...op, inputSnapshotId: sealedInput.inputSnapshotId, resultRevisionIds: [output.revisionId] });
      await host.approve(op.operationId, output.revisionId); return output;
    }
    const iteration = await produce('iteration', snapshot, { dependencies: project.structure.links, frames: atlas.structure.units.filter((unit) => unit.kind === 'sprite-frame'),
      world: database.rows[0].label, sourceHash: artifacts.get('code').contentHash, unknownPayloadBase64: opaque.base64 });
    const used = await readJson(iteration.revisionId); assert.equal(used.world, 'Synthetic world'); assert.equal(used.frames[1].durationMs, 120);
    const next = await produce('next', await input([iteration]), { previousResultHash: iteration.contentHash, world: used.world, frameCount: used.frames.length });
    const target = artifacts.get(change); assert.ok(target, change);
    const changed = await call('folio_resources', { op: 'propose', resourceId: target.resourceId, kind: 'production-artifact', parents: [target.revisionId],
      owned: change === 'database' ? { bytes: JSON.stringify({ rows: [{ id: 1, label: 'Synthetic revision' }] }), mediaType: 'application/json' }
        : { base64: syntheticPng(40, 160).toString('base64'), mediaType: 'image/png' } }); await select(changed);
    const graph = await host.graph(); for (const r of [iteration, next]) assert.equal(graph.nodes.find((n) => n.revisionId === r.revisionId).reviewRequired, true);
    assert.ok(graph.edges.some((edge) => edge.kind === 'output' && edge.source === 'operation:' + operation.operationId && edge.target === 'revision:' + artifacts.get('manifest').revisionId));
    assert.ok(!graph.nodes.find((node) => node.revisionId === artifacts.get('manifest').revisionId).states.includes('approved'));
    const historical = await call('folio_inputs', { op: 'verify', inputSnapshotId: snapshot.inputSnapshotId });
    assert.equal(historical.manifest.resources.find((r) => r.resourceId === target.resourceId).revisionId, target.revisionId);
    return { verified: true, brokerFilesRetained: true, serverRestarted: true, projectFeedsNextWork: true, dependencyClosure: true,
      transitiveReviewRequired: true, changed: change, actualModelGeneration: false, actualBrokerNetwork: false, runtimeRestored: false };
  } finally { await host.close(); await rm(base, { recursive: true, force: true }); }
}
const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === fileURLToPath(import.meta.url)) runProjectContinuity({ change: process.argv.includes('--sheet') ? 'sheet' : 'database' })
  .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
