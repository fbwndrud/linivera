import test from 'node:test';
import assert from 'node:assert/strict';
import { accessFixture } from './fixture.js';
import { compareConnectionReadiness, retainConnectionReadiness } from '../../core/access/compare.js';
import { assertConnectionCurrent, assertConnectionForRequest, verifyConnectionReadiness } from '../../core/access/verify.js';
import { collectInputClosure } from '../../core/resources/input-closure.js';
import { assertContextIsolation } from '../../core/context/isolation.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';
import { startOperation } from '../../core/operations/requests.js';

async function seal(f, revisionId) {
  const revision = await f.store.readRevision(revisionId); const current = await f.store.readSourceSelection(revision.resourceId);
  if (current?.revisionId !== revisionId) await f.store.decideSource({ revisionId, expectedSelectionRevision: current?.selectionRevision ?? null, action: { type: 'select', actor: 'user' } });
  return prepareInput(f.root, { revisionIds: [revisionId], profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
}

test('connection checks are exact scoped host attestations, not secrets or internal authority', async (t) => {
  const f = await accessFixture(t); const report = await compareConnectionReadiness(f.root, f.input);
  assert.equal(report.readiness.canPrepare, true); assert.equal(report.decision.providerAccountIndependentlyVerified, false);
  assert.equal(report.decision.internalExecutionAuthority, 'not-granted');
  const retained = await retainConnectionReadiness(f.root, { resourceId: 'readiness', ...f.input });
  const closure = await collectInputClosure(f.root, [retained.revisionId]);
  for (const revision of [f.check, f.access, f.request, f.specification, f.source, f.instruction]) assert.ok(closure.some((row) => row.revisionId === revision.revisionId));
  const sealed = await seal(f, retained.revisionId);
  assert.equal((await assertConnectionForRequest(f.root, sealed.manifest, f.request.revisionId, { requireReport: true })).ready, true);
});

test('each required installation/exposure/permission failure remains distinct and blocks input', async (t) => {
  const f = await accessFixture(t);
  for (const [kind, status, reasonCode] of [['installation', 'blocked', 'not-installed'], ['exposure', 'unknown', 'not-exposed'], ['permission', 'partial', 'partial-check']]) {
    const check = await f.put('context', 'connection-check', { ...f.checkValue, checks: f.checkValue.checks.map((row) => row.kind === kind ? { ...row, status, reasonCode } : row) });
    const report = await compareConnectionReadiness(f.root, { ...f.input, checkRevisionId: check.revisionId });
    assert.equal(report.checks.find((row) => row.kind === kind).effectiveStatus, status); assert.equal(report.readiness.canPrepare, false);
    const retained = await f.put('readiness', 'connection-readiness', report);
    await assert.rejects(collectInputClosure(f.root, [retained.revisionId]), { code: 'CONNECTION_NOT_READY' });
  }
});

test('declarations alone cannot prove a required check and independent unrequired facts remain visible', async (t) => {
  const f = await accessFixture(t);
  const check = await f.put('context', 'connection-check', { ...f.checkValue, checks: f.checkValue.checks.map((row) => row.kind === 'permission' ? { ...row, basis: 'user-declaration' } : row.kind === 'credits' ? { ...row, status: 'unknown', reasonCode: 'credits-unconfirmed' } : row) });
  const report = await compareConnectionReadiness(f.root, { ...f.input, checkRevisionId: check.revisionId });
  assert.equal(report.readiness.canPrepare, false);
  assert.equal(report.checks.find((row) => row.kind === 'permission').effectiveStatus, 'partial');
  assert.equal(report.checks.find((row) => row.kind === 'credits').required, false);
  assert.equal(report.checks.find((row) => row.kind === 'credits').status, 'unknown');
});

test('expired host checks cannot prepare input; historical retained report is independently verifiable', async (t) => {
  const f = await accessFixture(t); const report = await compareConnectionReadiness(f.root, f.input);
  const retained = await f.put('readiness', 'connection-readiness', report, { select: true }); const sealed = await seal(f, retained.revisionId);
  const clock = Date.now; Date.now = () => clock() + 600000;
  try {
    await verifyConnectionReadiness(f.root, report); await verifyInput(f.root, sealed.inputSnapshotId);
    await assert.rejects(assertConnectionCurrent(f.root, retained.revisionId), { code: 'CONNECTION_CHECK_EXPIRED' });
    await assert.rejects(startOperation(f.root, { inputSnapshotId: sealed.inputSnapshotId, idempotencyKey: 'expired-new-operation', actor: 'user', operationContractVersion: 2, requestRevisionId: f.request.revisionId }), { code: 'CONNECTION_CHECK_EXPIRED' });
  } finally { Date.now = clock; }
  const check = await f.put('context', 'connection-check', { ...f.checkValue, checkedAt: new Date(clock() - 600000).toISOString(), expiresAt: new Date(clock() - 300000).toISOString() });
  assert.equal((await compareConnectionReadiness(f.root, { ...f.input, checkRevisionId: check.revisionId })).freshness.status, 'expired');
});

test('account/project/route/request binding and nested scope isolation fail closed', async (t) => {
  const f = await accessFixture(t);
  for (const changed of [{ accountAlias: 'account-other' }, { projectAlias: 'project-other' }, { pathId: 'other' }, { scopeId: 'other' }, { accessSpecificationRevisionId: f.specification.revisionId }]) await assert.rejects(compareConnectionReadiness(f.root, { ...f.input, ...changed }), { code: 'CONNECTION_READINESS_INVALID' });
  const retained = await retainConnectionReadiness(f.root, { resourceId: 'readiness', ...f.input });
  await assert.rejects(assertContextIsolation(f.root, [retained.revisionId], { scopeId: 'another', pathId: 'main' }), { code: 'CONTEXT_SCOPE_MISMATCH' });
  const sealed = await seal(f, retained.revisionId);
  const other = await f.put('request', 'generation-request', { ...f.requestValue, parameters: { instruction: 'Substituted request' } });
  await assert.rejects(assertConnectionForRequest(f.root, sealed.manifest, other.revisionId), { code: 'CONNECTION_REQUEST_MISMATCH' });
});

test('changed selected checks stale new work while old input hashes remain fixed', async (t) => {
  const f = await accessFixture(t); const retained = await retainConnectionReadiness(f.root, { resourceId: 'readiness', ...f.input });
  const sealed = await seal(f, retained.revisionId);
  await f.put('context', 'connection-check', { ...f.checkValue, accountAlias: 'account-another' }, { select: true });
  await assert.rejects(assertConnectionCurrent(f.root, retained.revisionId), { code: 'CONNECTION_READINESS_STALE' });
  const verified = await verifyInput(f.root, sealed.inputSnapshotId);
  assert.equal(verified.manifest.resources.find((row) => row.revisionId === f.check.revisionId).contentHash, f.check.contentHash);
});

test('raw secret fields, free messages, query URLs, duplicate checks and forged reports are rejected before retention', async (t) => {
  const f = await accessFixture(t);
  for (const secret of [{ token: 'synthetic-secret' }, { headers: { authorization: 'synthetic-secret' } }, { rawResponse: 'https://example.invalid/?token=secret' }, { accountAlias: 'secret-value' }, { checkedAt: '2099-01-01T00:00:00.000Z', expiresAt: '2099-01-01T01:00:00.000Z' }]) await assert.rejects(f.put('context', 'connection-check', { ...f.checkValue, ...secret }), { code: 'CONNECTION_READINESS_INVALID' });
  const checks = structuredClone(f.checkValue.checks); checks[0].message = 'synthetic auth raw message';
  await assert.rejects(f.put('context', 'connection-check', { ...f.checkValue, checks }), { code: 'CONNECTION_READINESS_INVALID' });
  const report = await compareConnectionReadiness(f.root, f.input); report.readiness.canPrepare = false;
  await assert.rejects(f.put('readiness', 'connection-readiness', report), { code: 'CONNECTION_READINESS_INVALID' });
});

test('legacy inputs remain usable but explicit host route validation requires a retained check', async (t) => {
  const f = await accessFixture(t); const sealed = await seal(f, f.request.revisionId);
  assert.equal((await assertConnectionForRequest(f.root, sealed.manifest, f.request.revisionId)).ready, false);
  await assert.rejects(assertConnectionForRequest(f.root, sealed.manifest, f.request.revisionId, { requireReport: true }), { code: 'CONNECTION_READINESS_REQUIRED' });
});

test('online route independently requires authentication, plan and credits; installation never implies account readiness', async (t) => {
  const { onlineAccessFixture } = await import('./fixture.js'); const f = await onlineAccessFixture(t);
  for (const [kind, status, reasonCode] of [['authentication', 'blocked', 'not-authenticated'], ['permission', 'blocked', 'permission-denied'], ['plan', 'blocked', 'plan-required'], ['credits', 'unknown', 'credits-unconfirmed'], ['credits', 'blocked', 'credits-insufficient'], ['authentication', 'expired', 'expired'], ['plan', 'partial', 'partial-check']]) {
    const check = await f.put('context', 'connection-check', { ...f.checkValue, checks: f.checkValue.checks.map((row) => row.kind === kind ? { ...row, status, reasonCode } : row) });
    const report = await compareConnectionReadiness(f.root, { ...f.input, checkRevisionId: check.revisionId });
    assert.equal(report.readiness.canPrepare, false); assert.equal(report.checks.find((row) => row.kind === kind).effectiveStatus, status);
    assert.ok(report.checks.find((row) => row.kind === kind).nextAction);
  }
});

test('fresh operation keeps policy authority separate and host route validation binds actual account/project/access', async (t) => {
  const f = await accessFixture(t);
  const policy = await f.put('policy', 'policy', { ...JSON.parse((await f.store.readContent(f.input.policyRevisionId)).toString('utf8')), mode: 'Strict' }, { select: true });
  f.input.policyRevisionId = policy.revisionId;
  const retained = await retainConnectionReadiness(f.root, { resourceId: 'readiness', ...f.input });
  const sealed = await seal(f, retained.revisionId);
  const options = { requireReport: true, accountAlias: f.input.accountAlias, projectAlias: f.input.projectAlias, accessSpecificationRevisionId: f.input.accessSpecificationRevisionId };
  const verified = await assertConnectionForRequest(f.root, sealed.manifest, f.request.revisionId, options);
  assert.equal(verified.accountAlias, f.input.accountAlias);
  for (const changed of [{ accountAlias: 'account-other' }, { projectAlias: 'project-other' }, { accessSpecificationRevisionId: f.specification.revisionId }]) await assert.rejects(assertConnectionForRequest(f.root, sealed.manifest, f.request.revisionId, { ...options, ...changed }), { code: 'CONNECTION_REQUEST_MISMATCH' });
  const operation = await startOperation(f.root, { inputSnapshotId: sealed.inputSnapshotId, idempotencyKey: 'fresh-checked', actor: 'user', operationContractVersion: 2, requestRevisionId: f.request.revisionId });
  assert.ok(operation.operationId);
  await assert.rejects(startOperation(f.root, { inputSnapshotId: sealed.inputSnapshotId, idempotencyKey: 'fresh-unapproved-host', actor: 'host', operationContractVersion: 2, requestRevisionId: f.request.revisionId }), { code: 'POLICY_DENIED' });
});

test('model/endpoint substitution cannot bypass a report for the same capability', async (t) => {
  const { onlineAccessFixture } = await import('./fixture.js'); const f = await onlineAccessFixture(t);
  const retained = await retainConnectionReadiness(f.root, { resourceId: 'readiness', ...f.input }); const sealed = await seal(f, retained.revisionId);
  for (const changed of [{ model: 'other-model' }, { endpoint: 'another-endpoint' }]) {
    const request = await f.put('request', 'generation-request', { ...f.requestValue, ...changed });
    await assert.rejects(assertConnectionForRequest(f.root, sealed.manifest, request.revisionId), { code: 'CONNECTION_REQUEST_MISMATCH' });
  }
});

test('tool metadata and inapplicable declarations cannot prove required account permissions or credits', async (t) => {
  const { onlineAccessFixture } = await import('./fixture.js'); const f = await onlineAccessFixture(t);
  for (const changed of [{ kind: 'authentication', basis: 'host-tool-metadata' }, { kind: 'permission', basis: 'host-tool-metadata' }, { kind: 'credits', reasonCode: 'not-applicable' }]) {
    const check = await f.put('context', 'connection-check', { ...f.checkValue, checks: f.checkValue.checks.map((row) => row.kind === changed.kind ? { ...row, ...changed } : row) });
    const report = await compareConnectionReadiness(f.root, { ...f.input, checkRevisionId: check.revisionId });
    assert.equal(report.readiness.canPrepare, false); assert.equal(report.checks.find((row) => row.kind === changed.kind).effectiveStatus, 'partial');
  }
});

test('another capability can retain expired historical connection evidence without treating it as current authorization', async (t) => {
  const { onlineAccessFixture } = await import('./fixture.js'); const f = await onlineAccessFixture(t);
  const { getCapabilitySpec } = await import('../../packs/production/capabilities.js');
  const retained = await retainConnectionReadiness(f.root, { resourceId: 'readiness', ...f.input }); const sealed = await seal(f, retained.revisionId);
  const request = await f.put('request', 'generation-request', { version: 1, ...getCapabilitySpec('local-broker-v1').identity,
    parameters: { instruction: 'Count retained bytes' }, inputBindings: [{ fieldPath: 'instruction', role: 'instruction', revisionId: f.instruction.revisionId }, { fieldPath: 'source', role: 'source', revisionId: f.source.revisionId }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'one', slots: [{ role: 'result', required: true, acceptableMediaTypes: ['application/json'] }] }] } });
  const clock = Date.now; Date.now = () => clock() + 600000;
  try {
    assert.equal((await assertConnectionForRequest(f.root, sealed.manifest, request.revisionId)).ready, false);
    await assert.rejects(assertConnectionForRequest(f.root, sealed.manifest, request.revisionId, { requireReport: true }), { code: 'CONNECTION_READINESS_REQUIRED' });
  } finally { Date.now = clock; }
});
