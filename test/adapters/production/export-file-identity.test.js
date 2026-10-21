import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRodinExportAdapter } from '../../../adapters/production/rodin.js';
import { sha256 } from '../../../core/util/hash.js';
import { importResourceFile } from '../../../core/resources/intake.js';

test('manual file capture pins observed bytes before assigning a capture identity', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'linivera-export-identity-'))); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'first.glb'); const other = join(root, 'second.glb');
  const first = Buffer.alloc(8 * 1024 * 1024 + 1, 1); const second = Buffer.from('Synthetic second model');
  await writeFile(path, first); await writeFile(other, second);
  const adapter = createRodinExportAdapter();
  const request = { version: 1, provider: 'rodin', product: 'manual-export', endpoint: 'manual-export/rodin/v1', capability: 'manual-export',
    schemaVersion: 'linivera-manual-export-v1', parameters: { captureId: 'one-export' }, inputBindings: [],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'model', slots: [] }] } };
  const capture = (filePath, contentHash) => ({ files: [{ artifactKey: 'model', role: 'model', relativePath: 'model.glb', mediaType: 'model/gltf-binary', path: filePath, ...(contentHash ? { contentHash } : {}) }] });
  const prepared = await adapter.prepare(request, capture(path)); const { handle } = await adapter.submit(prepared);
  const observed = (await adapter.collect(handle)).artifacts[0];
  assert.equal(observed.contentHash, sha256(first));
  assert.equal(observed.metadata.sourceContentHash, sha256(first));
  const changed = await adapter.prepare(request, capture(other));
  assert.notEqual(prepared.requestDigest, changed.requestDigest);
  await assert.rejects(adapter.submit(changed), { code: 'PRODUCTION_INPUT_INVALID' });
  assert.equal((await adapter.collect(handle)).artifacts[0].path, path);
  await assert.rejects(adapter.prepare(request, capture(path, sha256(second))), { code: 'PRODUCTION_INPUT_INVALID' });
  await writeFile(path, second);
  await assert.rejects(importResourceFile(root, { resourceId: observed.resourceId, kind: 'production-artifact', path: observed.path,
    mediaType: observed.mediaType, contentHash: observed.contentHash }), { code: 'RESOURCE_HASH_MISMATCH' });
});
