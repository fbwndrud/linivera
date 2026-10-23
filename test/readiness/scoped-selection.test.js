import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCapabilityReadiness } from '../../core/readiness/compare.js';
import { assertReadinessCurrent, verifyCapabilityReadiness } from '../../core/readiness/verify.js';
import { selectInput, readInputSelection } from '../../core/resources/input-selections.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';
import { readinessFixture } from './fixture.js';

async function scopeSelect(f, bindings, scopeId = f.input.scopeId) {
  return selectInput(f.root, { scopeId, expectedScopeSelectionRevision: (await readInputSelection(f.root, scopeId))?.scopeSelectionRevision ?? null,
    actor: 'user', reason: 'Synthetic fixed revision selection.', bindings, profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
}
const fixed = (row, bindingKey = row.resourceId) => ({ bindingKey, role: bindingKey, resourceId: row.resourceId, revisionId: row.revisionId, mode: 'fixed' });
async function sealedReport(f) {
  const report = await compareCapabilityReadiness(f.root, f.input);
  const revision = await f.put('readiness', 'capability-readiness', report, { select: true });
  const current = await readInputSelection(f.root, f.input.scopeId);
  const selection = await scopeSelect(f, [...current.bindings, fixed(revision)]);
  const snapshot = await prepareInput(f.root, { version: 2, scopeId: f.input.scopeId, scopeSelectionRevision: selection.scopeSelectionRevision, bindingKeys: ['readiness'],
    profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
  return { report, revision, snapshot };
}
test('exact fixed scope consumption survives global drift but v1 and unproven calls retain global freshness', async (t) => {
  const f = await readinessFixture(t);
  await scopeSelect(f, [fixed(f.source), fixed(f.instruction), fixed(f.specification), fixed(f.request)]);
  const { report, revision, snapshot } = await sealedReport(f);
  await f.put('source', 'file', 'new global source', { select: true, mediaType: 'text/plain', parents: [f.source.revisionId] });
  await assertReadinessCurrent(f.root, revision.revisionId, snapshot.manifest);
  await assert.rejects(assertReadinessCurrent(f.root, revision.revisionId), { code: 'CAPABILITY_READINESS_STALE' });
  await assert.rejects(assertReadinessCurrent(f.root, revision.revisionId, { ...snapshot.manifest, version: 1 }), { code: 'CAPABILITY_READINESS_STALE' });
  await assert.rejects(assertReadinessCurrent(f.root, revision.revisionId, { ...snapshot.manifest, scopeId: 'other-story' }), { code: 'CAPABILITY_READINESS_STALE' });
  await verifyCapabilityReadiness(f.root, report);
  assert.equal((await verifyInput(f.root, snapshot.inputSnapshotId)).manifest.resources.find((row) => row.resourceId === 'source').contentHash, f.source.contentHash);
});
test('scope completeness preserves multiple exact fixed revisions and excludes overridden global revision', async (t) => {
  const f = await readinessFixture(t);
  const newer = await f.put('source', 'file', 'new global source', { select: true, mediaType: 'text/plain', parents: [f.source.revisionId] });
  await scopeSelect(f, [fixed(f.source, 'source-old'), fixed(newer, 'source-new')]);
  const complete = await compareCapabilityReadiness(f.root, { ...f.input, candidateRevisionIds: [f.source, newer, f.instruction, f.specification, f.request].map((row) => row.revisionId), search: { completeness: 'complete', reason: 'Scoped exact versions with global fallback.' } });
  assert.deepEqual(complete.search.selected.filter((row) => row.resourceId === 'source').map((row) => row.revisionId), [f.source.revisionId, newer.revisionId]);
  assert.ok(complete.search.selected.filter((row) => row.resourceId === 'source').every((row) => row.basis === 'scoped'));
  assert.equal(complete.search.selected.find((row) => row.resourceId === 'instruction').basis, 'global');
  await assert.rejects(compareCapabilityReadiness(f.root, { ...f.input, candidateRevisionIds: [newer, f.instruction, f.specification, f.request].map((row) => row.revisionId), search: { completeness: 'complete', reason: 'Missing old fixed version.' } }), { code: 'CAPABILITY_READINESS_INVALID' });
});
test('related fixed binding deletion or change requires fresh report, unrelated binding additions do not', async (t) => {
  const f = await readinessFixture(t);
  await scopeSelect(f, [fixed(f.source), fixed(f.instruction), fixed(f.specification), fixed(f.request)]);
  const { revision, snapshot } = await sealedReport(f);
  const other = await f.put('other', 'file', 'unrelated scoped bytes', { mediaType: 'text/plain' });
  let current = await readInputSelection(f.root, f.input.scopeId);
  await scopeSelect(f, [...current.bindings, fixed(other)]);
  await assertReadinessCurrent(f.root, revision.revisionId, snapshot.manifest);
  current = await readInputSelection(f.root, f.input.scopeId);
  await scopeSelect(f, current.bindings.filter((row) => row.bindingKey !== 'source'));
  await assert.rejects(assertReadinessCurrent(f.root, revision.revisionId, snapshot.manifest), { code: 'CAPABILITY_READINESS_STALE' });
});
test('scoped dependency chains retain their exact meaning and global-mode dependencies cannot bypass drift', async (t) => {
  const f = await readinessFixture(t);
  await scopeSelect(f, [fixed(f.source)], 'upstream');
  await scopeSelect(f, [{ ...fixed(f.source), mode: 'scoped', sourceScopeId: 'upstream', sourceBindingKey: 'source' }, fixed(f.instruction), fixed(f.specification), fixed(f.request)]);
  const { revision, snapshot } = await sealedReport(f);
  await f.put('source', 'file', 'new global source', { select: true, mediaType: 'text/plain', parents: [f.source.revisionId] });
  await assertReadinessCurrent(f.root, revision.revisionId, snapshot.manifest);
  await scopeSelect(f, [{ ...fixed(f.source), role: 'changed-role' }], 'upstream');
  await assert.rejects(assertReadinessCurrent(f.root, revision.revisionId, snapshot.manifest), { code: 'CAPABILITY_READINESS_STALE' });
});
test('definitions remain globally selected even if arbitrary fixed scope bindings exist', async (t) => {
  const f = await readinessFixture(t);
  await scopeSelect(f, [fixed(f.source), fixed(f.instruction), fixed(f.specification), fixed(f.request)]);
  const { revision, snapshot } = await sealedReport(f);
  const prior = await f.store.readRevision(f.input.pipelineRevisionId);
  await f.put('pipeline', 'pipeline', { version: 1, steps: [{ id: 'analyze', capability: 'analyze' }] }, { select: true, parents: [prior.revisionId] });
  await assert.rejects(assertReadinessCurrent(f.root, revision.revisionId, snapshot.manifest), { code: 'CAPABILITY_READINESS_STALE' });
});
test('a global-mode scope binding does not turn changing global source selections into fixed consumption', async (t) => {
  const f = await readinessFixture(t);
  await scopeSelect(f, [{ ...fixed(f.source), mode: 'global' }, fixed(f.instruction), fixed(f.specification), fixed(f.request)]);
  const { revision, snapshot } = await sealedReport(f);
  await f.put('source', 'file', 'new global source', { select: true, mediaType: 'text/plain', parents: [f.source.revisionId] });
  await assert.rejects(assertReadinessCurrent(f.root, revision.revisionId, snapshot.manifest), { code: 'CAPABILITY_READINESS_STALE' });
});
test('a report compared before scope selection can use the later exact fixed manifest while preserving old report proof', async (t) => {
  const f = await readinessFixture(t);
  const report = await compareCapabilityReadiness(f.root, f.input);
  const revision = await f.put('readiness', 'capability-readiness', report, { select: true });
  const selection = await scopeSelect(f, [fixed(f.source), fixed(f.instruction), fixed(f.specification), fixed(f.request), fixed(revision)]);
  const snapshot = await prepareInput(f.root, { version: 2, scopeId: f.input.scopeId, scopeSelectionRevision: selection.scopeSelectionRevision, bindingKeys: ['readiness'],
    profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
  await f.put('source', 'file', 'new global source', { select: true, mediaType: 'text/plain', parents: [f.source.revisionId] });
  await assertReadinessCurrent(f.root, revision.revisionId, snapshot.manifest);
  await verifyCapabilityReadiness(f.root, report);
});
test('an added fixed binding cannot mask a simultaneously consumed global binding dependency', async (t) => {
  const f = await readinessFixture(t);
  const report = await compareCapabilityReadiness(f.root, f.input);
  const revision = await f.put('readiness', 'capability-readiness', report, { select: true });
  const selection = await scopeSelect(f, [{ ...fixed(f.source, 'source-global'), mode: 'global' }, fixed(f.source, 'source-fixed'), fixed(f.instruction), fixed(f.specification), fixed(f.request), fixed(revision)]);
  const snapshot = await prepareInput(f.root, { version: 2, scopeId: f.input.scopeId, scopeSelectionRevision: selection.scopeSelectionRevision, bindingKeys: ['readiness'],
    profileRevisionId: f.input.profileRevisionId, pipelineRevisionId: f.input.pipelineRevisionId, policyRevisionId: f.input.policyRevisionId });
  await f.put('source', 'file', 'new global source', { select: true, mediaType: 'text/plain', parents: [f.source.revisionId] });
  await assert.rejects(assertReadinessCurrent(f.root, revision.revisionId, snapshot.manifest), { code: 'CAPABILITY_READINESS_STALE' });
});
