import test from 'node:test';
import assert from 'node:assert/strict';
import { accessFixture } from './fixture.js';
import { retainConnectionReadiness } from '../../core/access/compare.js';
import { assertConnectionForRequest, verifyConnectionReadiness } from '../../core/access/verify.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';
import { collectInputClosure } from '../../core/resources/input-closure.js';
import { selectInput } from '../../core/resources/input-selections.js';
import { startOperation } from '../../core/operations/requests.js';

async function report(f, checkValue) {
  const check = await f.put('context', 'connection-check', checkValue, { select: true });
  return retainConnectionReadiness(f.root, { resourceId: 'readiness', ...f.input, checkRevisionId: check.revisionId });
}
async function fixedInput(f, reports) {
  const revisions = await collectInputClosure(f.root, reports.map((row) => row.revisionId));
  const selection = await selectInput(f.root, { scopeId: 'story', expectedScopeSelectionRevision: null, actor: 'user', reason: 'Preserve both synthetic historical and current observations.',
    bindings: revisions.map((row, index) => ({ bindingKey: 'revision-' + index, role: 'context', resourceId: row.resourceId, revisionId: row.revisionId, mode: 'fixed' })),
    profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
  return prepareInput(f.root, { version: 2, scopeId: 'story', scopeSelectionRevision: selection.scopeSelectionRevision,
    profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
}

test('new observation supersedes historical reports of the same exact request without changing old Input hashes', async (t) => {
  const f = await accessFixture(t);
  const old = await report(f, { ...f.checkValue, checkedAt: new Date(Date.now() - 400000).toISOString(), expiresAt: new Date(Date.now() + 10000).toISOString() });
  // Retain a report evaluated while the old observation was valid, then let time move forward.
  const { buildConnectionReadiness } = await import('../../core/access/compare.js');
  const { readWorkspaceState } = await import('../../core/publications/state.js');
  const oldValue = JSON.parse((await f.store.readContent(old.revisionId)).toString('utf8'));
  const historicalValue = await buildConnectionReadiness(f.root, oldValue.input, await readWorkspaceState(f.root), new Date(Date.now() - 350000).toISOString());
  const historical = await f.put('readiness', 'connection-readiness', historicalValue);
  const before = await fixedInput(f, [historical]);
  // New report is later than the historical host observation, irrespective of report creation order.
  const fresh = await report(f, { ...f.checkValue, checkedAt: new Date(Date.now() - 1).toISOString() });
  const { readInputSelection } = await import('../../core/resources/input-selections.js');
  const prior = await readInputSelection(f.root, 'story');
  // Build a second explicit scope rather than mutate the old fixed Input's content.
  const all = await collectInputClosure(f.root, [historical.revisionId, fresh.revisionId]);
  const selected = await selectInput(f.root, { scopeId: 'story', expectedScopeSelectionRevision: prior.scopeSelectionRevision, actor: 'user', reason: 'Keep old observation with a fresh recheck.',
    bindings: [...prior.bindings, ...all.filter((row) => !prior.bindings.some((binding) => binding.revisionId === row.revisionId)).map((row, index) => ({ bindingKey: 'new-' + index, role: 'context', resourceId: row.resourceId, revisionId: row.revisionId, mode: 'fixed' }))],
    profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
  const after = await prepareInput(f.root, { version: 2, scopeId: 'story', scopeSelectionRevision: selected.scopeSelectionRevision, profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
  const ready = await assertConnectionForRequest(f.root, after.manifest, f.request.revisionId, { requireReport: true });
  assert.deepEqual(ready.connectionReadinessRevisionIds, [fresh.revisionId]);
  assert.deepEqual(ready.ignoredHistoricalReportRevisionIds, [historical.revisionId]);
  await startOperation(f.root, { inputSnapshotId: after.inputSnapshotId, requestRevisionId: f.request.revisionId, operationContractVersion: 2, actor: 'user', idempotencyKey: 'same-request-rechecked' });
  assert.equal((await verifyInput(f.root, before.inputSnapshotId)).inputSnapshotId, before.inputSnapshotId);
  assert.equal((await verifyInput(f.root, before.inputSnapshotId)).manifest.resources.find((row) => row.revisionId === historical.revisionId).contentHash, historical.contentHash);
});

test('a later blocked permission observation cannot fall back to an older ready report', async (t) => {
  const f = await accessFixture(t);
  const blocked = await report(f, { ...f.checkValue, checkedAt: new Date(Date.now() - 1).toISOString(), checks: f.checkValue.checks.map((row) => row.kind === 'permission' ? { ...row, status: 'blocked', reasonCode: 'permission-denied' } : row) });
  // A report created later cannot make its older passed observation current again.
  const passed = await report(f, f.checkValue);
  const manifest = { resources: [passed, blocked] };
  await assert.rejects(assertConnectionForRequest(f.root, manifest, f.request.revisionId, { requireReport: true }), { code: 'CONNECTION_NOT_READY' });
  await verifyConnectionReadiness(f.root, JSON.parse((await f.store.readContent(passed.revisionId)).toString('utf8')));
});

test('conflicting observations at the latest identical timestamp all require validation', async (t) => {
  const f = await accessFixture(t); const passed = await report(f, f.checkValue);
  const blocked = await report(f, { ...f.checkValue, checks: f.checkValue.checks.map((row) => row.kind === 'permission' ? { ...row, status: 'blocked', reasonCode: 'permission-denied' } : row) });
  await assert.rejects(assertConnectionForRequest(f.root, { resources: [blocked, passed] }, f.request.revisionId), { code: 'CONNECTION_NOT_READY' });
});

test('account/project/route groups are independent and host options choose only the actual group', async (t) => {
  const f = await accessFixture(t); const passed = await report(f, f.checkValue);
  const deniedCheck = await f.put('context', 'connection-check', { ...f.checkValue, accountAlias: 'account-another', checkedAt: new Date(Date.now() - 1).toISOString(), checks: f.checkValue.checks.map((row) => row.kind === 'permission' ? { ...row, status: 'blocked', reasonCode: 'permission-denied' } : row) });
  const denied = await retainConnectionReadiness(f.root, { resourceId: 'readiness', ...f.input, accountAlias: 'account-another', checkRevisionId: deniedCheck.revisionId });
  const manifest = { resources: [denied, passed] };
  await assert.rejects(assertConnectionForRequest(f.root, manifest, f.request.revisionId), { code: 'CONNECTION_NOT_READY' });
  const ready = await assertConnectionForRequest(f.root, manifest, f.request.revisionId, { requireReport: true, accountAlias: f.input.accountAlias, projectAlias: f.input.projectAlias, accessSpecificationRevisionId: f.input.accessSpecificationRevisionId });
  assert.deepEqual(ready.connectionReadinessRevisionIds, [passed.revisionId]);
  assert.deepEqual(ready.ignoredHistoricalReportRevisionIds, []);
});

test('fixed old connection checks cannot hide a known newly selected blocked observation', async (t) => {
  const f = await accessFixture(t); const passed = await report(f, f.checkValue); const sealed = await fixedInput(f, [passed]);
  await f.put('context', 'connection-check', { ...f.checkValue, checkedAt: new Date(Date.now() - 1).toISOString(), checks: f.checkValue.checks.map((row) => row.kind === 'permission' ? { ...row, status: 'blocked', reasonCode: 'permission-denied' } : row) }, { select: true });
  await assert.rejects(startOperation(f.root, { inputSnapshotId: sealed.inputSnapshotId, requestRevisionId: f.request.revisionId, operationContractVersion: 2, actor: 'user', idempotencyKey: 'fixed-old-check' }), { code: 'CONNECTION_READINESS_STALE' });
  assert.equal((await verifyInput(f.root, sealed.inputSnapshotId)).inputSnapshotId, sealed.inputSnapshotId);
});

test('fixed old connection reports cannot hide a known newly selected blocked report', async (t) => {
  const f = await accessFixture(t); const passed = await report(f, f.checkValue); const sealed = await fixedInput(f, [passed]);
  const blockedCheck = await f.put('context', 'connection-check', { ...f.checkValue, checkedAt: new Date(Date.now() - 1).toISOString(), checks: f.checkValue.checks.map((row) => row.kind === 'permission' ? { ...row, status: 'blocked', reasonCode: 'permission-denied' } : row) });
  const blocked = await retainConnectionReadiness(f.root, { resourceId: 'readiness', ...f.input, checkRevisionId: blockedCheck.revisionId });
  await f.store.decideSource({ revisionId: blocked.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
  await assert.rejects(startOperation(f.root, { inputSnapshotId: sealed.inputSnapshotId, requestRevisionId: f.request.revisionId, operationContractVersion: 2, actor: 'user', idempotencyKey: 'fixed-old-report' }), { code: 'CONNECTION_READINESS_STALE' });
  assert.equal((await verifyInput(f.root, sealed.inputSnapshotId)).inputSnapshotId, sealed.inputSnapshotId);
});
