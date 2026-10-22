import assert from 'node:assert/strict';
import { prepareRequest } from '../../adapters/production/common.js';
import { createProductionRecorder } from '../../server/production/recorder.js';

/** A synthetic local transport consumes the sealed source, instruction and context. No network. */
export async function chromaGeneration(root, host, s, snapshot, requestRevision, create) {
  const { call } = host;
  const request = await s.readJson(requestRevision);
  const operation = await call('folio_operations', { op: 'start', inputSnapshotId: snapshot.inputSnapshotId,
    operationContractVersion: 2, requestRevisionId: requestRevision.revisionId, actor: 'user', idempotencyKey: 'next' });
  const source = request.inputBindings.find((b) => b.role === 'source');
  assert.equal(source.revisionId, s.resources.get('deliverable').revisionId);
  const prepared = prepareRequest(request, 'local', { endpoint: request.endpoint, input: request.parameters,
    sourceContentHash: (await host.read(source.revisionId)).contentHash }, request.inputBindings.map(({ fieldPath, revisionId }) => ({ fieldPath, revisionId })));
  const adapter = { submit: async () => ({ status: 'complete', handle: { provider: 'local', jobId: 'synthetic-next', jobIdSource: 'local-capture' } }) };
  const recorder = createProductionRecorder({ call, root, operationId: operation.operationId, executionId: 'synthetic' });
  await recorder.prepared(prepared); await recorder.submit(adapter, prepared);
  const output = await create();
  const retained = await recorder.collect(prepared, { status: 'complete', artifacts: [{ artifactKey: 'result', groupId: 'candidate-0', role: 'result',
    resourceId: output.resourceId, mediaType: output.mediaType, bytes: await s.readBytes(output.resourceId) }], nativeRecords: [], observation: 'user-reported' },
  { inputSnapshotId: snapshot.inputSnapshotId });
  await recorder.status('complete');
  assert.equal(retained.groups.length, 1);
  await approveRecordedGroups(host, operation.operationId, retained.groups);
  const artifact = await host.read(retained.artifacts[0].revisionId);
  await s.keep('next', artifact);
  return { output: artifact, snapshot, operationId: operation.operationId };
}
export async function approveRecordedGroups(host, operationId, groups) {
  const { call } = host;
  for (const group of groups) {
    const receiptId = await call('folio_operations', { op: 'reviewGroup', operationId, groupId: group.groupId,
      outputHashes: group.outputs.map((r) => r.contentHash), findings: [], reviewer: 'host' });
    const decision = await call('folio_operations', { op: 'decideGroup', operationId, groupId: group.groupId,
      receiptId, actor: 'user', action: 'approve', expectedCheckpoint: (await host.graph()).checkpoint });
    assert.equal(decision.selfReview, true);
  }
}
