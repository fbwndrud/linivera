import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';

const declaration = () => ({ version: 1, provider: 'synthetic-partner', endpoint: '/synthetic/v1', schemaVersion: 'fixture-v1',
  taskIdPointer: '/task/id', statusPointer: '/task/state', outputs: [{ pointer: '/results/0/url', role: 'image', required: true },
    { pointer: '/missing~1asset', role: 'metadata', required: true }] });

test('declared provider JSON pointers pin the response, contract and actual outputs without copying signed URLs', async (t) => {
  const f = await scopedFixture(t); const source = await f.resource('response', { task: { id: 'task-1', state: 'reported-ready' }, results: [{ url: 'https://example.invalid/private-path?token=synthetic-secret#fragment' }] });
  const contract = await f.resource('contract', declaration()); const asset = await f.resource('asset', 'synthetic image and metadata');
  const args = { revisionId: source.revisionId, format: 'provider-response', dependencyManifestRevisionId: contract.revisionId };
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', ...args });
  assert.equal(structure.units.find((unit) => unit.id === '/').taskId, 'task-1');
  assert.deepEqual(structure.references.map((ref) => ref.key), ['/results/0/url', '/missing~1asset']);
  assert.ok(!JSON.stringify(structure).includes('private-path')); assert.ok(!JSON.stringify(structure).includes('synthetic-secret'));
  assert.ok(structure.coverage.unknown.some((entry) => entry.includes('/missing~1asset')));
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: args.format,
    dependencyManifestRevisionId: contract.revisionId, structureBindings: structure.references.map((ref) => ({ referenceKey: ref.key, revisionId: asset.revisionId })) });
  for (const revision of [source, contract, asset, map]) await f.select(revision);
  const defs = { pipelineRevisionId: f.definitions.pipelineRevisionId }; const scope = ['response', 'contract', 'asset', 'map'];
  for (const [kind, body] of [['profile', { version: 1, scope, maxInputBytes: 100000 }], ['policy', { version: 1, scope, allowedActions: ['create-candidate'] }]]) {
    const r = await f.resource(kind, body, kind); await f.select(r); defs[kind + 'RevisionId'] = r.revisionId;
  }
  const input = await prepareInput(f.root, { revisionIds: [map.revisionId], ...defs });
  assert.deepEqual(new Set(input.manifest.resources.map((r) => r.resourceId)), new Set(scope));
});

test('declared endpoint and label credentials are absent from maps while the immutable declaration remains exact', async (t) => {
  const f = await scopedFixture(t); const source = await f.resource('result', { task: { id: 'task', state: 'ready' }, results: [{ url: 'synthetic' }] });
  for (const endpoint of ['https://partner.invalid/private-path?api_key=SYNTHETIC_PRIVATE#secret', '/result?api_key=SYNTHETIC_PRIVATE#secret']) {
    const value = declaration(); value.endpoint = endpoint; value.provider = 'Bearer SYNTHETIC_PROVIDER_TOKEN'; value.schemaVersion = 'Basic SYNTHETIC_SCHEMA_TOKEN';
    const contract = await f.resource('contract', value);
    const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'provider-response', dependencyManifestRevisionId: contract.revisionId });
    for (const secret of ['SYNTHETIC_PRIVATE', 'SYNTHETIC_PROVIDER_TOKEN', 'SYNTHETIC_SCHEMA_TOKEN', 'private-path']) assert.ok(!JSON.stringify(structure).includes(secret), secret);
    assert.equal(JSON.parse((await f.store.readContent(contract.revisionId)).toString()).endpoint, endpoint);
  }
});

