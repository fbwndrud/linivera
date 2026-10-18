import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { loreCommand } from '../../core/lore/commands.js';
import { interviewCommand } from '../../core/interview/commands.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { sha256 } from '../../core/util/hash.js';
import { workStatus } from '../../core/status.js';
import { changeAsset } from '../../core/assets/change.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { variantWork, commitMain } from '../support/variant-work.js';
import { appendPlan, trackingPlan } from '../support/tracking.js';
import { checked, syntheticSvg } from '../support/assets.js';

const values = { purpose: 'Synthetic story', audience: 'Adults', language: 'ko', surfaceEase: 'Easy', conceptPacing: 'Gradual', inferenceLoad: 'Low', complexityRamp: 'Slow' };
async function confirmProfile(root) {
  const a = await interviewCommand(root, { op: 'answer', expectedRev: null, answers: Object.entries(values).map(([field, value]) => ({ field, value, raw: `Synthetic author: ${value}` })) });
  return interviewCommand(root, { op: 'confirm', expectedRev: a.revision, fields: Object.keys(values), confirmation: 'Synthetic author confirmation' });
}
async function publish(root, entityId, evidence = [{ id: 'author-proof', basis: 'author', text: 'Synthetic setting' }]) {
  const p = await loreCommand(root, { op: 'propose', expectedRev: null, snapshot: { evidence,
    claims: [{ id: 'setting', entityId, text: 'Synthetic setting', status: 'adopted', support: [evidence[0].id] }] } });
  return loreCommand(root, { op: 'decide', expectedRev: null, proposalId: p.proposalId, action: 'approve', decision: 'Synthetic author adoption' });
}
const finish = (make, host, options) => driveToEnd(make, host, { ...options, until: (o) => o.status === 'done' });

test('variant requests and receipts bind author context; a translation receipt cannot prove a main-text anchor', async () => {
  const root = await variantWork(); const text = '합성 확정 원고.';
  await commitMain(root, 'ep-001', text);
  const profile = await confirmProfile(root); const lore = await publish(root, 'hana');
  const make = () => createRunner({ root, packs: fakePacks() });
  const first = await make().run({ node: 'ep-001', variant: 'en' });
  assert.equal(first.requests[0].payload.variant.lang, 'en');
  assert.equal(first.requests[0].payload.interview.confirmed.language, 'ko');
  assert.equal(first.requests[0].payload.lore.revision, lore.revision);
  const trail = await finish(make, createFakeHost({ drafts: { '*': text } }), { from: first });
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.receiptId === trail.at(-1).receiptId);
  assert.equal(receipt.refs.find((r) => r.kind === 'interview').rev, profile.revision);
  assert.equal(receipt.refs.find((r) => r.kind === 'lore').revision, lore.revision);
  assert.equal((await openWork(root)).tree.nodes.get('ep-001').body, text);
  assert.deepEqual((await workStatus(root, { packs: fakePacks() })).variants.en.stale, []);
  await assert.rejects(loreCommand(root, { op: 'propose', expectedRev: lore.revision, snapshot: { evidence: [{ id: 'variant-proof', basis: 'explicit', text: 'Wrong review scope',
    anchor: { kind: 'node', id: 'ep-001', rev: sha256(text), quote: text, receiptId: receipt.receiptId } }] } }), { code: 'LORE_NODE_RECEIPT_INVALID' });
});

