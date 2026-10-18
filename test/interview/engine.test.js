import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFixture } from '../support/fixtures.js';
import { interviewCommand } from '../../core/interview/commands.js';

const VALUES = { purpose: '합성 추리', audience: '성인', language: 'ko', surfaceEase: '쉬운 문장', conceptPacing: '천천히', inferenceLoad: '보통', complexityRamp: '점진적' };
const answers = (values) => Object.entries(values).map(([field, value]) => ({ field, value, raw: `작가 원문: ${value}` }));
const fields = Object.keys(VALUES);
async function confirmed(root) {
  const initial = await interviewCommand(root, { op: 'answer', expectedRev: null, answers: answers(VALUES) });
  return interviewCommand(root, { op: 'confirm', expectedRev: initial.revision, fields, confirmation: '작가의 합성 확인' });
}

test('new sessions retain raw answers and user confirmations; repeated briefs are context only', async () => {
  const root = await copyFixture('knowledge-book'); const ready = await confirmed(root);
  const before = await interviewCommand(root, { op: 'get' });
  assert.deepEqual(before.pending, []);
  await interviewCommand(root, { op: 'context', expectedRev: ready.revision, brief: '같은 합성 추리 브리프' });
  const after = await interviewCommand(root, { op: 'get' });
  assert.deepEqual(after.profile, before.profile); assert.equal(after.revision, before.revision);
  assert.equal(after.profile.language.raw, '작가 원문: ko');
  assert.deepEqual(await interviewCommand(root, { op: 'get', revision: ready.revision }), before);
});

test('only changed axes lose confirmation; changing language requires all four axes again', async () => {
  const root = await copyFixture('knowledge-book'); let state = await confirmed(root);
  state = await interviewCommand(root, { op: 'answer', expectedRev: state.revision, answers: answers({ surfaceEase: VALUES.surfaceEase }) });
  assert.deepEqual(state.pending, []);
  state = await interviewCommand(root, { op: 'answer', expectedRev: state.revision, answers: answers({ inferenceLoad: '높음' }) });
  assert.deepEqual(state.pending, ['inferenceLoad']);
  state = await interviewCommand(root, { op: 'confirm', expectedRev: state.revision, fields: ['inferenceLoad'], confirmation: '해당 축만 확인' });
  state = await interviewCommand(root, { op: 'answer', expectedRev: state.revision, answers: answers({ language: 'en' }) });
  assert.deepEqual(state.pending, ['language', 'surfaceEase', 'conceptPacing', 'inferenceLoad', 'complexityRamp']);
});

test('a context brief cannot create answers or confirmation, and stale writes are refused', async () => {
  const root = await copyFixture('knowledge-book');
  await interviewCommand(root, { op: 'context', expectedRev: null, brief: '영어로 쉬운 합성 작품' });
  const state = await interviewCommand(root, { op: 'get' });
  assert.equal(state.revision, null); assert.deepEqual(state.profile, {});
  await assert.rejects(interviewCommand(root, { op: 'confirm', expectedRev: null, fields: ['language'], confirmation: '추측 확인' }), { code: 'INTERVIEW_ANSWER_MISSING' });
  await confirmed(root);
  await assert.rejects(interviewCommand(root, { op: 'answer', expectedRev: null, answers: answers({ language: 'en' }) }), { code: 'INTERVIEW_REV_STALE' });
});
