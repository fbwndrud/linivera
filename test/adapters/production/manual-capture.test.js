import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualCaptureAdapter } from '../../../adapters/production/manual-capture.js';

function request() {
  return { version: 1, provider: 'manual', product: 'capture', endpoint: 'local-files', capability: 'manual-import', schemaVersion: '1',
    parameters: { captureId: 'fixture-import', declaredProvider: 'web-editor' }, inputBindings: [],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'take', slots: [{ role: 'image', required: true, acceptableMediaTypes: ['image/png'] }] }] },
  };
}

test('manual files use the same collection contract while missing generation provenance remains unknown', async () => {
  const adapter = createManualCaptureAdapter();
  const supplied = { artifactKey: 'image', groupId: 'take', role: 'image', mediaType: 'image/png', bytes: Buffer.from('synthetic-image') };
  const prepared = await adapter.prepare(request(), [supplied]);
  const submitted = await adapter.submit(prepared);
  assert.equal(submitted.status, 'complete');
  const collected = await adapter.collect(submitted.handle);
  assert.equal(collected.artifacts[0].bytes.toString(), 'synthetic-image');
  assert.equal(collected.observation, 'user-reported');
  assert.equal(collected.artifacts[0].metadata.generation, 'unknown');
  assert.ok(collected.unavailableFields.includes('originalPrompt'));
  const again = await adapter.collect(JSON.parse(JSON.stringify(submitted.handle)));
  assert.equal(again.artifacts[0].resourceId, collected.artifacts[0].resourceId);
});