test('a recorded commit resumes exactly once with its pinned lore after source content changes', async () => {
  const root = await copyFixture('knowledge-book'); await useFakePack(root);
  await confirmProfile(root); const source = (await openWork(root)).sources.get('cell-notes');
  const lore = await publish(root, 'atp', [{ id: 'source-proof', basis: 'explicit', text: 'Synthetic source evidence',
    anchor: { kind: 'source', id: source.id, rev: source.rev, quote: 'ATP는 세포의 에너지 화폐로 불린다.' } }]);
  const make = (hooks = {}) => createRunner({ root, packs: fakePacks(), hooks });
  const gate = (await driveToEnd(make, createFakeHost(), { start: { node: 'atp-section' }, until: (o) => o.status === 'needs_user' })).at(-1);
  await assert.rejects(make({ afterReceiptWrite() { throw Error('Synthetic interruption'); } }).decide({ runId: gate.runId, action: 'approve' }), /Synthetic interruption/);
  await assert.rejects(interviewCommand(root, { op: 'context', expectedRev: (await interviewCommand(root, { op: 'get' })).revision, brief: 'Repeated brief' }), { code: 'INTERVIEW_RUN_OPEN' });
  const path = join(root, 'sources', source.file); await writeFile(path, await readFile(path, 'utf8') + '\nSynthetic correction\n');
  assert.deepEqual((await loreCommand(root, { op: 'get' })).staleAdopted, ['setting']);
  assert.equal((await make().run({ node: 'atp-section' })).status, 'done');
  const records = await openLedger(root, 'receipts').readAll();
  assert.equal(records.filter((r) => r.type === 'receipt').length, 1); assert.equal(records.filter((r) => r.type === 'commit').length, 1);
  assert.equal(records[0].refs.find((r) => r.kind === 'lore').revision, lore.revision);
});

test('tracking-managed subjects can anchor lore and asset review without false missing-definition invalidation', async () => {
  const root = await copyFixture('novel-3level'); await useFakePack(root);
  await appendPlan(root, normalizePlan(trackingPlan({ delegation: { addSubjects: true, addObservations: true } })));
  const text = '합성 열쇠는 문 옆에 있다.';
  const host = createFakeHost({ drafts: { '*': text }, events: { '*': (p) => {
    const evidence = { nodeId: p.node.id, textHash: sha256(text), quote: '합성 열쇠' };
    return { events: [], tracking: { planRev: p.tracking.plan.rev, discoveries: { subjects: [{ id: 'key', kind: 'object', name: '합성 열쇠', aliases: [], body: '', data: {}, evidence }], criteria: [] },
      observations: [{ subjectId: 'key', criterionId: 'owner', value: '문', basis: 'explicit', evidence }], checked: ['owner'] } };
  } } });
  await finish(() => createRunner({ root, packs: fakePacks() }), host, { start: { node: 'stairwell' } });
  await publish(root, 'key'); assert.equal((await loreCommand(root, { op: 'get' })).canon[0].entityId, 'key');
  let a = (await changeAsset(root, { op: 'add', id: 'key-image', brief: { entities: ['key'] } })).asset;
  const path = join(root, 'synthetic.svg'); await writeFile(path, syntheticSvg());
  a = (await changeAsset(root, { op: 'put', id: a.id, expectedRev: a.rev, path, mediaType: 'image/svg+xml' })).asset;
  a = (await changeAsset(root, { op: 'review', id: a.id, expectedRev: a.rev, contentHash: a.output.contentHash, checked, findings: [] })).asset;
  a = (await changeAsset(root, { op: 'decide', id: a.id, expectedRev: a.rev, reviewId: a.review.reviewId, action: 'approve' })).asset;
  assert.equal(a.approved, true); assert.equal((await openWork(root)).assets.get(a.id).approved, true);
});


test('adding an interview after a variant was finalized marks that old variant for review', async () => {
  const root = await variantWork(); await commitMain(root, 'ep-001', '합성 원본.');
  await finish(() => createRunner({ root, packs: fakePacks() }), createFakeHost({ drafts: { '*': 'Synthetic translation.' } }), { start: { node: 'ep-001', variant: 'en' } });
  assert.deepEqual((await workStatus(root, { packs: fakePacks() })).variants.en.stale, []);
  const profile = await confirmProfile(root);
  const reasons = (await workStatus(root, { packs: fakePacks() })).variants.en.stale[0].reasons;
  assert.ok(reasons.some((r) => r.kind === 'interview' && r.was === null && r.now === profile.revision));
});
