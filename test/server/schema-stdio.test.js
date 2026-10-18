import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { TOOLS } from '../../server/tools/definitions.js';
import { connectFolio } from '../support/mcp-client.js';
import { tempDir, copyFixture } from '../support/fixtures.js';
import { createFakeHost } from '../support/fake-host.js';
import { illustratedWork, createImageHost } from '../support/image-work.js';
import { PNG_A, placeImage } from '../support/images.js';
import { VIBELORE_FIXTURE } from '../support/import-source.js';

test('실제 MCP의 24개 도구는 카탈로그·성공·오류·모델 대기·null 출력 계약을 지킨다', async (t) => {
  const folio = await connectFolio(), dir = await tempDir('folio-contract-');
  const renamedRoot = await copyFixture('serial-2level'), imageRoot = await illustratedWork();
  t.after(async () => { await folio.close(); await Promise.all([dir, renamedRoot, imageRoot].map((path) => rm(path, { recursive: true, force: true }))); });
  const provider = new AjvJsonSchemaValidator(), seen = new Set();
  const { tools } = await folio.client.listTools();
  assert.deepEqual(tools, TOOLS, '스키마뿐 아니라 동작·출력 메타데이터도 실제로 전달한다');
  const validators = new Map(tools.map((tool) => [tool.name, provider.getValidator(tool.outputSchema)]));
  async function call(name, args, errorCode = null) {
    const response = await folio.client.callTool({ name, arguments: args });
    const legacy = JSON.parse(response.content[0].text);
    const checked = validators.get(name)(response.structuredContent);
    assert.equal(checked.valid, true, `${name}: ${checked.errorMessage}`);
    seen.add(name);
    if (errorCode) {
      assert.equal(response.isError, true); assert.equal(legacy.error.code, errorCode);
      assert.deepEqual(response.structuredContent, legacy); return legacy.error;
    }
    assert.ok(!response.isError, `${name}: ${JSON.stringify(legacy)}`);
    assert.deepEqual(response.structuredContent, { result: legacy }, '기존 text 결과와 구조화된 결과가 같아야 한다');
    seen.add(name); return legacy;
  }
  const root = join(dir, 'work');
  await call('folio_init', { root, title: '합성 계약 검사', preset: 'scene', packs: ['novel', 'sources', 'image'] });
  await call('folio_init', { root, title: '다시 만들지 않음', preset: 'scene' });
  await call('folio_structure', { root, op: 'add', level: 'scene', id: 'a', title: '합성 장면' });
  await call('folio_status', { root }); await call('folio_config', { root });
  await call('folio_find', { root, query: 'node', id: 'a' });
  await call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'a' }, items: [] });
  await call('folio_sources', { root, op: 'add', id: 'ref', text: '합성 자료' });
  await call('folio_sources', { root, op: 'list' }); await call('folio_sources', { root, op: 'get', id: 'ref' });
  await call('folio_sources', { root, op: 'link', nodeId: 'a', claims: [] });
  await call('folio_view', { root, nodeId: 'a' });
  const host = createFakeHost();
  let outcome = await call('folio_run', { root, node: 'a' });
  assert.equal(outcome.status, 'needs_model');
  await call('folio_status', { root });
  for (let i = 0; i < 20 && outcome.status === 'needs_model'; i += 1) {
    outcome = await call('folio_resume', { root, runId: outcome.runId, answers: host.answer(outcome) });
  }
  assert.equal(outcome.status, 'needs_user');
  const done = await call('folio_decide', { root, runId: outcome.runId, action: 'approve' });
  assert.equal(done.status, 'done');
  assert.equal((await call('folio_run', { root })).status, 'idle');
  const plan = await call('folio_find', { root: renamedRoot, query: 'rename', id: 'hana', newName: '세라' });
  await call('folio_occurrences', { root: renamedRoot, op: 'rename', entityId: 'hana', newName: '세라', planDigest: plan.planDigest });
  assert.equal(await call('folio_image', { root: imageRoot, op: 'pending' }), null);
  outcome = await call('folio_image', { root: imageRoot, op: 'start', assetId: 'synthetic-picture', nodeId: 'ep-001' });
  await call('folio_image', { root: imageRoot, op: 'pending' });
  const imageHost = await createImageHost({ image: async () => ({ path: await placeImage(dir, 'synthetic.png', PNG_A), model: 'fake-image' }) });
  for (let i = 0; i < 20 && outcome.status === 'needs_model'; i += 1) {
    outcome = await call('folio_image', { root: imageRoot, op: 'resume', runId: outcome.runId, answers: await imageHost.answer(outcome) });
  }
  assert.equal(outcome.status, 'needs_user');
  assert.equal((await call('folio_image', { root: imageRoot, op: 'decide', runId: outcome.runId, action: 'approve' })).status, 'done');
  const imported = await call('folio_import_vibelore', { root: join(dir, 'imported'), from: VIBELORE_FIXTURE });
  await call('folio_export', { root: imported.root, op: 'check' });
  await call('folio_export', { root: imported.root, output: join(dir, 'publication') });
  await call('folio_assets', { root, op: 'list' });
  await call('folio_tracking', { root, op: 'get' });
  await call('folio_lore', { root, op: 'get' });
  await call('folio_interview', { root, op: 'get' });
  const revisions = {};
  for (const [kind, value] of [
    ['document', 'synthetic resource'], ['profile', { version: 1, scope: ['document'], maxInputBytes: 2000 }],
    ['pipeline', { version: 1, steps: [{ id: 'draft', capability: 'transform' }] }],
    ['policy', { version: 1, scope: ['document'], allowedActions: ['create-candidate', 'publish'] }],
  ]) {
    const revision = await call('folio_resources', { root, op: 'propose', resourceId: kind, kind,
      owned: { bytes: typeof value === 'string' ? value : JSON.stringify(value), mediaType: typeof value === 'string' ? 'text/plain' : 'application/json' } });
    revisions[kind] = revision.revisionId;
    await call('folio_resources', { root, op: 'decideSource', revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
  }
  const input = await call('folio_inputs', { root, op: 'prepare', revisionIds: [revisions.document],
    profileRevisionId: revisions.profile, pipelineRevisionId: revisions.pipeline, policyRevisionId: revisions.policy });
  await call('folio_operations', { root, op: 'start', inputSnapshotId: input.inputSnapshotId, idempotencyKey: 'synthetic', actor: 'user' });
  assert.equal(await call('folio_policy', { root, op: 'status', grantId: 'absent' }), null);
  await call('folio_resource_query', { root, op: 'refresh' });
  await call('folio_embeddings', { root, op: 'index' }, 'EMBEDDING_RUNTIME_UNAVAILABLE');
  await call('folio_structure', { root, op: 'add' }, 'TOOL_INPUT_INVALID');
  await call('folio_find', { root, query: 'node', id: 'missing' }, 'NODE_NOT_FOUND');
  assert.deepEqual([...seen].sort(), TOOLS.map((tool) => tool.name).sort());
  assert.equal(folio.stderr(), '');
});
