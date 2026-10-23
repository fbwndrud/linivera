import { FolioError } from '../errors.js';
import { assertResourceId, assertRevisionId } from '../resources/schema.js';
import { readTypedJson } from '../readiness/records.js';
import { validateAccessSpec } from '../../packs/production/access-specifications.js';
import { validateCapabilityRequest, validateHistoricalCapabilityRequestV1 } from '../../packs/production/capabilities.js';
import { canonicalJson } from '../util/hash.js';

export const ACCESS_KINDS = new Set(['access-specification', 'connection-check', 'connection-readiness']);
export const CHECK_KINDS = ['installation', 'exposure', 'authentication', 'permission', 'plan', 'credits'];
export const CHECK_STATES = ['passed', 'blocked', 'unknown', 'partial', 'expired'];
export const CHECK_BASES = ['read-only-host-probe', 'host-tool-metadata', 'user-declaration', 'synthetic-fixture'];
export const CHECK_REASONS = ['verified', 'not-installed', 'not-exposed', 'not-authenticated', 'permission-denied', 'plan-required', 'credits-unconfirmed', 'credits-insufficient', 'expired', 'partial-check', 'not-checked', 'declared-only', 'not-applicable'];
export function invalidAccess(message) { throw new FolioError('CONNECTION_READINESS_INVALID', message); }
export function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) invalidAccess('unsupported connection fields; secret material and raw messages are prohibited');
}
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalidAccess('exact UTC timestamp required');
  return Date.parse(value);
}
const bindingKeys = ['accessSpecificationRevisionId', 'capabilitySpecificationRevisionId', 'requestRevisionId', 'scopeId', 'pathId', 'accountAlias', 'projectAlias'];
export function validateBinding(value) {
  for (const key of bindingKeys.filter((key) => key.endsWith('RevisionId'))) assertRevisionId(value[key]);
  assertResourceId(value.scopeId); if (value.pathId !== undefined) assertResourceId(value.pathId);
  for (const [key, prefix] of [['accountAlias', 'account'], ['projectAlias', 'project']]) if (typeof value[key] !== 'string' || !new RegExp('^' + prefix + '-[a-z0-9-]{1,48}$').test(value[key])) invalidAccess('non-secret local account/project aliases required');
}
export function validateConnectionCheck(value) {
  object(value, ['version', ...bindingKeys, 'checkedAt', 'expiresAt', 'observation', 'authenticationBoundary', 'checks']);
  validateBinding(value);
  if (value.version !== 1 || value.observation !== 'host-reported' || value.authenticationBoundary !== 'host-secret-store') invalidAccess('host-reported check and host-secret-store boundary required');
  if (timestamp(value.expiresAt) <= timestamp(value.checkedAt)) invalidAccess('check expiry must follow observation');
  if (!Array.isArray(value.checks) || value.checks.length !== CHECK_KINDS.length || new Set(value.checks.map((row) => row?.kind)).size !== CHECK_KINDS.length) invalidAccess('each independent check must appear exactly once');
  for (const row of value.checks) {
    object(row, ['kind', 'status', 'basis', 'reasonCode']);
    if (!CHECK_KINDS.includes(row.kind) || !CHECK_STATES.includes(row.status) || !CHECK_BASES.includes(row.basis) || !CHECK_REASONS.includes(row.reasonCode)) invalidAccess('allowlisted check state, basis and reason required');
    if (row.status === 'passed' && !['verified', 'not-applicable'].includes(row.reasonCode)) invalidAccess('passed state requires a verified or inapplicable reason');
  }
  return value;
}
export function validateConnectionInput(value) {
  object(value, [...bindingKeys, 'checkRevisionId', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId']); validateBinding(value);
  for (const key of ['checkRevisionId', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId']) assertRevisionId(value[key]);
  return value;
}
export async function readAccessJson(root, revisionId, kind) {
  const result = await readTypedJson(root, revisionId, kind);
  if (kind === 'access-specification') validateAccessSpec(result.value);
  if (kind === 'connection-check') validateConnectionCheck(result.value);
  return result;
}
/** Retained v1 check references replay their original contract; fresh observations request current validation. */
export async function validateCheckReferences(root, value, { currentContract = false } = {}) {
  validateConnectionCheck(value);
  const access = await readAccessJson(root, value.accessSpecificationRevisionId, 'access-specification');
  const capability = await readTypedJson(root, value.capabilitySpecificationRevisionId, 'capability-specification');
  const request = await readTypedJson(root, value.requestRevisionId, 'generation-request');
  if (access.value.capabilityId !== capability.value.id || canonicalJson(access.value.identity) !== canonicalJson(capability.value.identity)) invalidAccess('access and capability identities differ');
  (currentContract ? validateCapabilityRequest : validateHistoricalCapabilityRequestV1)(capability.value, request.value);
  return { access, capability, request };
}
export function checkReferences(value) { return [value.accessSpecificationRevisionId, value.capabilitySpecificationRevisionId, value.requestRevisionId]; }
export function connectionReferences(value) { return [...checkReferences(value.input), value.input.checkRevisionId]; }
export function connectionEvidenceReferences(value) { return ['profile', 'pipeline', 'policy'].map((kind) => value.input[kind + 'RevisionId']); }
