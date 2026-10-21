import assert from 'node:assert/strict';
import { prepareRequest } from '../../adapters/production/common.js';
import { createProductionRecorder } from '../../server/production/recorder.js';
import { syntheticPng } from './synthetic-media.js';
import { chooseScope, prepareScope, scopedBinding } from './scoped-scenario.js';

/** Local synthetic host consumes exact files/context; no external model call is implied. */
export async function scopedGeneration(host, scenario, packageRevision, root) {
  const iteration = await host.json('iteration', { version: 1, scopeId: 'episode-8', baseRevisionIds: [scenario.face1.revisionId],
    preserveRefs: [scenario.voice.revisionId, scenario.prop.revisionId], changeRequestRevisionId: scenario.change.revisionId,
    previousSelection: { scopeId: 'episode-8', scopeSelectionRevision: scenario.initial8.scopeSelectionRevision } }, 'iteration');
  const request = { version: 1, provider: 'synthetic', product: 'local-fixture', endpoint: 'local-iteration', capability: 'image-edit', schemaVersion: '1',
    parameters: { prompt: 'Synthetic request: change expression, retain voice and coat' },
    inputBindings: [['prompt', scenario.change], ['sourceImage', scenario.face1], ['voice', scenario.voice], ['context', packageRevision], ['iteration', iteration]]
      .map(([fieldPath, revision]) => ({ fieldPath, role: fieldPath, revisionId: revision.revisionId })),
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'edited', slots: [{ role: 'image', required: true, acceptableMediaTypes: ['image/png'] }] }] } };
  const requestRevision = await host.json('request', request, 'generation-request');
  const current = await host.call('folio_inputs', { op: 'getSelection', scopeId: 'episode-8' });
  await chooseScope(host, 'episode-8', [...current.bindings, scopedBinding('package', packageRevision), scopedBinding('iteration', iteration), scopedBinding('request', requestRevision), scopedBinding('change', scenario.change)], 'retain criteria and pin the next revision request');
  const snapshot = await prepareScope(host, 'episode-8', ['face', 'voice', 'prop', 'package', 'iteration', 'request', 'change']);
  const contents = [];
  for (const binding of request.inputBindings) {
    const actual = await host.call('folio_resources', { op: 'read', revisionId: binding.revisionId });
    contents.push({ fieldPath: binding.fieldPath, revisionId: binding.revisionId, contentHash: actual.revision.contentHash, content: actual.content ?? actual.base64 });
  }
  assert.ok(contents.find((item) => item.fieldPath === 'sourceImage').content.length);
  const prepared = prepareRequest(request, 'synthetic', { input: { prompt: request.parameters.prompt, provided: contents } }, request.inputBindings);
  const operation = await host.call('folio_operations', { op: 'start', inputSnapshotId: snapshot.inputSnapshotId, actor: 'user', idempotencyKey: 'scoped-edit', operationContractVersion: 2, requestRevisionId: requestRevision.revisionId });
  const recorder = createProductionRecorder({ call: host.call, root, operationId: operation.operationId, executionId: 'local-fixture' });
  await recorder.prepared(prepared);
  await recorder.submit({ submit: async () => ({ status: 'accepted', handle: { jobId: 'synthetic-local-edit', jobIdSource: 'local-correlation' }, nativeRecords: [] }) }, prepared);
  const captured = await recorder.collect(prepared, { artifacts: [{ artifactKey: 'edited-image', groupId: 'edited', role: 'image', resourceId: 'edited-face', mediaType: 'image/png', bytes: syntheticPng(200, 120) }], nativeRecords: [], unavailableFields: ['modelInternalReasoning'] }, { inputSnapshotId: snapshot.inputSnapshotId });
  await recorder.status('complete');
  const group = captured.groups[0];
  const receiptId = await host.call('folio_operations', { op: 'reviewGroup', operationId: operation.operationId, groupId: 'edited', outputHashes: group.outputs.map((item) => item.contentHash), findings: [], reviewer: 'host' });
  await host.call('folio_operations', { op: 'decideGroup', operationId: operation.operationId, groupId: 'edited', receiptId, actor: 'user', action: 'approve', expectedCheckpoint: (await host.graph()).checkpoint });
  return { edited: captured.artifacts[0], iteration, snapshot, operation };
}
