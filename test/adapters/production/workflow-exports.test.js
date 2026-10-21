import test from 'node:test';
import assert from 'node:assert/strict';
import { createFloyoExportAdapter } from '../../../adapters/production/floyo.js';
import { createMartiniExportAdapter } from '../../../adapters/production/martini.js';
import { createRodinExportAdapter } from '../../../adapters/production/rodin.js';
import { createGameExportAdapter } from '../../../adapters/production/game-export.js';

function request(provider) {
  return { version: 1, provider, product: 'manual-export', endpoint: `manual-export/${provider}/v1`, capability: 'manual-export', schemaVersion: 'linivera-manual-export-v1',
    parameters: { captureId: 'synthetic-export' }, inputBindings: [], outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'export', slots: [] }] } };
}
const file = (artifactKey, role, value, relativePath = `${artifactKey}.json`) => ({ artifactKey, role, relativePath,
  mediaType: 'application/json', bytes: Buffer.from(JSON.stringify(value)) });

test('Floyo keeps editable workflow and execution graph as distinct files and marks unobserved dependencies', async () => {
  const adapter = createFloyoExportAdapter(); const input = request('floyo');
  const editable = file('editable', 'editable-workflow', { nodes: [{ id: 1, pos: [1, 2] }] });
  const executable = file('execution', 'execution-graph', { 1: { class_type: 'FixtureNode', inputs: {} } });
  const prepared = await adapter.prepare(input, { files: [editable, executable] });
  const { handle } = await adapter.submit(prepared); const result = await adapter.collect(handle);
  assert.notEqual(result.artifacts[0].resourceId, result.artifacts[1].resourceId);
  assert.equal(result.artifacts[0].bytes.toString(), editable.bytes.toString());
  assert.equal(result.bundles[0].dependencyCoverage, 'unknown'); assert.equal(result.bundles[0].restorability, 'unknown');
  assert.equal(result.observation, 'user-reported'); assert.equal(handle.jobIdSource, 'local-capture');
  assert.ok(result.unavailableFields.includes('originalGenerationInputs'));
  const partialPrepared = await adapter.prepare({ ...input, parameters: { captureId: 'partial' } }, { files: [editable] });
  const partial = await adapter.collect((await adapter.submit(partialPrepared)).handle);
  assert.ok(partial.bundles[0].unavailable.some((missing) => missing.role === 'execution-graph'));
});
test('Martini preserves failed run actions, item replacement, revision reasons and input fingerprint without approving a take', async () => {
  const adapter = createMartiniExportAdapter();
  const run = { id: 'run-a', workflowId: 'workflow-a', fingerprint: 'fixture-fingerprint', status: 'failed',
    actions: [{ id: 'action-a', status: 'completed' }, { id: 'action-b', status: 'failed' }],
    items: [{ id: 'item-a', actionId: 'action-a', status: 'completed', verdict: { pass: true } },
      { id: 'item-b', actionId: 'action-b', status: 'needs_revision', revision: { reason: 'synthetic revision', inputRefs: ['Script'] }, replacesItemId: 'old-item' }] };
  const prepared = await adapter.prepare(request('martini'), { files: [file('workflow', 'workflow-source', { fingerprint: 'fixture-fingerprint', bins: { Refs: [] } }),
    file('run', 'run-record', run), file('partial-result', 'result', { synthetic: true })], native: run });
  const result = await adapter.collect((await adapter.submit(prepared)).handle);
  assert.equal(result.nativeRecords[0].record.status, 'failed');
  assert.equal(result.nativeRecords[0].record.items[1].replacesItemId, 'old-item');
  assert.equal(result.nativeRecords[0].record.items[0].verdict.pass, true);
  assert.equal(result.artifacts.length, 3); assert.equal(result.observation, 'user-reported');
  assert.equal(result.artifacts.some((item) => item.role === 'approval'), false);
});
test('Rodin export keeps mesh/material files together but makes task-vs-subscription and generation provenance explicit', async () => {
  const adapter = createRodinExportAdapter();
  const prepared = await adapter.prepare(request('rodin'), { files: [file('mesh', 'model', { synthetic: 'mesh' }), file('material', 'material', { synthetic: 'PBR' })],
    native: { task_uuid: 'task-a', jobs: { subscription_key: 'subscription-b' }, list: [{ name: 'model.glb', url: 'https://example.invalid/model?signature=secret' }] } });
  const result = await adapter.collect((await adapter.submit(prepared)).handle);
  assert.equal(result.bundles[0].bundleType, 'model-3d'); assert.equal(result.artifacts.length, 2);
  assert.equal(result.nativeRecords[0].record.task_uuid, 'task-a');
  assert.equal(result.nativeRecords[0].record.jobs.subscription_key, 'subscription-b');
  assert.ok(!JSON.stringify(result.nativeRecords).includes('signature=secret'));
});
test('game bundles retain source/material/build and explicitly lack database and platform state', async () => {
  const adapter = createGameExportAdapter();
  const prepared = await adapter.prepare(request('game'), { files: [file('source', 'source', { source: 'synthetic' }),
    file('materials', 'material', { material: 'synthetic' }), file('build', 'build', { build: 'synthetic' })] });
  const result = await adapter.collect((await adapter.submit(prepared)).handle);
  assert.deepEqual(result.bundles[0].members.map((item) => item.role), ['source', 'material', 'build']);
  assert.deepEqual(result.bundles[0].unavailable.map((item) => item.role), ['database-state', 'platform-state']);
  assert.equal(result.bundles[0].dependencyCoverage, 'partial'); assert.equal(result.bundles[0].restorability, 'unknown');
});
test('manual JSON exports redact credentials, reject path traversal and cannot reuse a capture ID for different source files', async () => {
  const adapter = createFloyoExportAdapter(); const input = request('floyo');
  const exported = file('editable', 'editable-workflow', { nodes: [], api_key: 'synthetic-secret' });
  const prepared = await adapter.prepare(input, { files: [exported], native: { 'set-cookie': 'synthetic-cookie' } });
  const result = await adapter.collect((await adapter.submit(prepared)).handle);
  assert.equal(JSON.parse(result.artifacts[0].bytes).api_key, '[redacted]');
  assert.ok(result.artifacts[0].metadata.omittedPaths.includes('api_key'));
  assert.ok(!JSON.stringify(result.nativeRecords).includes('synthetic-cookie'));
  const changed = await adapter.prepare(input, { files: [file('editable', 'editable-workflow', { nodes: [1] })] });
  await assert.rejects(() => adapter.submit(changed), { code: 'PRODUCTION_INPUT_INVALID' });
  await assert.rejects(() => adapter.prepare(input, { files: [{ ...exported, relativePath: '../escaped.json' }] }), { code: 'BUNDLE_INVALID' });
});
