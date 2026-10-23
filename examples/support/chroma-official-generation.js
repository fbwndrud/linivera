import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createOfficialToolAdapter, inspectOfficialToolConnection } from '../../server/production/official-tools.js';
import { createProductionRecorder } from '../../server/production/recorder.js';
import { syntheticOfficialTools } from './synthetic-official-tools.js';
import { approveRecordedGroups } from './chroma-generation.js';

export const officialScope = ['official-spec', 'official-prompt', 'official-request', 'official-readiness', 'official-access', 'official-check',
  'official-connection', 'official-context', 'official-package', 'official-model', 'official-bundle', 'official-response', 'official-model-map', 'official-preflight'];
export function syntheticOfficialGlb(prompt) {
  const value = { asset: { version: '2.0', extras: { promptLength: prompt.length } }, nodes: [{ name: 'Synthetic preview node' }], scenes: [{ nodes: [0] }], scene: 0 };
  const raw = Buffer.from(JSON.stringify(value)); const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(json);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16); return Buffer.concat([header, json]);
}
/** A synthetic official MCP boundary shares this workspace with P0-P4. Real provider tools are never called. */
export async function chromaOfficialGeneration(root, base, host, s) {
  const { call } = host; const R = (id) => s.resources.get(id);
  const capability = await call('folio_resource_query', { op: 'specification', capabilityId: 'meshy-text-to-3d-preview-v1' });
  const access = await call('folio_resource_query', { op: 'accessSpecification', accessId: 'meshy-preview-official-mcp-v1' });
  await s.retainJson('official-spec', capability, 'capability-specification'); await s.retainJson('official-access', access, 'access-specification');
  const prompt = 'Synthetic harbor model'; await s.retain('official-prompt', prompt, 'text/plain', 'text');
  const request = { version: 1, ...capability.identity, parameters: { mode: 'preview', prompt, ai_model: 'meshy-7.1', target_formats: ['glb'] },
    inputBindings: [{ fieldPath: 'prompt', role: 'prompt', revisionId: R('official-prompt').revisionId }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'candidate-0', slots: [
      { role: 'model', required: true, acceptableMediaTypes: ['model/gltf-binary'] }, { role: 'bundle', required: true, acceptableMediaTypes: ['application/json'] }] }] } };
  await s.retainJson('official-request', request, 'generation-request');
  const material = await call('folio_resource_query', { op: 'retainReadiness', resourceId: 'official-readiness', ...host.definitions,
    specificationRevisionId: R('official-spec').revisionId, requestRevisionId: R('official-request').revisionId,
    candidateRevisionIds: [R('official-prompt').revisionId], scopeId: 'episode-1', pathId: 'main', search: { completeness: 'partial', reason: 'Exact preview prompt; external holdings not searched.' } });
  await s.keep('official-readiness', material);
  const bytes = syntheticOfficialGlb((await s.readBytes('official-prompt')).toString('utf8'));
  const fixture = syntheticOfficialTools({ bytes, downloadFailures: 1 });
  const binding = { accessSpecificationRevisionId: R('official-access').revisionId, capabilitySpecificationRevisionId: R('official-spec').revisionId,
    requestRevisionId: R('official-request').revisionId, scopeId: 'episode-1', pathId: 'main', accountAlias: 'account-synthetic', projectAlias: 'project-harbor' };
  async function observe(resourceId) {
    const checks = await inspectOfficialToolConnection({ tools: fixture.tools, accessSpec: access, probe: fixture.probe });
    const checkedAt = new Date();
    const check = { version: 1, ...binding, checkedAt: checkedAt.toISOString(), expiresAt: new Date(checkedAt.getTime() + 300000).toISOString(),
      observation: 'host-reported', authenticationBoundary: 'host-secret-store', checks };
    const revision = await call('folio_resource_query', { op: 'retainConnectionCheck', resourceId, check }); await s.keep(resourceId, revision); return revision;
  }
  await observe('official-check');
  const connection = await call('folio_resource_query', { op: 'retainConnectionReadiness', resourceId: 'official-connection', ...binding,
    ...host.definitions, checkRevisionId: R('official-check').revisionId });
  await s.keep('official-connection', connection); assert.equal((await s.readJson(connection)).readiness.canPrepare, true);
  const roles = { capability: R('official-spec'), inputs: material, access: R('official-access'), connection, request: R('official-request') };
  await s.retainJson('official-context', { version: 1, scopeId: 'episode-1', pathId: 'main',
    requirements: Object.entries(roles).map(([role, r]) => ({ role, required: true, accepts: [{ kind: r.kind }] })),
    states: Object.entries(roles).map(([role, r]) => ({ role, status: 'observed', artifactRevisionId: r.revisionId, evidenceRevisionIds: [] })) }, 'usage-context');
  const preview = await call('folio_resource_query', { op: 'context', scopeId: 'episode-1', pathId: 'main', purpose: 'Use the official preview tool through the synthetic host',
    contextRevisionId: R('official-context').revisionId, budget: { maxTextBytes: 4096, maxItems: 8, maxManifestBytes: 65536 } });
  assert.equal(preview.ready, true); await s.retainJson('official-package', preview.package, 'context-package');
  const snapshot = await s.prepare(['official-package']);
  const operation = await call('folio_operations', { op: 'start', inputSnapshotId: snapshot.inputSnapshotId, actor: 'user', idempotencyKey: 'official-preview',
    operationContractVersion: 2, requestRevisionId: R('official-request').revisionId });
  const outputDirectory = join(base, 'official-downloads'); await mkdir(outputDirectory);
  const validate = () => call('folio_resource_query', { op: 'validateConnection', inputSnapshotId: snapshot.inputSnapshotId,
    requestRevisionId: binding.requestRevisionId, accountAlias: binding.accountAlias, projectAlias: binding.projectAlias, accessSpecificationRevisionId: binding.accessSpecificationRevisionId });
  const adapter = createOfficialToolAdapter({ tools: fixture.tools, accessSpec: access, outputDirectory,
    accountAlias: binding.accountAlias, projectAlias: binding.projectAlias, accessSpecificationRevisionId: binding.accessSpecificationRevisionId, requestRevisionId: binding.requestRevisionId,
    assertReady: async () => {
      const check = await observe('official-preflight');
      const fresh = await call('folio_resource_query', { op: 'connectionReadiness', ...binding, ...host.definitions, checkRevisionId: check.revisionId });
      assert.equal(fresh.readiness.canPrepare, true, 'A current host probe must pass before the official tool call.');
      return validate();
    } });
  const prepared = await adapter.prepare(request, [{ revisionId: R('official-prompt').revisionId, bytes: await s.readBytes('official-prompt'), mediaType: 'text/plain', contentHash: R('official-prompt').contentHash }]);
  const recorder = createProductionRecorder({ root, call, operationId: operation.operationId, executionId: 'official' });
  await recorder.prepared(prepared); const submission = await recorder.submit(adapter, prepared);
  const status = await adapter.inspect(submission.handle); assert.equal(status.status, 'complete');
  // Tool success is not retained bytes. The first download fails and cannot form a complete bundle/group.
  const partial = await recorder.collect(prepared, await adapter.collect(submission.handle), { inputSnapshotId: snapshot.inputSnapshotId });
  assert.equal(partial.groups.length, 0); assert.ok(partial.incompleteGroups.length);
  const collection = await adapter.collect(submission.handle);
  for (const artifact of collection.artifacts) artifact.resourceId = 'official-model';
  for (const bundle of collection.bundles) bundle.resourceId = 'official-bundle';
  const retained = await recorder.collect(prepared, collection, { inputSnapshotId: snapshot.inputSnapshotId });
  await recorder.status('complete'); await approveRecordedGroups(host, operation.operationId, retained.groups);
  for (const artifact of retained.artifacts) await s.keep(artifact.role === 'model' ? 'official-model' : 'official-bundle', await host.read(artifact.revisionId));
  await s.retainJson('official-response', collection.nativeRecords[0].record, 'provider-response-source');
  await s.connect('official-model-map', 'official-model', 'glb', {});
  assert.equal(fixture.counters.create, 1); assert.equal(fixture.counters.download, 2); assert.equal(fixture.prompt, prompt);
  await rm(outputDirectory, { recursive: true, force: true });
  return { bytes, snapshot, verified: true, providerCalls: false, partialDownloadRecovered: true, creates: fixture.counters.create };
}
