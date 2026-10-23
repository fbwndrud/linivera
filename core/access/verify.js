import { canonicalJson } from '../util/hash.js';
import { FolioError } from '../errors.js';
import { readWorkspaceState } from '../publications/state.js';
import { createResourceStore } from '../resources/revisions.js';
import { readTypedJson } from '../readiness/records.js';
import { assertReportedScopeCurrent, hasCurrentScopedConsumption } from '../readiness/selection.js';
import { validateAccessSpec } from '../../packs/production/access-specifications.js';
import { buildConnectionReadiness } from './compare.js';
import { partitionCurrentConnectionReports } from './current-reports.js';
import { assertReadinessRequestContract } from '../readiness/request-contract.js';
import { ACCESS_KINDS, checkReferences, connectionReferences, connectionEvidenceReferences, invalidAccess, readAccessJson, timestamp, validateCheckReferences } from './records.js';

/** Historical reports always recompute using their observation-time checkpoint and clock. */
export async function verifyConnectionReadiness(root, value) {
  if (!value || value.version !== 1 || !value.workspaceCheckpoint) invalidAccess('versioned connection report and exact checkpoint required');
  const state = await readWorkspaceState(root, { checkpoint: value.workspaceCheckpoint });
  const expected = await buildConnectionReadiness(root, value.input, state, value.evaluatedAt);
  if (canonicalJson(expected) !== canonicalJson(value)) invalidAccess('connection report differs from exact retained checks, specification or scope');
  return connectionReferences(value);
}
export async function verifyAccessResource(root, input) {
  if (!ACCESS_KINDS.has(input.kind)) return;
  if (input.owned?.mediaType !== 'application/json') invalidAccess('access records require owned JSON');
  const value = JSON.parse(Buffer.from(input.owned.bytes).toString('utf8'));
  if (input.kind === 'access-specification') validateAccessSpec(value);
  else if (input.kind === 'connection-check') {
    await validateCheckReferences(root, value);
    if (timestamp(value.checkedAt) > Date.now()) invalidAccess('host observation cannot be dated in the future');
  } else {
    if (timestamp(value.evaluatedAt) > Date.now()) invalidAccess('connection report cannot be evaluated in the future');
    await verifyConnectionReadiness(root, value);
  }
}
export async function readAccessReferences(root, revision) {
  if (!ACCESS_KINDS.has(revision.kind)) return [];
  const { value } = await readAccessJson(root, revision.revisionId, revision.kind);
  if (revision.kind === 'access-specification') return [];
  if (revision.kind === 'connection-check') { await validateCheckReferences(root, value); return checkReferences(value); }
  return verifyConnectionReadiness(root, value);
}
export async function readAccessRelations(root, revision) {
  const refs = await readAccessReferences(root, revision);
  const relations = refs.map((targetRevisionId) => ({ targetRevisionId, kind: 'context-input' }));
  if (revision.kind === 'connection-readiness') {
    const { value } = await readAccessJson(root, revision.revisionId, revision.kind);
    relations.push(...connectionEvidenceReferences(value).map((targetRevisionId) => ({ targetRevisionId, kind: 'context-evidence' })));
  }
  return relations;
}
export async function assertConnectionRequirements(root, revisionId) {
  const { value } = await readAccessJson(root, revisionId, 'connection-readiness');
  await verifyConnectionReadiness(root, value);
  if (!value.readiness.canPrepare) throw new FolioError('CONNECTION_NOT_READY', 'Resolve required connection, account, plan and credit checks before fixing input.');
}
export async function assertConnectionCurrent(root, revisionId, manifest = undefined) {
  const { value } = await readAccessJson(root, revisionId, 'connection-readiness');
  await assertConnectionRequirements(root, revisionId);
  await assertReadinessRequestContract(root, value);
  const now = Date.now();
  if (now < timestamp(value.freshness.checkedAt) || now >= timestamp(value.freshness.expiresAt)) throw new FolioError('CONNECTION_CHECK_EXPIRED', 'Repeat non-billing host checks immediately before this execution.');
  const store = createResourceStore(root); const state = await readWorkspaceState(root);
  const prior = await readWorkspaceState(root, { checkpoint: value.workspaceCheckpoint });
  const definitionIds = new Set(connectionEvidenceReferences(value));
  for (const id of [revisionId, ...connectionReferences(value), ...connectionEvidenceReferences(value)]) {
    assertReportedScopeCurrent(value, id, state);
    const revision = await store.readRevision(id);
    const volatile = ['connection-check', 'connection-readiness'].includes(revision.kind) || definitionIds.has(id);
    if (!volatile && await hasCurrentScopedConsumption(root, value.input, id, manifest, state)) continue;
    const current = state.sourceSelections[revision.resourceId];
    const old = prior.sourceSelections[revision.resourceId];
    if ((old?.revisionId === id && current?.revisionId !== id) || current?.revisionId && current.revisionId !== id) throw new FolioError('CONNECTION_READINESS_STALE', 'Selected connection evidence changed; compare the current exact revisions.');
  }
}
const identityFields = ['provider', 'product', 'capability', 'schemaVersion'];
/** Only reports for this capability bind fresh execution; other capabilities remain historical context. */
export async function assertConnectionForRequest(root, manifest, requestRevisionId, { requireReport = false, accountAlias = undefined, projectAlias = undefined, accessSpecificationRevisionId = undefined } = {}) {
  const store = createResourceStore(root); const reports = [];
  const request = await readTypedJson(root, requestRevisionId, 'generation-request');
  for (const row of manifest.resources) {
    const revision = await store.readRevision(row.revisionId);
    if (revision.kind !== 'connection-readiness') continue;
    const { value } = await readAccessJson(root, revision.revisionId, revision.kind);
    await verifyConnectionReadiness(root, value);
    const related = await readTypedJson(root, value.input.requestRevisionId, 'generation-request');
    if (identityFields.every((key) => related.value[key] === request.value[key])) reports.push({ revision, value });
  }
  if (!reports.length) {
    if (requireReport) throw new FolioError('CONNECTION_READINESS_REQUIRED', 'A matching retained connection report is required before calling this route.');
    return { ready: false, connectionReadinessRevisionIds: [], meaning: 'Legacy input has no connection attestation.' };
  }
  const matching = reports.filter(({ value }) => value.input.requestRevisionId === requestRevisionId
    && (accountAlias === undefined || value.input.accountAlias === accountAlias)
    && (projectAlias === undefined || value.input.projectAlias === projectAlias)
    && (accessSpecificationRevisionId === undefined || value.input.accessSpecificationRevisionId === accessSpecificationRevisionId));
  if (!matching.length) throw new FolioError('CONNECTION_REQUEST_MISMATCH', 'Connection readiness must name the exact request being started.');
  const { current, historical } = partitionCurrentConnectionReports(matching);
  for (const { revision } of current) await assertConnectionCurrent(root, revision.revisionId, manifest);
  const binding = current[0].value.input;
  return { ready: true, connectionReadinessRevisionIds: current.map(({ revision }) => revision.revisionId),
    ignoredHistoricalReportRevisionIds: historical.map(({ revision }) => revision.revisionId),
    accountAlias: binding.accountAlias, projectAlias: binding.projectAlias, accessSpecificationRevisionId: binding.accessSpecificationRevisionId, requestRevisionId };
}
