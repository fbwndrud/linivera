import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFixture } from '../support/fixtures.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { loreCommand } from '../../core/lore/commands.js';
import { readLore } from '../../core/lore/read.js';
import { interviewCommand } from '../../core/interview/commands.js';
import { readInterview } from '../../core/interview/read.js';
import { revisionOf as profileRevision } from '../../core/interview/schema.js';

const data = { evidence: [{ id: 'a', basis: 'author', text: '합성 작가 설정' }], claims: [{ id: 'c', entityId: 'atp', text: '합성 작가 설정', status: 'adopted', support: ['a'] }] };

test('a chain-valid publication without a reviewed proposal is rejected during replay', async () => {
  const root = await copyFixture('knowledge-book');
  await openLedger(root, 'lore').append({ type: 'lore_publication', proposalId: 'missing', parentRev: null, revision: 'forged', version: 1, snapshot: data, source: 'user', decision: '합성 위조' });
  await assert.rejects(readLore(root), { code: 'LORE_RECORD_INVALID' });
});

test('an answer record cannot forge user confirmation by changing its snapshot', async () => {
  const root = await copyFixture('knowledge-book');
  const profile = { language: { value: 'ko', raw: '한국어', confirmed: true, confirmation: { text: '만들어진 확인', language: 'ko' } } };
  await openLedger(root, 'interview').append({ type: 'interview_answer', source: 'user', parentRev: null, revision: profileRevision(null, profile), profile, answers: [{ field: 'language', value: 'ko', raw: '한국어' }] });
  await assert.rejects(readInterview(root), { code: 'INTERVIEW_RECORD_INVALID' });
});

test('rejected proposals remain inspectable and cannot be approved afterward', async () => {
  const root = await copyFixture('knowledge-book');
  const p = await loreCommand(root, { op: 'propose', expectedRev: null, snapshot: data });
  await loreCommand(root, { op: 'decide', expectedRev: null, proposalId: p.proposalId, action: 'reject', decision: '작가가 설정 보류' });
  const saved = await loreCommand(root, { op: 'get', proposalId: p.proposalId });
  assert.equal(saved.decided, true); assert.equal(saved.snapshot.claims[0].text, data.claims[0].text);
  await assert.rejects(loreCommand(root, { op: 'decide', expectedRev: null, proposalId: p.proposalId, action: 'approve', decision: '재사용 불가' }), { code: 'LORE_ALREADY_DECIDED' });
  assert.equal((await loreCommand(root, { op: 'get' })).revision, null);
});

test('simultaneous interview writers cannot overwrite the same revision', async () => {
  const root = await copyFixture('knowledge-book');
  const results = await Promise.allSettled(['ko', 'en'].map((value) => interviewCommand(root, { op: 'answer', expectedRev: null, answers: [{ field: 'language', value, raw: value }] })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'INTERVIEW_REV_STALE');
});
