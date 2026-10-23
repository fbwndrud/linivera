import test from 'node:test';
import assert from 'node:assert/strict';
import { createFalAdapter } from '../../../adapters/production/fal.js';

function request() {
  return {
    version: 1, provider: 'fal', product: 'flux', endpoint: 'fal-ai/flux/schnell', capability: 'text-to-image',
    schemaVersion: '2026-10-22', parameters: { prompt: 'A synthetic blue square', num_images: 2 }, inputBindings: [],
    outputSpec: { groupPolicy: 'fixed', groups: ['take-a', 'take-b'].map((groupId) => ({
      groupId, slots: [{ role: 'image', required: true, acceptableMediaTypes: ['image/png'] }],
    })) },
  };
}

test('fal queue candidates keep separate groups and stable identities when collected again', async () => {
  const calls = [];
  const transport = {
    submit: async (endpoint, input) => { calls.push({ endpoint, input }); return { request_id: 'synthetic-job-1' }; },
    status: async () => ({ status: 'COMPLETED' }),
    result: async () => ({ data: { images: [
      { url: 'https://example.invalid/a.png', content_type: 'image/png' },
      { url: 'https://example.invalid/b.png', content_type: 'image/png' },
    ], seed: 7 } }),
    download: async (url) => Buffer.from(url.endsWith('a.png') ? 'synthetic-a' : 'synthetic-b'),
  };
  const adapter = createFalAdapter({ transport, accountAlias: 'fixture' });
  const prepared = await adapter.prepare(request());
  const submitted = await adapter.submit(prepared);
  assert.equal(submitted.status, 'accepted');
  assert.equal((await adapter.inspect(submitted.handle)).status, 'complete');
  const first = await adapter.collect(submitted.handle);
  assert.deepEqual(first.artifacts.map((artifact) => artifact.groupId), ['take-a', 'take-b']);
  assert.deepEqual(first.artifacts.map((artifact) => artifact.bytes.toString()), ['synthetic-a', 'synthetic-b']);
  const recovered = await adapter.collect(JSON.parse(JSON.stringify(submitted.handle)));
  assert.deepEqual(recovered.artifacts.map((artifact) => artifact.resourceId), first.artifacts.map((artifact) => artifact.resourceId));
  assert.equal(calls.length, 1);
});

test('an acknowledgement lost after submit stays unknown and is not posted again', async () => {
  let submits = 0;
  const adapter = createFalAdapter({ accountAlias: 'fixture', transport: {
    submit: async () => { submits++; throw new Error('socket closed after sending'); },
    status: async () => ({}), result: async () => ({}), download: async () => Buffer.alloc(0),
  } });
  const prepared = await adapter.prepare(request());
  const lost = await adapter.submit(prepared);
  assert.equal(lost.status, 'submission-unknown');
  assert.equal(lost.handle, undefined);
  assert.deepEqual(await adapter.submit(prepared), lost);
  assert.equal(submits, 1);
});

test('native observations redact credentials and signed queries without changing the downloaded URL', async () => {
  const signed = 'https://example.invalid/a.png?X-Amz-Signature=fixture-sig-837';
  let downloaded;
  const adapter = createFalAdapter({ accountAlias: 'fixture', transport: {
    submit: async () => ({ request_id: 'synthetic-redacted', headers: { authorization: 'fixture-auth-812' } }),
    status: async () => ({ status: 'COMPLETED' }),
    result: async () => ({ data: { images: [{ url: signed, content_type: 'image/png' }], token: 'fixture-token-736' } }),
    download: async (url) => { downloaded = url; return Buffer.from('synthetic'); },
  } });
  const input = request(); input.parameters.num_images = 1; input.outputSpec.groups.length = 1;
  const prepared = await adapter.prepare(input);
  const submitted = await adapter.submit(prepared);
  const collected = await adapter.collect(submitted.handle);
  const persisted = JSON.stringify([submitted.nativeRecords, collected.nativeRecords]);
  for (const secret of ['fixture-sig-837', 'fixture-auth-812', 'fixture-token-736']) assert.ok(!persisted.includes(secret));
  assert.equal(downloaded, signed);
  assert.ok(collected.nativeRecords[0].omittedPaths.length > 0);
});

test('fal binds the exact pinned prompt and rejects missing, changed, or unused inputs', async () => {
  const adapter = createFalAdapter({ accountAlias: 'fixture', transport: {
    submit: async () => ({}), status: async () => ({}), result: async () => ({}), download: async () => Buffer.alloc(0),
  } });
  const input = request();
  const revisionId = `sha256:${'a'.repeat(64)}`;
  input.inputBindings = [{ fieldPath: 'prompt', revisionId, role: 'prompt' }];
  const artifact = { revisionId, bytes: Buffer.from(input.parameters.prompt), mediaType: 'text/plain' };
  const prepared = await adapter.prepare(input, [artifact]);
  assert.deepEqual(prepared.inputMapping, [{ fieldPath: 'prompt', revisionId }]);
  await assert.rejects(adapter.prepare(input, []), { code: 'PRODUCTION_INPUT_INVALID' });
  await assert.rejects(adapter.prepare(input, [{ ...artifact, bytes: Buffer.from('different text') }]), { code: 'PRODUCTION_INPUT_INVALID' });
  input.inputBindings[0].fieldPath = 'reference_image';
  await assert.rejects(adapter.prepare(input, [artifact]), { code: 'PRODUCTION_INPUT_INVALID' });
});

test('fewer observed candidates remain collectible as partial without inventing missing outputs', async () => {
  const adapter = createFalAdapter({ accountAlias: 'fixture', transport: {
    submit: async () => ({ request_id: 'partial-job' }), status: async () => ({ status: 'COMPLETED' }),
    result: async () => ({ data: { images: [{ url: 'https://example.invalid/one.png', content_type: 'image/png' }] } }),
    download: async () => Buffer.from('synthetic-only-candidate'),
  } });
  const { handle } = await adapter.submit(await adapter.prepare(request()));
  const collected = await adapter.collect(handle);
  assert.equal(collected.status, 'partial');
  assert.equal(collected.artifacts.length, 1);
  assert.equal(collected.artifacts[0].groupId, 'take-a');
  assert.ok(collected.unavailableFields.includes('image-1'));
});

test('unsupported input fields are rejected before execution and prepared requests cannot drift', async () => {
  let calls = 0;
  const adapter = createFalAdapter({ accountAlias: 'fixture', transport: {
    submit: async () => { calls++; return { request_id: 'fixed' }; }, status: async () => ({}), result: async () => ({}), download: async () => Buffer.alloc(0),
  } });
  const unsupported = request(); unsupported.parameters.unrecognized_model_option = true;
  await assert.rejects(adapter.prepare(unsupported), { code: 'PRODUCTION_INPUT_INVALID' });
  const prepared = await adapter.prepare(request());
  assert.throws(() => { prepared.nativeRequest.input.prompt = 'a different generation'; }, TypeError);
  await adapter.submit(prepared);
  assert.equal(calls, 1);
});
