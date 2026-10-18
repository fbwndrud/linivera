import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { createRunStore } from '../../core/run/run-store.js';
import { versionDigest } from '../../core/assets/schema.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { setupAssets } from '../support/assets.js';
import { createRunner } from '../../core/run/runner.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';

const BODY = '합성 본문. ![[asset:scoped]]\n';
async function setup(brief) {
  const s = await setupAssets();
  s.ok(await s.call('folio_structure', { op: 'add', level: 'scene', id: 'scene-b' }));
  const a = s.ok(await s.asset({ op: 'add', id: 'scoped', brief })).asset;
  const make = () => createRunner({ root: s.root, packs: s.packs });
  const host = createFakeHost({ drafts: { 'scene-b': BODY } });
  return { s, a, make, host };
}

test('a generated out-of-scope asset reference blocks safely and the run can be abandoned', async () => {
  const { s, a, make, host } = await setup({ scope: { nodeIds: ['toy-scene'] } });
  const blocked = (await driveToEnd(make, host, { start: { node: 'scene-b' }, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.equal(blocked.question.code, 'ASSET_SCOPE_MISMATCH');
  assert.equal(blocked.question.canApprove, false);
  assert.equal(blocked.question.draft, BODY);
  await assert.rejects(make().decide({ runId: blocked.runId, action: 'approve' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  assert.equal((await make().decide({ runId: blocked.runId, action: 'skip', reason: '잘못된 참조를 고쳐 재실행' })).status, 'skipped');
  assert.equal(s.ok(await s.call('folio_status', {})).activeRun, null);
  assert.equal((await s.asset({ op: 'update', id: a.id, expectedRev: a.rev, brief: {} })).ok, true);
  const done = (await driveToEnd(make, host, { start: { node: 'scene-b' }, until: (o) => o.status === 'done' })).at(-1);
  assert.equal(done.status, 'done');
});

test('scope narrowing cannot strand an existing inline reference or break status reads', async () => {
  const { s, a, make, host } = await setup({});
  await driveToEnd(make, host, { start: { node: 'scene-b' }, until: (o) => o.status === 'done' });
  const history = (await s.get('scoped')).history;
  const changed = await s.asset({ op: 'update', id: a.id, expectedRev: a.rev, brief: { scope: { nodeIds: ['toy-scene'] } } });
  assert.equal(changed.error.code, 'ASSET_SCOPE_MISMATCH');
  assert.deepEqual((await s.get('scoped')).history, history);
  assert.equal((await s.call('folio_status', {})).ok, true);
});


test('an asset scope error cannot make a receipt-locked committing run abandonable', async () => {
  const { s, a, host } = await setup({ scope: { nodeIds: ['toy-scene', 'scene-b'] } });
  let crash = true;
  const make = () => createRunner({ root: s.root, packs: s.packs, hooks: { afterBodyWrite() { if (crash) { crash = false; throw new Error('synthetic crash'); } } } });
  await assert.rejects(driveToEnd(make, host, { start: { node: 'scene-b' } }), /synthetic crash/);
  const runId = s.ok(await s.call('folio_status', {})).activeRun.runId;
  // Simulate an external ledger writer; public asset writes already refuse an open run.
  const changeScope = async (version, nodeIds) => {
    const record = { type: 'asset_version', id: a.id, version, title: a.title, brief: { scope: { nodeIds } }, output: null };
    record.versionDigest = versionDigest(record);
    await openLedger(s.root, 'assets').append(record);
  };
  await changeScope(2, ['toy-scene']);
  await assert.rejects(make().run({ node: 'scene-b' }), { code: 'ASSET_SCOPE_MISMATCH' });
  assert.equal((await createRunStore(s.root).load(runId)).state, 'committing');
  await assert.rejects(make().decide({ runId, action: 'skip', reason: 'must remain locked' }), { code: 'RUN_NOT_AWAITING_USER' });
  assert.deepEqual((await openLedger(s.root, 'receipts').readAll()).map((r) => r.type), ['receipt']);
  await changeScope(3, ['toy-scene', 'scene-b']);
  assert.equal((await make().run({ node: 'scene-b' })).status, 'done');
  assert.deepEqual((await openLedger(s.root, 'receipts').readAll()).map((r) => r.type), ['receipt', 'commit']);
});


test('status reports a manual out-of-scope reference without losing open-run and drift information', async () => {
  const { s, make, host } = await setup({ scope: { nodeIds: ['toy-scene'] } });
  await driveToEnd(make, createFakeHost(), { start: { node: 'scene-b' }, until: (o) => o.status === 'done' });
  const work = await openWork(s.root);
  await updateNode(s.root, work.tree.nodes.get('scene-b'), { data: { assets: ['scoped'] } });
  const status = s.ok(await s.call('folio_status', {}));
  assert.equal(status.activeRun, null);
  assert.ok(status.stale.some((r) => r.nodeId === 'scene-b' && r.reasons.some((reason) => reason.code === 'ASSET_SCOPE_MISMATCH')));
  const blocked = (await driveToEnd(make, host, { start: { node: 'scene-b' }, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.equal(blocked.question.code, 'ASSET_SCOPE_MISMATCH'); assert.equal(blocked.question.canApprove, false);
  assert.equal(s.ok(await s.call('folio_status', {})).activeRun.runId, blocked.runId);
});
