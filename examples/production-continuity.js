import assert from 'node:assert/strict';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFalAdapter } from '../adapters/production/fal.js';
import { createElevenLabsAdapter } from '../adapters/production/elevenlabs.js';
import { resourceIdentity } from '../adapters/production/common.js';
import { createProductionRecorder } from '../server/production/recorder.js';
import { productionHost } from './support/production-host.js';
import { generatedMotion } from './support/generated-motion.js';
import { syntheticPng, syntheticWav } from './support/synthetic-media.js';

/** Entirely synthetic transports; no provider endpoint, credentials or paid generation. */
export async function runProductionContinuity({ keep = false } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'linivera-continuity-')); const root = join(base, 'work');
  const host = await productionHost(root); const { call, json, select, input } = host;
  const text = 'Hi'; let submits = 0; let imageUrlAvailable = true;
  const fal = createFalAdapter({ accountAlias: 'synthetic', transport: {
    submit: async () => { submits++; return { request_id: 'synthetic-image-job' }; },
    status: async () => ({ status: 'COMPLETED' }),
    result: async () => ({ images: [{ url: 'https://example.invalid/image?token=secret', content_type: 'image/png' }], seed: 42 }),
    download: async () => { assert.equal(imageUrlAvailable, true, 'provider URL has expired'); return syntheticPng(); },
  } });
  const speech = createElevenLabsAdapter({ accountAlias: 'synthetic', transport: {
    convertWithTimestamps: async () => ({ request_id: 'synthetic-speech-job', audio_base64: syntheticWav().toString('base64'),
      alignment: { characters: ['H', 'i'], character_start_times_seconds: [0, 0.2], character_end_times_seconds: [0.2, 0.4] } }),
  } });
  const identity = (provider, endpoint, jobId, key) => resourceIdentity({ provider, accountAlias: 'synthetic', endpoint, jobId }, key);
  const imageId = identity('fal', 'fal-ai/flux/schnell', 'synthetic-image-job', 'image-0');
  const audioId = identity('elevenlabs', '/v1/text-to-speech/fixture-voice/with-timestamps', 'synthetic-speech-job', 'audio');
  const alignmentId = identity('elevenlabs', '/v1/text-to-speech/fixture-voice/with-timestamps', 'synthetic-speech-job', 'alignment');
  try {
    await call('folio_init', { title: 'Synthetic generation continuity', preset: 'picturebook' });
    const scope = ['prompt', 'narration', 'image-request', 'speech-request', imageId, audioId, alignmentId, 'project', 'film', 'film-shot-01', 'film-timeline'];
    for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 8 * 1024 * 1024 }],
      ['pipeline', { version: 1, steps: [{ id: 'generate', capability: 'transform' }] }],
      ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish'] }]]) {
      const revision = await json(kind, value, kind); await select(revision); host.definitions[kind + 'RevisionId'] = revision.revisionId;
    }
    async function source(resourceId, bytes, parents = []) {
      const r = await call('folio_resources', { op: 'propose', resourceId, kind: 'text', parents, owned: { bytes, mediaType: 'text/plain' } });
      await select(r); return r;
    }
    const prompt = await source('prompt', 'Synthetic blue square'); const narration = await source('narration', text);
    async function generate({ adapter, requestId, provider, endpoint, capability, parameters, sourceRevision, fieldPath, slots }) {
      const request = { version: 1, provider, product: 'synthetic-fixture', endpoint, capability, schemaVersion: '1', parameters,
        inputBindings: [{ fieldPath, revisionId: sourceRevision.revisionId, role: fieldPath }],
        outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'candidate-0', slots }] } };
      const requestRevision = await json(requestId, request, 'generation-request'); await select(requestRevision);
      const snapshot = await input([sourceRevision, requestRevision]);
      const operation = await call('folio_operations', { op: 'start', inputSnapshotId: snapshot.inputSnapshotId,
        idempotencyKey: requestId, actor: 'user', operationContractVersion: 2, requestRevisionId: requestRevision.revisionId });
      const pinned = await call('folio_resources', { op: 'read', revisionId: sourceRevision.revisionId });
      const prepared = await adapter.prepare(request, [{ revisionId: sourceRevision.revisionId, bytes: Buffer.from(parameters[fieldPath]), mediaType: 'text/plain', contentHash: pinned.revision.contentHash }]);
      let recorder = createProductionRecorder({ call, root, operationId: operation.operationId, executionId: 'first' });
      await recorder.prepared(prepared);
      const submission = await recorder.submit(adapter, prepared);
      // Recover from durable MCP records before collection; never resubmit POST after restart.
      await host.restart(); recorder = createProductionRecorder({ call, root, operationId: operation.operationId, executionId: 'first' });
      const recovered = await recorder.resume(); assert.equal(recovered.executions[0].providerJobId, submission.handle.jobId);
      const pinnedRequest = JSON.parse((await call('folio_resources', { op: 'read', revisionId: requestRevision.revisionId })).content);
      const recoveredHandle = { provider, accountAlias: 'synthetic', endpoint, jobId: recovered.executions[0].providerJobId,
        jobIdSource: submission.handle.jobIdSource, request: pinnedRequest };
      const collection = await adapter.collect(recoveredHandle);
      const retained = await recorder.collect(prepared, collection, { inputSnapshotId: snapshot.inputSnapshotId });
      await recorder.status('complete');
      for (const group of retained.groups) {
        const receiptId = await call('folio_operations', { op: 'reviewGroup', operationId: operation.operationId, groupId: group.groupId,
          outputHashes: group.outputs.map((o) => o.contentHash), findings: [], reviewer: 'host' });
        const decision = await call('folio_operations', { op: 'decideGroup', operationId: operation.operationId, groupId: group.groupId,
          receiptId, actor: 'user', action: 'approve', expectedCheckpoint: (await host.graph()).checkpoint });
        assert.equal(decision.selfReview, true);
      }
      for (const artifact of retained.artifacts) await select(await host.read(artifact.revisionId));
      return retained;
    }
    const images = await generate({ adapter: fal, requestId: 'image-request', provider: 'fal', endpoint: 'fal-ai/flux/schnell', capability: 'text-to-image',
      parameters: { prompt: 'Synthetic blue square', num_images: 1 }, sourceRevision: prompt, fieldPath: 'prompt', slots: [{ role: 'image', required: true, acceptableMediaTypes: ['image/png'] }] });
    const voice = await generate({ adapter: speech, requestId: 'speech-request', provider: 'elevenlabs', endpoint: '/v1/text-to-speech/fixture-voice/with-timestamps', capability: 'text-to-speech',
      parameters: { text, output_format: 'wav_8000' }, sourceRevision: narration, fieldPath: 'text', slots: [
        { role: 'audio', required: true, acceptableMediaTypes: ['audio/wav'] }, { role: 'alignment', required: true, acceptableMediaTypes: ['application/json'] }] });
    imageUrlAvailable = false;
    const audio = voice.artifacts.find((a) => a.role === 'audio'); const alignment = voice.artifacts.find((a) => a.role === 'alignment');
    const readAlignment = await call('folio_resources', { op: 'read', revisionId: alignment.revisionId });
    const alignmentData = JSON.parse(readAlignment.content);
    assert.equal(alignmentData.audioRevisionId, audio.revisionId); assert.equal(alignmentData.textRevisionId, narration.revisionId);
    await host.restart();
    const motion = await generatedMotion(host, images.artifacts[0], audio);
    assert.equal(submits, 1);
    await source('prompt', 'Synthetic green square', [prompt.revisionId]);
    const graph = await host.graph();
    for (const revision of [images.artifacts[0], motion.shot, motion.timeline, motion.video]) {
      assert.equal(graph.nodes.find((n) => n.revisionId === revision.revisionId)?.reviewRequired, true, revision.resourceId);
    }
    return { synthetic: true, verified: true, actualModelGeneration: false, serverRestarted: true,
      audioAligned: true, videoAudio: motion.videoAudio, transitiveReviewRequired: true, ...(keep ? { root } : {}) };
  } finally { await host.close(); if (!keep) await rm(base, { recursive: true, force: true }); }
}
const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === fileURLToPath(import.meta.url)) runProductionContinuity({ keep: process.argv.includes('--keep') })
  .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
