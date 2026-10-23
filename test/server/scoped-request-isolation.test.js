import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessFixture } from '../readiness/fixture.js';
import { connectFolio } from '../support/mcp-client.js';
import { join } from 'node:path';
import { buildInputManifestV2 } from '../../core/resources/input-snapshots-v2.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { writeImmutable } from '../../core/resources/files.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';

async function scopedRequest(t, contextScope) {
  const f = await readinessFixture(t); const host = await connectFolio(); t.after(() => host.close());
  const call = async (name, args) => {
    const response = await host.call(name, { root: f.root, ...args });
    assert.equal(response.ok, true, JSON.stringify(response)); return response.result;
  };
  const context = await call('folio_resources', { op: 'propose', resourceId: 'context', kind: 'usage-context',
    owned: { bytes: JSON.stringify({ version: 1, scopeId: contextScope, pathId: 'main', states: [] }), mediaType: 'application/json' } });
  await call('folio_resources', { op: 'decideSource', revisionId: context.revisionId, expectedSelectionRevision: null,
    action: { actor: 'user', type: 'select' } });
  const request = await call('folio_resources', { op: 'propose', resourceId: 'request', kind: 'generation-request',
    owned: { bytes: JSON.stringify({ ...f.requestValue, iteration: { baseRevisionIds: [context.revisionId], preserveRefs: [] } }), mediaType: 'application/json' } });
  const definitions = Object.fromEntries(['profile', 'pipeline', 'policy'].map((kind) => [kind + 'RevisionId', f.input[kind + 'RevisionId']]));
  const selection = await call('folio_inputs', { op: 'select', scopeId: 'story', actor: 'user', expectedScopeSelectionRevision: null,
    reason: 'Synthetic exact request and iteration input.', ...definitions,
    bindings: [{ bindingKey: 'request', role: 'request', resourceId: request.resourceId, revisionId: request.revisionId, mode: 'fixed' }] });
  const input = { version: 2, scopeId: 'story', scopeSelectionRevision: selection.scopeSelectionRevision, bindingKeys: ['request'], ...definitions };
  return { ...f, host, call, input, context, request };
}

test('public scoped Input rejects a direct request iteration from another story without a readiness wrapper', async (t) => {
  const f = await scopedRequest(t, 'foreign-story');
  const response = await f.host.call('folio_inputs', { root: f.root, op: 'prepare', ...f.input });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'CONTEXT_SCOPE_MISMATCH');
});

test('public scoped Input accepts an exact same-story request iteration across MCP restart', async (t) => {
  const f = await scopedRequest(t, 'story');
  const sealed = await f.call('folio_inputs', { op: 'prepare', ...f.input });
  assert.deepEqual(sealed.manifest.revisionIds, [f.request.revisionId]);
  assert.ok(sealed.manifest.resources.some((row) => row.revisionId === f.context.revisionId));
  const operation = await f.call('folio_operations', { op: 'start', inputSnapshotId: sealed.inputSnapshotId,
    requestRevisionId: f.request.revisionId, operationContractVersion: 2, actor: 'user', idempotencyKey: 'same-story-iteration' });
  assert.ok(operation.operationId.startsWith('sha256:'));
  await f.host.close();
  const next = await connectFolio(); t.after(() => next.close());
  const verified = await next.call('folio_inputs', { root: f.root, op: 'verify', inputSnapshotId: sealed.inputSnapshotId });
  assert.equal(verified.ok, true);
  assert.equal(verified.result.inputSnapshotId, sealed.inputSnapshotId);
});

test('historical cross-story Input retains its hash but cannot start new work', async (t) => {
  const f = await scopedRequest(t, 'foreign-story');
  // Reconstruct a synthetic pre-guard snapshot at its original ledger prefix.
  const manifest = await buildInputManifestV2(f.root, f.input, await readWorkspaceState(f.root), { historical: true });
  const bytes = canonicalJson(manifest); const inputSnapshotId = sha256(bytes);
  await writeImmutable(f.root, join(f.root, '.folio', 'resources', 'inputs', inputSnapshotId.slice(7) + '.json'), bytes);
  await f.host.close();
  const next = await connectFolio(); t.after(() => next.close());
  const verified = await next.call('folio_inputs', { root: f.root, op: 'verify', inputSnapshotId });
  assert.equal(verified.ok, true);
  assert.equal(verified.result.inputSnapshotId, inputSnapshotId);
  assert.deepEqual(verified.result.manifest, manifest);
  const operation = await next.call('folio_operations', { root: f.root, op: 'start', inputSnapshotId,
    requestRevisionId: f.request.revisionId, operationContractVersion: 2, actor: 'user', idempotencyKey: 'historical-foreign-iteration' });
  assert.equal(operation.ok, false);
  assert.equal(operation.error.code, 'CONTEXT_SCOPE_MISMATCH');
});

test('the original review case refuses a story readiness report fixed in another story', async (t) => {
  const f = await readinessFixture(t); const host = await connectFolio(); t.after(() => host.close());
  const response = await host.call('folio_resource_query', { root: f.root, op: 'retainReadiness', resourceId: 'readiness', ...f.input });
  assert.equal(response.ok, true); const report = response.result;
  const definitions = Object.fromEntries(['profile', 'pipeline', 'policy'].map((kind) => [kind + 'RevisionId', f.input[kind + 'RevisionId']]));
  const selected = await host.call('folio_inputs', { root: f.root, op: 'select', scopeId: 'other-story', actor: 'user',
    expectedScopeSelectionRevision: null, reason: 'Synthetic original review counterexample.', ...definitions,
    bindings: [{ bindingKey: 'report', role: 'context', resourceId: report.resourceId, revisionId: report.revisionId, mode: 'fixed' }] });
  assert.equal(selected.ok, true);
  const input = { version: 2, scopeId: 'other-story', scopeSelectionRevision: selected.result.scopeSelectionRevision, ...definitions };
  const prepared = await host.call('folio_inputs', { root: f.root, op: 'prepare', ...input });
  assert.equal(prepared.ok, false); assert.equal(prepared.error.code, 'CONTEXT_SCOPE_MISMATCH');
  const manifest = await buildInputManifestV2(f.root, input, await readWorkspaceState(f.root), { historical: true });
  const bytes = canonicalJson(manifest); const inputSnapshotId = sha256(bytes);
  await writeImmutable(f.root, join(f.root, '.folio/resources/inputs', inputSnapshotId.slice(7) + '.json'), bytes);
  assert.equal((await host.call('folio_inputs', { root: f.root, op: 'verify', inputSnapshotId })).ok, true);
  const operation = await host.call('folio_operations', { root: f.root, op: 'start', inputSnapshotId,
    requestRevisionId: f.request.revisionId, operationContractVersion: 2, actor: 'user', idempotencyKey: 'foreign-report' });
  assert.equal(operation.ok, false); assert.equal(operation.error.code, 'CONTEXT_SCOPE_MISMATCH');
});
