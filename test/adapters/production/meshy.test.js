import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeshyAdapter, MESHY_ENDPOINT } from '../../../adapters/production/meshy.js';

function request() {
  return { version: 1, provider: 'meshy', product: 'text-to-3d', endpoint: MESHY_ENDPOINT,
    capability: 'text-to-3d', schemaVersion: '2026-10-22', parameters: { mode: 'preview', prompt: 'Synthetic cube', target_formats: ['glb', 'obj'] },
    inputBindings: [], outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'cube', slots: [] }] } };
}
test('Meshy maps each model and material into a stable bundle without starting refinement', async () => {
  let submits = 0; let reads = 0; const downloads = [];
  const adapter = createMeshyAdapter({ accountAlias: 'fixture', transport: {
    submit: async (endpoint, input) => { submits++; assert.equal(input.mode, 'preview'); return { result: 'meshy-task' }; },
    get: async () => ({ id: 'meshy-task', status: 'SUCCEEDED', model_urls: ++reads % 2 ? {
      glb: 'https://example.invalid/cube.glb?token=secret', obj: 'https://example.invalid/cube.obj', mtl: 'https://example.invalid/cube.mtl',
    } : { mtl: 'https://example.invalid/cube.mtl', obj: 'https://example.invalid/cube.obj', glb: 'https://example.invalid/cube.glb?token=secret' }, texture_urls: [{ base_color: 'https://example.invalid/color.png' }] }),
    download: async (url) => { downloads.push(url); return Buffer.from('synthetic file'); },
  } });
  const prepared = await adapter.prepare(request()); const submission = await adapter.submit(prepared);
  const collection = await adapter.collect(submission.handle);
  assert.equal(submits, 1); assert.equal(collection.artifacts.length, 4);
  assert.equal(collection.bundles[0].members.length, 4);
  assert.equal(collection.bundles[0].dependencyCoverage, 'unknown');
  assert.ok(!JSON.stringify(collection.nativeRecords).includes('token=secret'));
  assert.ok(downloads[0].includes('token=secret'));
  const again = await adapter.collect(JSON.parse(JSON.stringify(submission.handle)));
  assert.deepEqual(again.artifacts.map((item) => item.resourceId), collection.artifacts.map((item) => item.resourceId));
  assert.deepEqual(again.bundles[0].members, collection.bundles[0].members);
});
test('lost acknowledgement never retries creation and incomplete downloads remain explicit', async () => {
  let posts = 0;
  const transport = { submit: async () => { posts++; throw new Error('lost ack'); }, get: async () => ({ status: 'FAILED', model_urls: { glb: 'https://example.invalid/cube.glb' } }), download: async () => { throw new Error('expired'); } };
  const adapter = createMeshyAdapter({ accountAlias: 'fixture', transport }); const prepared = await adapter.prepare(request());
  assert.equal((await adapter.submit(prepared)).status, 'submission-unknown'); await adapter.submit(prepared); assert.equal(posts, 1);
  const collection = await adapter.collect({ provider: 'meshy', accountAlias: 'fixture', endpoint: MESHY_ENDPOINT, jobId: 'recovered', request: request() });
  assert.equal(collection.status, 'partial'); assert.equal(collection.artifacts.length, 0);
  assert.ok(collection.bundles[0].unavailable.some((item) => item.relativePath === 'models/model.glb'));
  const bad = request(); bad.parameters.mode = 'refine'; await assert.rejects(() => adapter.prepare(bad), { code: 'PRODUCTION_INPUT_INVALID' });
});
test('large downloads use local file descriptors and oversized inline responses are rejected', async () => {
  let file = { path: '/tmp/synthetic-model.glb', contentHash: `sha256:${'a'.repeat(64)}` };
  const adapter = createMeshyAdapter({ accountAlias: 'fixture', transport: { submit: async () => ({ result: 'file-job' }),
    get: async () => ({ status: 'SUCCEEDED', model_urls: { glb: 'https://example.invalid/model.glb' } }), download: async () => file } });
  const input = request(); input.parameters.target_formats = ['glb'];
  const { handle } = await adapter.submit(await adapter.prepare(input));
  assert.equal((await adapter.collect(handle)).artifacts[0].path, file.path);
  file = Buffer.alloc(8 * 1024 * 1024 + 1);
  const partial = await adapter.collect(handle);
  assert.equal(partial.status, 'partial'); assert.equal(partial.artifacts.length, 0);
  assert.match(partial.bundles[0].unavailable[0].reason, /local file/i);
});
