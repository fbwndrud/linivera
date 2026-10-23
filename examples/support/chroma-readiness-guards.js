import assert from 'node:assert/strict';

/** Public MCP refusals keep discovered candidates, executable input and declarations separate. */
export async function chromaReadinessGuards(host, s, snapshot) {
  const { call, attempt } = host; const R = (id) => s.resources.get(id);
  const report = await s.readJson('readiness');
  assert.equal(report.decision.internalExecutionAuthority, 'not-granted');
  assert.ok(report.candidates.every((candidate) => candidate.semanticFit.status === 'unknown' && candidate.rights.status === 'unknown'));
  const partial = await call('folio_resource_query', { op: 'readiness', ...report.input, candidateRevisionIds: [] });
  assert.equal(partial.requirements.find((row) => row.role === 'source').status, 'unknown-partial-search');
  assert.equal(partial.readiness.canPrepare, false);
  await s.retainJson('readiness-incomplete', partial, 'capability-readiness');
  const incomplete = await attempt('folio_inputs', { op: 'prepare', ...host.definitions, revisionIds: [R('readiness-incomplete').revisionId] });
  assert.equal(incomplete.code, 'CAPABILITY_INPUTS_INCOMPLETE');
  const complete = await attempt('folio_resource_query', { op: 'readiness', ...report.input, search: { completeness: 'complete', reason: 'Synthetic false claim of complete search' } });
  assert.equal(complete.code, 'CAPABILITY_READINESS_INVALID');
  const spec = await s.readJson('capability-spec'); spec.inputs[1].constraints.maxBytes++;
  const forgedSpec = await attempt('folio_resources', { op: 'propose', resourceId: 'forged-spec', kind: 'capability-specification', owned: { bytes: JSON.stringify(spec), mediaType: 'application/json' } });
  assert.equal(forgedSpec.code, 'CAPABILITY_SPEC_INVALID');
  const forged = await attempt('folio_resources', { op: 'propose', resourceId: 'forged-readiness', kind: 'capability-readiness',
    owned: { bytes: JSON.stringify({ ...report, readiness: { canPrepare: false } }), mediaType: 'application/json' } });
  assert.equal(forged.code, 'CAPABILITY_READINESS_INVALID');
  const request = await s.readJson('generation-request'); request.parameters.instruction = 'Synthetic unverified instruction';
  const different = await call('folio_resources', { op: 'propose', resourceId: 'other-request', kind: 'generation-request', owned: { bytes: JSON.stringify(request), mediaType: 'application/json' } });
  const swapped = await attempt('folio_operations', { op: 'start', inputSnapshotId: snapshot.inputSnapshotId, actor: 'user', idempotencyKey: 'wrong-readiness-request',
    operationContractVersion: 2, requestRevisionId: different.revisionId });
  assert.equal(swapped.code, 'CAPABILITY_READINESS_REQUEST_MISMATCH');
  return { partialSearch: true, incompleteCapability: true, falseCompleteSearch: true, forgedSpecification: true, forgedReadiness: true, swappedRequest: true };
}
