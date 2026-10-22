import assert from 'node:assert/strict';
import { createFalAdapter } from '../../adapters/production/fal.js';
import { createProductionRecorder } from '../../server/production/recorder.js';
import { syntheticPng } from './synthetic-media.js';
import { approveRecordedGroups } from './chroma-generation.js';

export const initialScope = ['initial-spec', 'initial-instruction', 'initial-request', 'initial-readiness', 'initial-context', 'initial-package', 'initial-response'];

/** Official representative contract → comparison → one package → synthetic fal output before P0. */
export async function chromaInitialGeneration(root, host, s) {
  const { call } = host; const R = (id) => s.resources.get(id);
  const spec = await call('folio_resource_query', { op: 'specification', capabilityId: 'fal-flux-schnell-v1' });
  await s.retainJson('initial-spec', spec, 'capability-specification');
  const prompt = 'Synthetic harbor color study';
  await s.retain('initial-instruction', prompt, 'text/plain', 'text');
  const request = { version: 1, ...spec.identity, parameters: { prompt, num_images: 1, output_format: 'png' },
    inputBindings: [{ fieldPath: 'prompt', role: 'prompt', revisionId: R('initial-instruction').revisionId }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'candidate-0', slots: [{ role: 'image', required: true, acceptableMediaTypes: ['image/png'] }] }] } };
  await s.retainJson('initial-request', request, 'generation-request');
  const comparison = { specificationRevisionId: R('initial-spec').revisionId, requestRevisionId: R('initial-request').revisionId,
    candidateRevisionIds: [R('initial-instruction').revisionId], ...host.definitions, scopeId: 'episode-1', pathId: 'main',
    search: { completeness: 'partial', reason: 'Exact prompt candidate; external holdings and other selected resources are outside this search.' } };
  const report = await call('folio_resource_query', { op: 'retainReadiness', resourceId: 'initial-readiness', ...comparison });
  await s.keep('initial-readiness', report);
  const roles = { specification: R('initial-spec'), comparison: report, request: R('initial-request') };
  await s.retainJson('initial-context', { version: 1, scopeId: 'episode-1', pathId: 'main',
    requirements: Object.entries(roles).map(([role, r]) => ({ role, required: true, accepts: [{ kind: r.kind }] })),
    states: Object.entries(roles).map(([role, r]) => ({ role, status: 'observed', artifactRevisionId: r.revisionId, evidenceRevisionIds: [] })) }, 'usage-context');
  const preview = await call('folio_resource_query', { op: 'context', scopeId: 'episode-1', pathId: 'main', purpose: 'Generate the initial synthetic image',
    contextRevisionId: R('initial-context').revisionId, budget: { maxTextBytes: 4096, maxItems: 8, maxManifestBytes: 65536 } });
  assert.equal(preview.ready, true);
  await s.retainJson('initial-package', preview.package, 'context-package');
  const snapshot = await s.prepare(['initial-package']);
  const operation = await call('folio_operations', { op: 'start', inputSnapshotId: snapshot.inputSnapshotId, actor: 'user', idempotencyKey: 'initial-generation',
    operationContractVersion: 2, requestRevisionId: R('initial-request').revisionId });
  const pinned = await s.readBytes('initial-instruction');
  let submittedPrompt;
  const bytes = syntheticPng(pinned[0], pinned.at(-1));
  const adapter = createFalAdapter({ accountAlias: 'synthetic', transport: {
    submit: async (_endpoint, payload) => { submittedPrompt = payload.input.prompt; assert.equal(submittedPrompt, pinned.toString('utf8')); return { request_id: 'synthetic-initial-image' }; },
    status: async () => ({ status: 'COMPLETED' }),
    result: async () => ({ images: [{ url: 'https://example.invalid/synthetic-initial.png', content_type: 'image/png' }] }),
    download: async () => { assert.equal(submittedPrompt, prompt); return bytes; },
  } });
  const prepared = await adapter.prepare(request, [{ revisionId: R('initial-instruction').revisionId, bytes: pinned, mediaType: 'text/plain', contentHash: R('initial-instruction').contentHash }]);
  const recorder = createProductionRecorder({ root, call, operationId: operation.operationId, executionId: 'initial' });
  await recorder.prepared(prepared);
  const submission = await recorder.submit(adapter, prepared);
  const collection = await adapter.collect(submission.handle);
  await s.retainJson('initial-response', collection.nativeRecords[0].record, 'provider-response-source');
  // The host keeps a stable local resource name; the native response remains separate observed evidence.
  collection.artifacts[0].resourceId = 'provider-image';
  const retained = await recorder.collect(prepared, collection, { inputSnapshotId: snapshot.inputSnapshotId });
  await recorder.status('complete');
  await approveRecordedGroups(host, operation.operationId, retained.groups);
  await s.keep('provider-image', await host.read(retained.artifacts[0].revisionId));
  return { bytes, snapshot };
}