test('Kling task failure keeps its reported cause separately from API errors without producing completed outputs', async (t) => {
  const f = await scopedFixture(t); const source = await f.resource('failed', { code: 0, data: { task_id: 'task', task_status: 'failed',
    task_status_msg: 'synthetic moderation rejection; Bearer SYNTHETIC_TOKEN https://example.invalid/private-path?signature=secret' } });
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'kling-video-query' });
  const failure = structure.units.find((u) => u.kind === 'provider-error'); assert.ok(failure);
  assert.equal(failure.stage, 'task'); assert.ok(failure.message.includes('synthetic moderation rejection'));
  assert.ok(!JSON.stringify(structure).includes('SYNTHETIC_TOKEN')); assert.ok(!JSON.stringify(structure).includes('private-path'));
  assert.equal(structure.references.length, 0);
});

test('successful native snapshots with missing output locators block complete next-task inputs', async (t) => {
  const f = await scopedFixture(t);
  for (const [format, value] of [
    ['runware-image-response', { data: [{ taskType: 'imageInference', taskUUID: 'task-a', imageUUID: 'image-a' }] }],
    ['minimax-video-query', { task_id: 'task-b', status: 'Success', base_resp: { status_code: 0 } }],
    ['kling-video-query', { code: 0, data: { task_id: 'task-c', task_status: 'succeed', task_result: { videos: [] } } }],
  ]) {
    const source = await f.resource('result', value); await f.select(source);
    const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'iteration', sourceRevisionId: source.revisionId, format, structureBindings: [] }); await f.select(map);
    await assert.rejects(prepareInput(f.root, { revisionIds: [map.revisionId], ...f.definitions }), { code: 'STRUCTURE_BINDINGS_INCOMPLETE' });
  }
});

test('native task errors, other modalities and strict profile mismatches do not invent usable outputs', async (t) => {
  const f = await scopedFixture(t);
  for (const [format, value] of [
    ['runware-image-response', { errors: [{ code: 'authentication', message: 'synthetic authorization error' }] }],
    ['runware-image-response', { data: [{ taskType: 'videoInference', taskUUID: 'task-a' }] }],
    ['kling-video-query', { code: 100, message: 'synthetic error' }],
    ...['submitted', 'processing', 'failed'].map((status) => ['kling-video-query', { code: 0, data: { task_id: 'task-b', task_status: status } }]),
  ]) {
    const source = await f.resource('error', value);
    const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format }); assert.equal(structure.references.length, 0);
  }
  for (const [format, value] of [
    ['runware-image-response', {}], ['runware-image-response', { data: [{ taskType: 'imageInference', taskUUID: 'pending' }] }],
    ['minimax-video-query', { task_id: 'task', status: 'Success', file_id: 9007199254740992, base_resp: { status_code: 0 } }],
    ['minimax-video-query', { task_id: 'task', status: 'complete', base_resp: { status_code: 0 } }],
  ]) {
    const source = await f.resource('bad', value); await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format }), { code: 'STRUCTURE_INVALID' });
  }
});

test('declared pointers never traverse prototypes and malformed or duplicate mappings fail closed', async (t) => {
  const f = await scopedFixture(t); const source = await f.resource('result', { task: { id: 'task' }, results: [{ url: 'synthetic' }], 'missing/asset': 'metadata' });
  const args = { op: 'inspectStructure', revisionId: source.revisionId, format: 'provider-response' };
  await assert.rejects(resourcesTool(f.root, args), { code: 'STRUCTURE_INVALID' });
  for (const mutate of [(v) => { v.outputs[0].pointer = '/bad~2escape'; }, (v) => { v.outputs.push(v.outputs[0]); },
    (v) => { v.outputs[0].pointer = '/task'; }, (v) => { v.outputs[0].required = 'yes'; }]) {
    const value = declaration(); mutate(value); const contract = await f.resource('contract', value);
    await assert.rejects(resourcesTool(f.root, { ...args, dependencyManifestRevisionId: contract.revisionId }), { code: 'STRUCTURE_INVALID' });
  }
  const value = declaration(); value.taskIdPointer = '/constructor/name'; const contract = await f.resource('contract', value);
  const { structure } = await resourcesTool(f.root, { ...args, dependencyManifestRevisionId: contract.revisionId });
  assert.equal(structure.units.find((u) => u.id === '/').taskId, null);
  assert.equal(structure.units.find((u) => u.id === '/@outputs/1').observed, true);
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: 'provider-response',
    dependencyManifestRevisionId: contract.revisionId, structureBindings: [] });
  const forged = JSON.parse((await f.store.readContent(map.revisionId)).toString()); forged.structure.references = [];
  await assert.rejects(f.resource('forged', forged, 'structure-map'), { code: 'STRUCTURE_INVALID' });
});

