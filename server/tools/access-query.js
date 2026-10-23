import { ID, rule } from './resource-schema.js';
import { listAccessSpecs, getAccessSpec } from '../../packs/production/access-specifications.js';
import { compareConnectionReadiness, retainConnectionReadiness, retainConnectionCheck } from '../../core/access/compare.js';
import { assertConnectionForRequest } from '../../core/access/verify.js';
import { verifyInput } from '../../core/resources/input-snapshots.js';
import { CHECK_KINDS, CHECK_STATES, CHECK_BASES, CHECK_REASONS } from '../../core/access/records.js';

const fields = ['accessSpecificationRevisionId', 'capabilitySpecificationRevisionId', 'requestRevisionId', 'checkRevisionId',
  'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId', 'scopeId', 'accountAlias', 'projectAlias'];
export const ACCESS_QUERY_ARGUMENTS = {
  accessSpecifications: rule([]), accessSpecification: rule(['accessId']),
  retainConnectionCheck: rule(['resourceId', 'check']),
  connectionReadiness: rule(fields, ['pathId']), retainConnectionReadiness: rule(['resourceId', ...fields], ['pathId']),
  validateConnection: rule(['inputSnapshotId', 'requestRevisionId', 'accountAlias', 'projectAlias', 'accessSpecificationRevisionId']),
};
const status = { type: 'string', enum: CHECK_STATES, description: 'Independent connection check state; unknown, partial and expired do not establish readiness.' };
export const ACCESS_QUERY_FIELDS = {
  accessId: ID, accessSpecificationRevisionId: ID, capabilitySpecificationRevisionId: ID, checkRevisionId: ID,
  accountAlias: ID, projectAlias: ID, inputSnapshotId: ID,
  check: { type: 'object', additionalProperties: false,
    required: ['version', 'accessSpecificationRevisionId', 'capabilitySpecificationRevisionId', 'requestRevisionId', 'scopeId', 'accountAlias', 'projectAlias',
      'checkedAt', 'expiresAt', 'observation', 'authenticationBoundary', 'checks'],
    properties: { version: { type: 'integer', enum: [1] }, accessSpecificationRevisionId: ID, capabilitySpecificationRevisionId: ID, requestRevisionId: ID,
      scopeId: ID, pathId: ID, accountAlias: ID, projectAlias: ID, checkedAt: ID, expiresAt: ID,
      observation: { type: 'string', enum: ['host-reported'] }, authenticationBoundary: { type: 'string', enum: ['host-secret-store'] },
      checks: { type: 'array', description: 'Exactly one observation for installation, exposure, authentication, permission, plan and credits.', minItems: 6, maxItems: 6, items: { type: 'object', additionalProperties: false,
        required: ['kind', 'status', 'basis', 'reasonCode'], properties: { kind: { type: 'string', enum: CHECK_KINDS, description: 'Independent connection condition being checked.' }, status,
          basis: { type: 'string', enum: CHECK_BASES }, reasonCode: { type: 'string', enum: CHECK_REASONS } } } },
    } },
};
export async function accessQueryTool(root, op, values) {
  if (op === 'accessSpecifications') return { specifications: listAccessSpecs() };
  if (op === 'accessSpecification') return getAccessSpec(values.accessId);
  if (op === 'retainConnectionCheck') return retainConnectionCheck(root, values);
  if (op === 'connectionReadiness') return compareConnectionReadiness(root, values);
  if (op === 'retainConnectionReadiness') return retainConnectionReadiness(root, values);
  const { manifest } = await verifyInput(root, values.inputSnapshotId);
  return assertConnectionForRequest(root, manifest, values.requestRevisionId, { requireReport: true,
    accountAlias: values.accountAlias, projectAlias: values.projectAlias, accessSpecificationRevisionId: values.accessSpecificationRevisionId });
}
