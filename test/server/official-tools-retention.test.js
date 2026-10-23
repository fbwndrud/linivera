import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { productionFixture } from '../operations/production-fixture.js';
import { productionHost } from '../../examples/support/production-host.js';
import { syntheticOfficialTools } from '../../examples/support/synthetic-official-tools.js';
import { createOfficialToolAdapter } from '../../server/production/official-tools.js';
import { createProductionRecorder } from '../../server/production/recorder.js';
import { accessCatalog } from '../../packs/production/access-catalog.js';

/** Host-tool fixtures and real public Linivera MCP; no provider account or remote server is contacted. */
test('official tool success, local capture and durable MCP retention are separate across restart', async (t) => {
  const f = await productionFixture(t);
  const host = await productionHost(f.root); t.after(() => host.close());
  const accessSpec = accessCatalog.find((spec) => spec.id === 'meshy-preview-official-mcp-v1');
  const prompt = 'synthetic source'; const bytes = Buffer.from('synthetic retained model');
  const request = { version: 1, ...accessSpec.identity, parameters: { mode: 'preview', prompt, ai_model: 'meshy-7.1', target_formats: ['glb'] },
    inputBindings: [{ fieldPath: 'prompt', revisionId: f.source.revisionId, role: 'prompt' }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: [
      { role: 'model', required: true, acceptableMediaTypes: ['model/gltf-binary'] },
      { role: 'bundle', required: true, acceptableMediaTypes: ['application/json'] },
    ] }] } };
  const resource = await host.json('request', request, 'generation-request', [f.requestResource.revisionId]); await f.select(resource);
  const snapshot = await host.call('folio_inputs', { op: 'prepare', revisionIds: [f.source.revisionId, resource.revisionId],
    profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, policyRevisionId: f.ids.policy });
  const operation = await host.call('folio_operations', { ...f.start, op: 'start', inputSnapshotId: snapshot.inputSnapshotId, requestRevisionId: resource.revisionId });
  const fixture = syntheticOfficialTools({ bytes, downloadFailures: 1, rawSecret: 'SYNTHETIC-NEVER-RETAIN-THIS' });
  const adapter = createOfficialToolAdapter({ tools: fixture.tools, accessSpec, accountAlias: 'account-synthetic', projectAlias: 'project-synthetic',
    accessSpecificationRevisionId: `sha256:${'b'.repeat(64)}`, requestRevisionId: resource.revisionId, outputDirectory: join(f.root, 'host-capture'),
    assertReady: async (scope) => ({ ready: true, ...scope }) });
  const prepared = await adapter.prepare(request, [{ revisionId: f.source.revisionId, bytes: Buffer.from(prompt), mediaType: 'text/plain' }]);
  let recorder = createProductionRecorder({ call: host.call, root: f.root, operationId: operation.operationId, executionId: 'official-tools' });
  await recorder.prepared(prepared);
  const submission = await recorder.submit(adapter, prepared);
  assert.equal(submission.status, 'accepted');
  const first = await adapter.collect(submission.handle); assert.equal(first.status, 'partial'); assert.equal(first.artifacts.length, 0);
  const incomplete = await recorder.collect(prepared, first, { inputSnapshotId: snapshot.inputSnapshotId });
  assert.equal(incomplete.groups.length, 0);
  await host.restart();
  recorder = createProductionRecorder({ call: host.call, root: f.root, operationId: operation.operationId, executionId: 'official-tools' });
  const complete = await adapter.collect(submission.handle);
  const retained = await recorder.collect(prepared, complete, { inputSnapshotId: snapshot.inputSnapshotId });
  assert.equal(retained.groups.length, 1); assert.equal(fixture.counters.create, 1);
  await host.restart();
  const model = retained.artifacts.find((artifact) => artifact.role === 'model');
  const read = await host.call('folio_resources', { op: 'read', revisionId: model.revisionId });
  assert.deepEqual(Buffer.from(read.base64, 'base64'), bytes);
  const observed = await recorder.resume();
  for (const { payload } of observed.events) {
    if (!payload.event.nativeRecordRevisionId) continue;
    const record = await host.call('folio_resources', { op: 'read', revisionId: payload.event.nativeRecordRevisionId });
    assert.ok(!record.content.includes('SYNTHETIC-NEVER-RETAIN-THIS'));
    assert.ok(!record.content.includes('download_url')); assert.ok(!record.content.includes('local_path'));
  }
  await assert.rejects(() => recorder.submit(adapter, prepared), /PRODUCTION_SUBMISSION_BLOCKED/);
  assert.equal(fixture.counters.create, 1);
});
