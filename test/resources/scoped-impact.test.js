import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { selectInput } from '../../core/resources/input-selections.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';
import { startOperation, submitResult } from '../../core/operations/requests.js';
import { recordReview, decidePublication } from '../../core/operations/publications.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { metadataEntries } from '../../core/projections/metadata.js';
async function publish(f, snapshot, result, key) {
  const op = await startOperation(f.root, { inputSnapshotId: snapshot.inputSnapshotId, actor: 'user', idempotencyKey: key });
  const candidate = await submitResult(f.root, { ...op, inputSnapshotId: snapshot.inputSnapshotId, resultRevisionIds: [result.revisionId] });
  const receipt = await recordReview(f.root, { operationId: op.operationId, outputHashes: candidate.outputs.map((output) => output.contentHash), findings: [], reviewer: 'host' });
  await decidePublication(f.root, { operationId: op.operationId, receiptId: receipt, action: 'approve', actor: 'user', expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint });
}
test('unrelated scoped choices do not drift a result while an exact binding change does', async (t) => {
  const f = await scopedFixture(t); let bindings = [f.binding('face', f.face1), f.binding('music', f.music)];
  let selected = await selectInput(f.root, { scopeId: 'episode-8', expectedScopeSelectionRevision: null, actor: 'user', reason: 'choose face', bindings, ...f.definitions });
  const snapshot = await prepareInput(f.root, { version: 2, scopeId: 'episode-8', scopeSelectionRevision: selected.scopeSelectionRevision, bindingKeys: ['face'], ...f.definitions });
  const result = await f.resource('result', 'synthetic shot'); await publish(f, snapshot, result, 'shot');
  const music2 = await f.resource('music', 'different synthetic music'); bindings = [bindings[0], f.binding('music', music2)];
  selected = await selectInput(f.root, { scopeId: 'episode-8', expectedScopeSelectionRevision: selected.scopeSelectionRevision, actor: 'user', reason: 'change music only', bindings, ...f.definitions });
  assert.equal((await metadataEntries(f.root, await readWorkspaceState(f.root))).find((entry) => entry.role === 'output').reviewRequired, false);
  await selectInput(f.root, { scopeId: 'episode-8', expectedScopeSelectionRevision: selected.scopeSelectionRevision, actor: 'user', reason: 'change face', bindings: [f.binding('face', f.face2), bindings[1]], ...f.definitions });
  const output = (await metadataEntries(f.root, await readWorkspaceState(f.root))).find((entry) => entry.role === 'output');
  assert.equal(output.reviewRequired, true); assert.equal(output.reviewReasons[0].reason, 'scoped-selection-changed');
});
test('fixed choice ignores its direct drift but preserves review propagated from its producer', async (t) => {
  const f = await scopedFixture(t);
  const upstream = await prepareInput(f.root, { revisionIds: [f.face2.revisionId], ...f.definitions });
  const derived = await f.resource('result', 'synthetic derived face'); await publish(f, upstream, derived, 'derive'); await f.select(derived);
  const selection = await selectInput(f.root, { scopeId: 'episode-8', expectedScopeSelectionRevision: null, actor: 'user', reason: 'keep original derived result', bindings: [f.binding('face', derived, 'fixed')], ...f.definitions });
  const snapshot = await prepareInput(f.root, { version: 2, scopeId: 'episode-8', scopeSelectionRevision: selection.scopeSelectionRevision, ...f.definitions });
  const shot = await f.resource('result', 'synthetic downstream shot'); await publish(f, snapshot, shot, 'fixed-shot');
  await f.select(shot);
  let entries = await metadataEntries(f.root, await readWorkspaceState(f.root));
  assert.equal(entries.find((entry) => entry.role === 'output' && entry.revisionId === shot.revisionId).reviewRequired, false);
  await f.select(f.face1);
  entries = await metadataEntries(f.root, await readWorkspaceState(f.root));
  const output = entries.find((entry) => entry.role === 'output' && entry.revisionId === shot.revisionId);
  assert.equal(output.reviewRequired, true); assert.ok(output.reviewReasons.some((reason) => reason.reason === 'upstream-review-required'));
});
test('a scoped follower notices its upstream binding change even when that upstream choice was fixed', async (t) => {
  const f = await scopedFixture(t); const base = { expectedScopeSelectionRevision: null, actor: 'user', reason: 'choose exact face', ...f.definitions };
  const parent = await selectInput(f.root, { ...base, scopeId: 'episode-1', bindings: [f.binding('face', f.face1, 'fixed')] });
  const child = await selectInput(f.root, { ...base, scopeId: 'episode-8', bindings: [{ ...f.binding('face', f.face1), sourceScopeId: 'episode-1', sourceBindingKey: 'face' }] });
  const snapshot = await prepareInput(f.root, { version: 2, scopeId: 'episode-8', scopeSelectionRevision: child.scopeSelectionRevision, ...f.definitions });
  await publish(f, snapshot, await f.resource('result', 'synthetic follower result'), 'follower');
  await selectInput(f.root, { ...base, scopeId: 'episode-1', expectedScopeSelectionRevision: parent.scopeSelectionRevision, bindings: [f.binding('face', f.face2, 'fixed')] });
  const output = (await metadataEntries(f.root, await readWorkspaceState(f.root))).find((entry) => entry.role === 'output');
  assert.equal(output.reviewRequired, true); assert.ok(output.reviewReasons.some((reason) => reason.scopeId === 'episode-1'));
});
