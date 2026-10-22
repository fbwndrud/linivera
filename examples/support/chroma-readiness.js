import assert from 'node:assert/strict';

export const readinessScope = ['capability-spec', 'instruction', 'generation-request', 'readiness'];
export const readinessRequirements = [
  { role: 'input-specification', required: true, accepts: [{ kind: 'capability-specification' }] },
  { role: 'input-comparison', required: true, accepts: [{ kind: 'capability-readiness' }] },
  { role: 'request', required: true, accepts: [{ kind: 'generation-request' }] },
];

/** Discover candidates without changing selection; retain exact spec and comparison for the next bundle. */
export async function chromaReadiness(host, s) {
  const { call } = host; const R = (id) => s.resources.get(id);
  const catalog = await call('folio_resource_query', { op: 'capabilities' });
  assert.ok(catalog.specifications.some((spec) => spec.id === 'local-broker-v1'));
  const spec = await call('folio_resource_query', { op: 'specification', capabilityId: 'local-broker-v1' });
  await s.retainJson('capability-spec', spec, 'capability-specification');
  const instruction = 'Use the retained delivery feedback and source bytes to plan the next cut.';
  await s.retain('instruction', instruction, 'text/plain', 'text');
  const request = { version: 1, ...spec.identity, parameters: { instruction },
    inputBindings: [{ fieldPath: 'instruction', role: 'instruction', revisionId: R('instruction').revisionId },
      { fieldPath: 'source', role: 'source', revisionId: R('deliverable').revisionId }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'candidate-0', slots: [{ role: 'result', required: true, acceptableMediaTypes: ['application/json'] }] }] } };
  await s.retainJson('generation-request', request, 'generation-request');
  const input = { specificationRevisionId: R('capability-spec').revisionId, requestRevisionId: R('generation-request').revisionId,
    candidateRevisionIds: [R('instruction').revisionId, R('deliverable').revisionId], ...host.definitions,
    scopeId: 'episode-1', pathId: 'main', search: { completeness: 'partial', reason: 'Only the exact instruction and deliverable were inspected; the workspace has other selected resources.' } };
  const preview = await call('folio_resource_query', { op: 'readiness', ...input });
  const retained = await call('folio_resource_query', { op: 'retainReadiness', resourceId: 'readiness', ...input });
  await s.keep('readiness', retained);
  const report = await s.readJson('readiness');
  assert.deepEqual(report, preview);
  assert.equal(report.input.specificationRevisionId, R('capability-spec').revisionId);
  assert.equal(report.input.requestRevisionId, R('generation-request').revisionId);
  const bound = new Set(report.boundRevisionIds);
  for (const binding of request.inputBindings) assert.ok(bound.has(binding.revisionId));
  return { 'input-specification': R('capability-spec'), 'input-comparison': R('readiness'), request: R('generation-request') };
}