test('Kling legacy single query separates original and watermarked videos and refuses list envelopes', async (t) => {
  const f = await scopedFixture(t); const value = { code: 0, request_id: 'query-1', data: { task_id: 'task-1', task_status: 'succeed', task_result: { videos: [
    { id: 'video-1', url: 'https://example.invalid/video.mp4?signature=synthetic', watermark_url: 'https://example.invalid/watermark.mp4', duration: '5' }] } } };
  const source = await f.resource('kling', value);
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'kling-video-query' });
  assert.deepEqual(structure.references.map((ref) => [ref.key, ref.role]), [['/data/task_result/videos/0/url', 'video'], ['/data/task_result/videos/0/watermark_url', 'watermarked-video']]);
  assert.equal(structure.units.find((unit) => unit.kind === 'provider-output').duration, '5');
  assert.ok(!JSON.stringify(structure).includes('signature'));
  const list = await f.resource('list', { ...value, data: [value.data] });
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: list.revisionId, format: 'kling-video-query' }), { code: 'STRUCTURE_INVALID' });
});

test('MiniMax query distinguishes API success from video completion and retains large string file IDs', async (t) => {
  const f = await scopedFixture(t);
  for (const status of ['Preparing', 'Queueing', 'Processing', 'Success', 'Fail']) {
    const source = await f.resource('minimax', { task_id: 'task-1', status, ...(status === 'Success' ? { file_id: '90071992547409931234' } : {}), base_resp: { status_code: 0, status_msg: 'ok' } });
    const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'minimax-video-query' });
    assert.equal(structure.units.find((r) => r.id === '/').status, status);
    assert.equal(structure.references.length, status === 'Success' ? 1 : 0);
    if (status === 'Success') assert.equal(structure.units.find((r) => r.kind === 'provider-output').remoteId, '90071992547409931234');
  }
  const error = await f.resource('api-error', { base_resp: { status_code: 1000, status_msg: 'synthetic error' } });
  const parsed = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: error.revisionId, format: 'minimax-video-query' });
  assert.equal(parsed.structure.references.length, 0); assert.equal(parsed.structure.units.find((u) => u.kind === 'provider-error').code, 1000);
});

test('Runware image results and independent batch errors retain separate media slots without invented status', async (t) => {
  const f = await scopedFixture(t); const source = await f.resource('runware', { data: [
    { taskType: 'imageInference', taskUUID: 'task-a', imageUUID: 'image-a', imageURL: 'https://example.invalid/private?token=synthetic-secret' },
    { taskType: 'imageInference', taskUUID: 'task-a', imageUUID: 'image-b', imageBase64Data: 'c3ludGhldGlj' }],
    errors: [{ taskUUID: 'task-b', code: 'synthetic-failure', message: 'Synthetic failure' }] });
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'runware-image-response' });
  assert.deepEqual(structure.references.map((r) => r.key), ['/data/0/imageURL', '/data/1/@image']);
  assert.equal(structure.units.filter((u) => u.kind === 'provider-output').length, 2);
  assert.equal(structure.units.find((u) => u.kind === 'provider-error').code, 'synthetic-failure');
  assert.ok(structure.units.filter((u) => u.kind === 'provider-output').every((u) => !Object.hasOwn(u, 'status')));
  assert.ok(!JSON.stringify(structure).includes('synthetic-secret')); assert.ok(structure.coverage.unknown.some((r) => r.includes('Embedded')));
});
