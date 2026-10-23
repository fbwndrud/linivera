import { readinessFixture } from '../readiness/fixture.js';
import { getAccessSpec } from '../../packs/production/access-specifications.js';
import { CHECK_KINDS } from '../../core/access/records.js';
export async function accessFixture(t) {
  const f = await readinessFixture(t);
  const access = await f.put('other', 'access-specification', getAccessSpec('local-broker-access-v1'), { select: true });
  const now = Date.now();
  const checkValue = { version: 1, accessSpecificationRevisionId: access.revisionId, capabilitySpecificationRevisionId: f.specification.revisionId,
    requestRevisionId: f.request.revisionId, scopeId: 'story', pathId: 'main', accountAlias: 'account-fixture', projectAlias: 'project-fixture',
    checkedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 240000).toISOString(), observation: 'host-reported', authenticationBoundary: 'host-secret-store',
    checks: CHECK_KINDS.map((kind) => ({ kind, status: 'passed', basis: 'synthetic-fixture', reasonCode: 'verified' })) };
  const check = await f.put('context', 'connection-check', checkValue, { select: true });
  const input = { accessSpecificationRevisionId: access.revisionId, capabilitySpecificationRevisionId: f.specification.revisionId,
    requestRevisionId: f.request.revisionId, checkRevisionId: check.revisionId, profileRevisionId: f.input.profileRevisionId,
    pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId, scopeId: 'story', pathId: 'main', accountAlias: 'account-fixture', projectAlias: 'project-fixture' };
  return { ...f, access, check, checkValue, input };
}
export async function onlineAccessFixture(t) {
  const f = await accessFixture(t);
  const { getCapabilitySpec } = await import('../../packs/production/capabilities.js');
  const spec = getCapabilitySpec('fal-flux-schnell-v1');
  const specification = await f.put('specification', 'capability-specification', spec, { select: true });
  const access = await f.put('other', 'access-specification', getAccessSpec('fal-flux-api-v1'), { select: true });
  const requestValue = { version: 1, ...spec.identity, parameters: { prompt: 'Count retained bytes' },
    inputBindings: [{ fieldPath: 'prompt', role: 'prompt', revisionId: f.instruction.revisionId }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'one', slots: [{ role: 'image', required: true, acceptableMediaTypes: ['image/jpeg'] }] }] } };
  const request = await f.put('request', 'generation-request', requestValue, { select: true });
  const checkValue = { ...f.checkValue, accessSpecificationRevisionId: access.revisionId, capabilitySpecificationRevisionId: specification.revisionId, requestRevisionId: request.revisionId };
  const check = await f.put('context', 'connection-check', checkValue, { select: true });
  return { ...f, access, specification, request, requestValue, checkValue, check, input: { ...f.input,
    accessSpecificationRevisionId: access.revisionId, capabilitySpecificationRevisionId: specification.revisionId, requestRevisionId: request.revisionId, checkRevisionId: check.revisionId } };
}
