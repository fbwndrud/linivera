import test from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture } from './production-fixture.js';
import { startOperation, readOperation, submitResult } from '../../core/operations/requests.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';
import { metadataEntries, metadataManifest, buildMetadataProjection } from '../../core/projections/metadata.js';
import { saveGeneration } from '../../core/projections/manifest.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { queryResources } from '../../core/query/resources.js';
test('production operations pin their contract and cannot bypass group checks through legacy submit', async (t) => {
  const f = await productionFixture(t);
  const operation = await f.operation();
  assert.equal((await readOperation(f.root, operation.operationId)).operationContractVersion, 2);
  assert.deepEqual(await f.operation(), operation);
  const result = await f.resource('result', 'result', 'synthetic output', 'text/plain');
  await assert.rejects(submitResult(f.root, { ...operation, inputSnapshotId: f.snapshot.inputSnapshotId, resultRevisionIds: [result.revisionId] }), { code: 'OPERATION_CONTRACT_MISMATCH' });
  const { operationContractVersion: _version, requestRevisionId: _request, ...legacy } = f.start;
  await assert.rejects(startOperation(f.root, { ...legacy, idempotencyKey: 'legacy-bypass' }), { code: 'OPERATION_CONTRACT_MISMATCH' });
});
test('a nested generation request cannot smuggle an unselected input past the snapshot scope', async (t) => {
  const f = await productionFixture(t);
  const request = await f.resource('request', 'generation-request', { ...f.requestValue, inputBindings: [{ fieldPath: 'image', role: 'identity', revisionId: 'sha256:' + 'f'.repeat(64) }] });
  await f.select(request);
  const snapshot = await prepareInput(f.root, { revisionIds: [f.source.revisionId, request.revisionId], profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, policyRevisionId: f.ids.policy });
  await assert.rejects(startOperation(f.root, { ...f.start, idempotencyKey: 'unbound', inputSnapshotId: snapshot.inputSnapshotId, requestRevisionId: request.revisionId }), { code: 'INPUT_REFERENCE_OUTSIDE_SNAPSHOT' });
});
test('v4 metadata retains historical verification and v5 refresh becomes current', async (t) => {
  const f = await productionFixture(t); const state = await readWorkspaceState(f.root);
  const entries = await metadataEntries(f.root, state, { transitive: false });
  await saveGeneration(f.root, metadataManifest(entries, state, 'folio-metadata-v4'), entries);
  assert.equal((await queryResources(f.root, { freshness: 'allowStale' })).freshness, 'stale');
  assert.equal((await buildMetadataProjection(f.root)).generatorRevision, 'folio-metadata-v5');
  assert.equal((await queryResources(f.root, {})).freshness, 'current');
});
