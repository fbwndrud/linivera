import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { accessFixture } from '../access/fixture.js';
import { copyCatalogInstallation, appendCatalogEditions } from '../support/catalog-upgrade.js';
import { buildCapabilityReadiness } from '../../core/readiness/compare.js';
import { buildConnectionReadiness } from '../../core/access/compare.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { collectInputClosure } from '../../core/resources/input-closure.js';
import { selectInput } from '../../core/resources/input-selections.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';
import { getCapabilitySpec } from '../../packs/production/capabilities.js';
import { getAccessSpec } from '../../packs/production/access-specifications.js';

test('appending capability/access editions preserves v1/v2 reports and exact Input across an MCP installation restart', async (t) => {
  const f = await accessFixture(t); const state = await readWorkspaceState(f.root);
  const comparison = { specificationRevisionId: f.specification.revisionId, requestRevisionId: f.request.revisionId,
    candidateRevisionIds: [f.source.revisionId, f.instruction.revisionId], scopeId: 'story', pathId: 'main',
    ...Object.fromEntries(['profile', 'pipeline', 'policy'].map((key) => [key + 'RevisionId', f.input[key + 'RevisionId']])),
    search: { completeness: 'partial', reason: 'Synthetic catalog upgrade history.' } };
  const reports = [];
  for (const reportVersion of [1, 2]) reports.push(await f.put('readiness', 'capability-readiness',
    await buildCapabilityReadiness(f.root, comparison, state, { reportVersion })));
  reports.push(await f.put('readiness', 'connection-readiness',
    await buildConnectionReadiness(f.root, f.input, await readWorkspaceState(f.root), new Date().toISOString())));
  const closure = await collectInputClosure(f.root, reports.map((row) => row.revisionId));
  const definitions = Object.fromEntries(['profile', 'pipeline', 'policy'].map((key) => [key + 'RevisionId', f.input[key + 'RevisionId']]));
  const selection = await selectInput(f.root, { scopeId: 'story', actor: 'user', expectedScopeSelectionRevision: null,
    reason: 'Keep every exact historical report edition.', ...definitions,
    bindings: closure.map((row, index) => ({ bindingKey: 'exact-' + index, role: 'context', resourceId: row.resourceId, revisionId: row.revisionId, mode: 'fixed' })) });
  const sealed = await prepareInput(f.root, { version: 2, scopeId: 'story', scopeSelectionRevision: selection.scopeSelectionRevision, ...definitions });
  const installed = await copyCatalogInstallation(t);
  const { productionHost } = await import(pathToFileURL(join(installed, 'examples/support/production-host.js')).href);
  const before = await productionHost(f.root);
  try { assert.deepEqual((await before.call('folio_inputs', { op: 'verify', inputSnapshotId: sealed.inputSnapshotId })).manifest, sealed.manifest); }
  finally { await before.close(); }
  const oldCapability = getCapabilitySpec('local-broker-v1'); const oldAccess = getAccessSpec('local-broker-access-v1');
  const nextCapability = structuredClone(oldCapability); nextCapability.id = 'local-broker-v2';
  nextCapability.evidence.checkedAt = '2026-10-24'; nextCapability.inputs[1].constraints.maxBytes = 1;
  const nextAccess = structuredClone(oldAccess); nextAccess.id = 'local-broker-access-v2';
  nextAccess.capabilityId = nextCapability.id; nextAccess.evidence.checkedAt = '2026-10-24';
  await appendCatalogEditions(installed, nextCapability, nextAccess);
  const after = await productionHost(f.root); t.after(() => after.close());
  for (const [id, expected] of [[oldCapability.id, oldCapability], [nextCapability.id, nextCapability]]) {
    assert.deepEqual(await after.call('folio_resource_query', { op: 'specification', capabilityId: id }), expected);
  }
  for (const [id, expected] of [[oldAccess.id, oldAccess], [nextAccess.id, nextAccess]]) {
    assert.deepEqual(await after.call('folio_resource_query', { op: 'accessSpecification', accessId: id }), expected);
  }
  const verified = await after.call('folio_inputs', { op: 'verify', inputSnapshotId: sealed.inputSnapshotId });
  assert.equal(verified.inputSnapshotId, sealed.inputSnapshotId); assert.deepEqual(verified.manifest, sealed.manifest);
  for (const revision of reports) {
    const retained = await after.call('folio_resources', { op: 'read', revisionId: revision.revisionId });
    assert.equal(retained.revision.contentHash, revision.contentHash);
  }
  assert.ok((await after.call('folio_operations', { op: 'start', inputSnapshotId: sealed.inputSnapshotId,
    requestRevisionId: f.request.revisionId, operationContractVersion: 2, actor: 'user', idempotencyKey: 'catalog-upgrade' })).operationId);
  const nextSpecification = await after.json('specification', nextCapability, 'capability-specification');
  const compared = await after.call('folio_resource_query', { op: 'readiness', ...comparison, specificationRevisionId: nextSpecification.revisionId });
  assert.equal(compared.readiness.canPrepare, false, 'the tighter new edition does not overwrite the valid old edition');
  const forged = { ...oldCapability, evidence: nextCapability.evidence };
  assert.equal((await after.attempt('folio_resources', { op: 'propose', resourceId: 'specification', kind: 'capability-specification',
    owned: { bytes: JSON.stringify(forged), mediaType: 'application/json' } })).code, 'CAPABILITY_SPEC_INVALID');
});
