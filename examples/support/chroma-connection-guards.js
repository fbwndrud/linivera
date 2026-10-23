import assert from 'node:assert/strict';

export const connectionGuardScope = ['connection-guard-check', 'connection-guard-report'];
/** Connection failures over actual Linivera MCP. No provider calls or credentials. */
export async function chromaConnectionGuards(host, s, snapshot) {
  const { call, attempt } = host;
  const original = await s.readJson('official-check'); const report = await s.readJson('official-connection');
  const cases = [
    ['installation', 'blocked', 'not-installed'], ['exposure', 'blocked', 'not-exposed'],
    ['authentication', 'blocked', 'not-authenticated'], ['permission', 'blocked', 'permission-denied'],
    ['plan', 'blocked', 'plan-required'], ['credits', 'unknown', 'credits-unconfirmed'],
    ['credits', 'blocked', 'credits-insufficient'], ['authentication', 'partial', 'partial-check'], ['credits', 'expired', 'expired'],
  ];
  for (const [kind, status, reasonCode] of cases) {
    const check = { ...original, checks: original.checks.map((row) => row.kind === kind ? { ...row, status, reasonCode } : row) };
    const revision = await call('folio_resource_query', { op: 'retainConnectionCheck', resourceId: 'connection-guard-check', check });
    const compared = await call('folio_resource_query', { op: 'retainConnectionReadiness', resourceId: 'connection-guard-report', ...report.input, checkRevisionId: revision.revisionId });
    const value = JSON.parse((await call('folio_resources', { op: 'read', revisionId: compared.revisionId })).content);
    assert.equal(value.readiness.canPrepare, false, `${kind}:${status}`);
    assert.ok(value.checks.find((row) => row.kind === kind).nextAction);
    await s.keep('connection-guard-report', compared);
    const error = await attempt('folio_inputs', { op: 'prepare', ...host.definitions, revisionIds: [compared.revisionId] });
    assert.equal(error.code, 'CONNECTION_NOT_READY');
  }
  const expired = { ...original, checkedAt: new Date(Date.now() - 360000).toISOString(), expiresAt: new Date(Date.now() - 60000).toISOString() };
  const expiredCheck = await call('folio_resource_query', { op: 'retainConnectionCheck', resourceId: 'connection-guard-check', check: expired });
  const expiredReport = await call('folio_resource_query', { op: 'connectionReadiness', ...report.input, checkRevisionId: expiredCheck.revisionId });
  assert.equal(expiredReport.freshness.status, 'expired'); assert.equal(expiredReport.readiness.canPrepare, false);
  const binding = { inputSnapshotId: snapshot.inputSnapshotId, requestRevisionId: original.requestRevisionId,
    accountAlias: original.accountAlias, projectAlias: original.projectAlias, accessSpecificationRevisionId: original.accessSpecificationRevisionId };
  const wrongAccount = await attempt('folio_resource_query', { op: 'validateConnection', ...binding, accountAlias: 'account-other' });
  assert.equal(wrongAccount.code, 'CONNECTION_REQUEST_MISMATCH');
  const sentinel = 'SYNTHETIC-CREDENTIAL-MUST-NOT-BE-STORED';
  const unsafe = await attempt('folio_resources', { op: 'propose', resourceId: 'connection-guard-check', kind: 'connection-check',
    owned: { bytes: JSON.stringify({ ...original, authorization: sentinel }), mediaType: 'application/json' } });
  assert.equal(unsafe.code, 'CONNECTION_READINESS_INVALID'); assert.ok(!JSON.stringify(unsafe).includes(sentinel));
  const forged = structuredClone(report); forged.readiness.canPrepare = false;
  const forgedError = await attempt('folio_resources', { op: 'propose', resourceId: 'connection-guard-report', kind: 'connection-readiness',
    owned: { bytes: JSON.stringify(forged), mediaType: 'application/json' } });
  assert.equal(forgedError.code, 'CONNECTION_READINESS_INVALID');
  return { independentConnectionFailures: true, expiredConnection: true, connectionAccountBinding: true, connectionSecretsRejected: true, forgedConnectionReport: true };
}
