import test from 'node:test';
import assert from 'node:assert/strict';
import { productionFixture } from './production-fixture.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';
import { startOperation } from '../../core/operations/requests.js';

test('explicit text bindings reject mismatched or missing parameter bytes at operation start', async (t) => {
  for (const fieldPath of ['prompt', 'text', 'previous_text', 'next_text']) {
    const f = await productionFixture(t, { inputFieldPath: fieldPath, parameters: { [fieldPath]: 'synthetic source' } });
    assert.ok((await f.operation()).operationId);
    for (const parameters of [{ [fieldPath]: 'synthetic source\n' }, {}]) {
      const request = await f.resource('request', 'generation-request', { ...f.requestValue, parameters }); await f.select(request);
      const snapshot = await prepareInput(f.root, { revisionIds: [f.source.revisionId, request.revisionId], profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, policyRevisionId: f.ids.policy });
      await assert.rejects(startOperation(f.root, { ...f.start, idempotencyKey: fieldPath + JSON.stringify(parameters), inputSnapshotId: snapshot.inputSnapshotId, requestRevisionId: request.revisionId }), { code: 'PRODUCTION_INPUT_BINDING_INVALID' });
    }
  }
});

test('text bindings require owned text/plain and bind an explicit transformed revision when present', async (t) => {
  const f = await productionFixture(t, { extraScope: ['transformed'] });
  const transformed = await f.resource('transformed', 'document', '변환한 합성 문장\r\n', 'text/plain'); await f.select(transformed);
  const value = { ...f.requestValue, parameters: { text: '변환한 합성 문장\r\n' }, inputBindings: [{ fieldPath: 'text', role: 'script', revisionId: f.source.revisionId, transformRevisionId: transformed.revisionId }] };
  const request = await f.resource('request', 'generation-request', value); await f.select(request);
  const snapshot = await prepareInput(f.root, { revisionIds: [f.source.revisionId, transformed.revisionId, request.revisionId], profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, policyRevisionId: f.ids.policy });
  assert.ok((await startOperation(f.root, { ...f.start, idempotencyKey: 'transformed', inputSnapshotId: snapshot.inputSnapshotId, requestRevisionId: request.revisionId })).operationId);
  const nontext = await f.resource('transformed', 'document', { text: 'synthetic JSON' }); await f.select(nontext);
  const invalid = await f.resource('request', 'generation-request', { ...value, inputBindings: [{ fieldPath: 'text', role: 'script', revisionId: nontext.revisionId }] }); await f.select(invalid);
  const invalidSnapshot = await prepareInput(f.root, { revisionIds: [f.source.revisionId, nontext.revisionId, invalid.revisionId], profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, policyRevisionId: f.ids.policy });
  await assert.rejects(startOperation(f.root, { ...f.start, idempotencyKey: 'not-text', inputSnapshotId: invalidSnapshot.inputSnapshotId, requestRevisionId: invalid.revisionId }), { code: 'PRODUCTION_INPUT_BINDING_INVALID' });
});
