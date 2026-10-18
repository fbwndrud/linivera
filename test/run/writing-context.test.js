import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { loreCommand } from '../../core/lore/commands.js';
import { interviewCommand } from '../../core/interview/commands.js';
import { workStatus } from '../../core/status.js';
import { openWork } from '../../core/store/work.js';
import { contextRefs, assertContextRefs } from '../../core/work/context.js';

const VALUES = { purpose: '합성 추리', audience: '성인', language: 'ko', surfaceEase: '쉽게', conceptPacing: '천천히', inferenceLoad: '보통', complexityRamp: '점진적' };
async function profile(root) {
  const a = await interviewCommand(root, { op: 'answer', expectedRev: null, answers: Object.entries(VALUES).map(([field, value]) => ({ field, value, raw: `원문 ${value}` })) });
  return interviewCommand(root, { op: 'confirm', expectedRev: a.revision, fields: Object.keys(VALUES), confirmation: '작가 확인' });
}
async function publication(root, questions = [], expectedRev = null) {
  const p = await loreCommand(root, { op: 'propose', expectedRev, snapshot: { evidence: [{ id: 'a', basis: 'author', text: '합성 확정 설정' }], claims: [{ id: 'c', entityId: 'mara', text: '합성 확정 설정', status: 'adopted', support: ['a'] }], questions } });
  return loreCommand(root, { op: 'decide', expectedRev, proposalId: p.proposalId, action: 'approve', decision: '작가 승인' });
}
async function setup() {
  const root = await copyFixture('novel-3level'); await useFakePack(root);
  const make = (extra = {}) => createRunner({ root, packs: fakePacks(), ...extra });
  return { root, make };
}
const done = (make, host, options) => driveToEnd(make, host, { ...options, until: (o) => o.status === 'done' });

test('confirmed profile and approved lore enter requests and receipts; optional questions do not block writing', async () => {
  const { root, make } = await setup(); const interview = await profile(root);
  const lore = await publication(root, [{ id: 'optional', text: '아직 미정인 단서' }]);
  const first = await make().run({ node: 'stairwell' }); const payload = first.requests[0].payload;
  assert.equal(payload.lore.revision, lore.revision); assert.equal(payload.lore.canon.length, 1);
  assert.equal(payload.interview.confirmed.language, 'ko'); assert.deepEqual(payload.interview.pending, []);
  await assert.rejects(interviewCommand(root, { op: 'answer', expectedRev: interview.revision, answers: [{ field: 'language', value: 'en', raw: '영어로' }] }), { code: 'INTERVIEW_RUN_OPEN' });
  await assert.rejects(publication(root, [], lore.revision), { code: 'LORE_RUN_OPEN' });
  const finished = (await done(make, createFakeHost(), { from: first })).at(-1);
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.receiptId === finished.receiptId);
  assert.equal(receipt.refs.find((r) => r.kind === 'lore').revision, lore.revision);
  assert.equal(receipt.refs.find((r) => r.kind === 'interview').revision, interview.revision);
  const work = await openWork(root);
  assert.throws(() => assertContextRefs(work, []), { code: 'LOCK_CONTEXT_MISMATCH' });
  assert.doesNotThrow(() => assertContextRefs(work, contextRefs(work)));
});

test('required unresolved questions and unconfirmed interview answers are hard final-commit conditions', async () => {
  for (const kind of ['question', 'interview']) {
    const { root, make } = await setup();
    if (kind === 'question') await publication(root, [{ id: 'required', text: '필수 설정 결정', required: true }]);
    else await interviewCommand(root, { op: 'answer', expectedRev: null, answers: [{ field: 'language', value: 'ko', raw: '한국어' }] });
    const blocked = (await driveToEnd(make, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user' && o.question.canApprove === false })).at(-1);
    const codes = blocked.question.blocking.map((f) => f.code);
    assert.ok(codes.includes(kind === 'question' ? 'LORE_REQUIRED_QUESTION_OPEN' : 'INTERVIEW_CONFIRMATION_REQUIRED'));
    await assert.rejects(make().decide({ runId: blocked.runId, action: 'approve', reason: '우회 시도' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
    assert.deepEqual((await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit'), []);
    await make().decide({ runId: blocked.runId, action: 'skip', reason: '필수 결정 후 재시작' });
  }
});

test('a new approved revision makes old prose stale; recheck pins the new revision without rewriting', async () => {
  const { root, make } = await setup(); const original = await publication(root);
  await done(make, createFakeHost(), { start: { node: 'stairwell' } });
  const before = (await openWork(root)).tree.nodes.get('stairwell').body;
  const next = await publication(root, [{ id: 'new-question', text: '비필수 새 질문' }], original.revision);
  const stale = await workStatus(root, { packs: fakePacks() });
  assert.ok(stale.recheck.some((r) => r.nodeId === 'stairwell' && r.contexts?.some((c) => c.kind === 'lore')));
  await done(make, createFakeHost(), { start: { node: 'stairwell', mode: 'recheck' } });
  assert.ok(!(await workStatus(root, { packs: fakePacks() })).stale.some((r) => r.nodeId === 'stairwell' && r.reasons.some((c) => c.kind === 'lore')));
  assert.equal((await openWork(root)).tree.nodes.get('stairwell').body, before);
  const recheck = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'recheck').at(-1);
  assert.equal(recheck.refs.find((r) => r.kind === 'lore').revision, next.revision);
});
