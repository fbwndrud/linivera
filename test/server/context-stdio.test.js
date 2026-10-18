import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, tempDir } from '../support/fixtures.js';

const VALUES = { purpose: '합성 교재', audience: '초보 독자', language: 'ko', surfaceEase: '쉬움', conceptPacing: '점진적', inferenceLoad: '낮음', complexityRamp: '천천히' };
const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out)); return out.result; };

test('the lore/interview example also runs from an aliased package entry path', { skip: process.platform === 'win32' }, async () => {
  const dir = await tempDir('folio-context-alias-');
  const alias = join(dir, 'context.mjs');
  await symlink(join(import.meta.dirname, '..', '..', 'examples', 'context.js'), alias);
  const result = spawnSync(process.execPath, [alias], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.verified, true); assert.equal(output.interviewConfirmed, true);
  assert.equal(output.canonClaims, 1); assert.equal(output.outputsRetained, false);
});

test('fresh stdio sessions retain interview confirmations and immutable author-approved lore', async (t) => {
  const root = await copyFixture('knowledge-book');
  const first = await connectFolio(); t.after(() => first.close());
  const answered = ok(await first.call('folio_interview', { root, op: 'answer', expectedRev: null, answers: Object.entries(VALUES).map(([field, value]) => ({ field, value, raw: `원문 ${value}` })) }));
  const confirmed = ok(await first.call('folio_interview', { root, op: 'confirm', expectedRev: answered.revision, fields: Object.keys(VALUES), confirmation: '작가 확인' }));
  const proposal = ok(await first.call('folio_lore', { root, op: 'propose', expectedRev: null, snapshot: {
    evidence: [{ id: 'author-setting', basis: 'author', text: '합성 세계의 에너지는 푸르다.' }],
    claims: [{ id: 'setting', entityId: 'atp', text: '합성 세계의 에너지는 푸르다.', status: 'adopted', support: ['author-setting'] }],
    questions: [{ id: 'mystery', text: '원인은 미정', required: false }],
  } }));
  assert.equal(ok(await first.call('folio_lore', { root, op: 'get' })).revision, null);
  const publication = ok(await first.call('folio_lore', { root, op: 'decide', expectedRev: null, proposalId: proposal.proposalId, action: 'approve', decision: '작가가 이 설정을 채택함' }));
  await first.close();
  const second = await connectFolio(); t.after(() => second.close());
  assert.deepEqual(ok(await second.call('folio_interview', { root, op: 'get' })), confirmed);
  const historical = ok(await second.call('folio_lore', { root, op: 'get', revision: publication.revision }));
  assert.equal(historical.snapshot.claims[0].status, 'adopted');
  const state = ok(await second.call('folio_status', { root }));
  assert.equal(state.lore.revision, publication.revision); assert.deepEqual(state.interview.pending, []);
  const repeated = ok(await second.call('folio_interview', { root, op: 'context', expectedRev: confirmed.revision, brief: '원래 합성 교재 브리프 반복' }));
  assert.deepEqual(repeated, confirmed);
});
