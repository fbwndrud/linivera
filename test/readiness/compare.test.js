import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCapabilityReadiness, retainCapabilityReadiness } from '../../core/readiness/compare.js';
import { verifyCapabilityReadiness, assertReadinessCurrent } from '../../core/readiness/verify.js';
import { collectInputClosure } from '../../core/resources/input-closure.js';
import { readResourceRelations } from '../../core/resources/context-references.js';
import { assertContextIsolation } from '../../core/context/isolation.js';
import { readinessFixture } from './fixture.js';
import { getCapabilitySpec } from '../../packs/production/capabilities.js';

test('comparison binds exact retained bytes and separates candidates, role declaration, rights and authority', async (t) => {
  const f = await readinessFixture(t); const report = await compareCapabilityReadiness(f.root, f.input);
  assert.equal(report.readiness.canPrepare, true);
  assert.equal(report.requirements.find((row) => row.role === 'source').status, 'candidates');
  assert.equal(report.candidates[0].contentHash, f.source.contentHash);
  assert.equal(report.candidates[0].rights.status, 'unknown');
  assert.equal(report.candidates[0].semanticFit.status, 'unknown');
  assert.equal(report.decision.inputSelection, 'not-performed');
  assert.equal(report.decision.internalExecutionAuthority, 'not-granted');
  const revision = await retainCapabilityReadiness(f.root, { resourceId: 'readiness', ...f.input });
  const closure = await collectInputClosure(f.root, [revision.revisionId]);
  assert.deepEqual(new Set(closure.map((row) => row.revisionId)), new Set([revision.revisionId, f.specification.revisionId, f.request.revisionId, f.source.revisionId, f.instruction.revisionId]));
});
test('partial search cannot claim absence; complete means only the checked selected revision scope', async (t) => {
  const f = await readinessFixture(t);
  const partial = await compareCapabilityReadiness(f.root, { ...f.input, candidateRevisionIds: [] });
  assert.equal(partial.requirements.find((row) => row.role === 'source').status, 'unknown-partial-search');
  assert.equal(partial.readiness.canPrepare, false);
  await assert.rejects(compareCapabilityReadiness(f.root, { ...f.input, search: { completeness: 'complete', reason: 'Incomplete claim' } }), { code: 'CAPABILITY_READINESS_INVALID' });
  const complete = await compareCapabilityReadiness(f.root, { ...f.input, candidateRevisionIds: [f.source, f.instruction, f.specification, f.request].map((row) => row.revisionId), search: { completeness: 'complete', reason: 'All selected in scope.' } });
  assert.equal(complete.search.omittedSelected.length, 0);
  assert.equal(complete.search.unselectedAndExternalHoldings, 'not-searched');
});
test('text binding mismatch is observed and incomplete report cannot become executable input', async (t) => {
  const f = await readinessFixture(t);
  const bad = await f.put('request', 'generation-request', { ...f.requestValue, parameters: { instruction: 'different text' } });
  const report = await compareCapabilityReadiness(f.root, { ...f.input, requestRevisionId: bad.revisionId });
  assert.equal(report.requirements.find((row) => row.role === 'instruction').status, 'mismatch');
  const revision = await retainCapabilityReadiness(f.root, { resourceId: 'readiness', ...f.input, requestRevisionId: bad.revisionId });
  await assert.rejects(collectInputClosure(f.root, [revision.revisionId]), { code: 'CAPABILITY_INPUTS_INCOMPLETE' });
});
test('specification and report forgery fail closed; comparison evidence does not silently become provided input', async (t) => {
  const f = await readinessFixture(t);
  const spec = getCapabilitySpec('local-broker-v1'); spec.inputs[1].constraints.maxBytes = 99999999999;
  await assert.rejects(f.put('other', 'capability-specification', spec), { code: 'CAPABILITY_SPEC_INVALID' });
  const other = await f.put('other', 'document', 'unused candidate', { mediaType: 'text/plain' });
  const report = await compareCapabilityReadiness(f.root, { ...f.input, candidateRevisionIds: [...f.input.candidateRevisionIds, other.revisionId] });
  const forged = structuredClone(report); forged.requirements[0].status = 'missing';
  await assert.rejects(f.put('readiness', 'capability-readiness', forged), { code: 'CAPABILITY_READINESS_INVALID' });
  const revision = await f.put('readiness', 'capability-readiness', report);
  assert.ok(!(await collectInputClosure(f.root, [revision.revisionId])).some((row) => row.revisionId === other.revisionId));
  assert.ok((await readResourceRelations(f.root, revision)).some((row) => row.targetRevisionId === other.revisionId && row.kind === 'context-evidence'));
});
test('historical report remains verifiable while changed selected inputs require a fresh comparison', async (t) => {
  const f = await readinessFixture(t); const report = await compareCapabilityReadiness(f.root, f.input);
  const revision = await f.put('readiness', 'capability-readiness', report);
  await f.put('other', 'document', 'unrelated selection', { select: true, mediaType: 'text/plain' });
  await assertReadinessCurrent(f.root, revision.revisionId);
  await f.put('source', 'file', 'new selected bytes', { select: true, mediaType: 'text/plain', parents: [f.source.revisionId] });
  await verifyCapabilityReadiness(f.root, report);
  await assert.rejects(assertReadinessCurrent(f.root, revision.revisionId), { code: 'CAPABILITY_READINESS_STALE' });
});
test('nested scoped evidence and declarations cannot bypass story/path isolation', async (t) => {
  const f = await readinessFixture(t);
  const context = await f.put('context', 'usage-context', { version: 1, scopeId: 'another-story', pathId: 'elsewhere', states: [] });
  await assert.rejects(compareCapabilityReadiness(f.root, { ...f.input, candidateRevisionIds: [context.revisionId] }), { code: 'CONTEXT_SCOPE_MISMATCH' });
  const report = await retainCapabilityReadiness(f.root, { resourceId: 'readiness', ...f.input });
  await assert.rejects(assertContextIsolation(f.root, [report.revisionId], { scopeId: 'another-story', pathId: 'main' }), { code: 'CONTEXT_SCOPE_MISMATCH' });
});
test('transformed text and source use consumed revision bytes while retaining both original and transform', async (t) => {
  const f = await readinessFixture(t);
  const transformed = await f.put('other', 'document', 'New exact instruction', { mediaType: 'text/plain' });
  const changedRequest = { ...f.requestValue, parameters: { instruction: 'New exact instruction' }, inputBindings: f.requestValue.inputBindings.map((row) => row.role === 'instruction' ? { ...row, transformRevisionId: transformed.revisionId } : row) };
  const request = await f.put('request', 'generation-request', changedRequest);
  const report = await compareCapabilityReadiness(f.root, { ...f.input, requestRevisionId: request.revisionId });
  assert.equal(report.requirements.find((row) => row.role === 'instruction').status, 'provided');
  assert.equal(report.requirements.find((row) => row.role === 'instruction').binding.revisionId, transformed.revisionId);
  assert.ok(report.boundRevisionIds.includes(f.instruction.revisionId));
  assert.ok(report.boundRevisionIds.includes(transformed.revisionId));
});
test('sealed historical input survives selection updates and another request cannot reuse its readiness', async (t) => {
  const f = await readinessFixture(t);
  const { prepareInput, verifyInput } = await import('../../core/resources/input-snapshots.js');
  const { assertReadinessForRequest } = await import('../../core/readiness/verify.js');
  const report = await compareCapabilityReadiness(f.root, f.input);
  const revision = await f.put('readiness', 'capability-readiness', report, { select: true });
  const input = await prepareInput(f.root, { revisionIds: [revision.revisionId], profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
  await assertReadinessForRequest(f.root, input.manifest, f.request.revisionId);
  const otherRequest = await f.put('request', 'generation-request', { ...f.requestValue, parameters: { instruction: 'Another request' } });
  await assert.rejects(assertReadinessForRequest(f.root, input.manifest, otherRequest.revisionId), { code: 'CAPABILITY_READINESS_REQUEST_MISMATCH' });
  await f.put('source', 'file', 'changed source', { select: true, mediaType: 'text/plain', parents: [f.source.revisionId] });
  const verified = await verifyInput(f.root, input.inputSnapshotId);
  assert.equal(verified.inputSnapshotId, input.inputSnapshotId);
  assert.equal(verified.manifest.resources.find((row) => row.resourceId === 'source').contentHash, f.source.contentHash);
});
test('observed byte budget blocks preparation and declared MIME never proves unobserved external bytes', async (t) => {
  const f = await readinessFixture(t, { maxInputBytes: 1 });
  const report = await compareCapabilityReadiness(f.root, f.input);
  assert.equal(report.budget.withinObservedBudget, false); assert.equal(report.readiness.canPrepare, false);
  const external = await f.store.propose({ resourceId: 'other', kind: 'file', external: { uri: 'https://example.invalid/synthetic.png' } });
  const unknown = await compareCapabilityReadiness(f.root, { ...f.input, candidateRevisionIds: [external.revisionId] });
  assert.equal(unknown.candidates[0].observed.bytes, 'unobserved');
  assert.equal(unknown.requirements.find((row) => row.role === 'source').status, 'unknown');
});
test('complete empty selected scope reports bounded absence rather than global nonexistence', async (t) => {
  const f = await readinessFixture(t);
  for (const row of [f.source, f.instruction, f.specification, f.request]) {
    const marker = await f.store.readSourceSelection(row.resourceId);
    await f.store.decideSource({ revisionId: row.revisionId, expectedSelectionRevision: marker.selectionRevision, action: { actor: 'user', type: 'deselect', reason: 'Synthetic checked scope is empty.' } });
  }
  const report = await compareCapabilityReadiness(f.root, { ...f.input, candidateRevisionIds: [], search: { completeness: 'complete', reason: 'No selected resources in checked scope.' } });
  assert.equal(report.requirements.find((row) => row.role === 'source').status, 'absent-in-searched-selection');
  assert.equal(report.search.unselectedAndExternalHoldings, 'not-searched');
});

test('optional means omittable; a supplied optional context of the wrong kind blocks preparation', async (t) => {
  const f = await readinessFixture(t);
  const request = await f.put('request', 'generation-request', { ...f.requestValue, inputBindings: [...f.requestValue.inputBindings,
    { fieldPath: 'context', role: 'context', revisionId: f.source.revisionId }] });
  const report = await compareCapabilityReadiness(f.root, { ...f.input, requestRevisionId: request.revisionId });
  assert.equal(report.requestValidation.status, 'valid');
  assert.equal(report.requirements.find((row) => row.role === 'context').selectedCandidateRevisionIds.length, 0);
  assert.equal(report.readiness.canPrepare, false);
  const retained = await f.put('readiness', 'capability-readiness', report);
  await assert.rejects(collectInputClosure(f.root, [retained.revisionId]), { code: 'CAPABILITY_INPUTS_INCOMPLETE' });
});

test('request iteration cannot carry another story through readiness into the next input', async (t) => {
  const f = await readinessFixture(t);
  const foreign = await f.put('context', 'usage-context', { version: 1, scopeId: 'other-story', pathId: 'other-path', states: [] }, { select: true });
  const request = await f.put('request', 'generation-request', { ...f.requestValue, iteration: { baseRevisionIds: [foreign.revisionId], preserveRefs: [] } });
  await assert.rejects(compareCapabilityReadiness(f.root, { ...f.input, requestRevisionId: request.revisionId }), { code: 'CONTEXT_SCOPE_MISMATCH' });
  await assert.rejects(retainCapabilityReadiness(f.root, { resourceId: 'readiness', ...f.input, requestRevisionId: request.revisionId }), { code: 'CONTEXT_SCOPE_MISMATCH' });
});
test('finding a structurally eligible candidate does not select or approve it for an unbound request', async (t) => {
  const f = await readinessFixture(t);
  const request = await f.put('request', 'generation-request', { ...f.requestValue, inputBindings: f.requestValue.inputBindings.filter((row) => row.role !== 'source') });
  const report = await compareCapabilityReadiness(f.root, { ...f.input, requestRevisionId: request.revisionId });
  const requirement = report.requirements.find((row) => row.role === 'source');
  assert.equal(requirement.status, 'candidates');
  assert.ok(requirement.candidates.some((row) => row.revisionId === f.source.revisionId && row.selection === 'unselected-candidate'));
  assert.equal(requirement.selectedCandidateRevisionIds.length, 0);
  assert.equal(report.readiness.canPrepare, false);
});
