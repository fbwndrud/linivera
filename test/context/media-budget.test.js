import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './fixture.js';
import { importResourceFile } from '../../core/resources/intake.js';
import { collectContext } from '../../core/context/collect.js';

test('large retained media becomes a bounded manifest reference with its exact file hash', async (t) => {
  const f = await fixture(t); const path = join(f.root, 'synthetic-model.bin');
  const bytes = Buffer.alloc(8 * 1024 * 1024 + 1, 37); await writeFile(path, bytes);
  const model = await importResourceFile(f.root, { path, resourceId: 'model', kind: 'production-artifact', mediaType: 'model/gltf-binary' });
  assert.equal(model.version, 2);
  const result = await collectContext(f.root, { scopeId: 'next-scene', purpose: 'preserve model identity', revisionIds: [model.revisionId],
    budget: { maxTextBytes: 0, maxItems: 1, maxManifestBytes: 2000 } });
  const item = result.package.items[0];
  assert.equal(item.content, 'manifest-only'); assert.equal(item.contentHash, model.contentHash); assert.equal(item.byteLength, bytes.length);
  assert.equal(item.text, undefined); assert.equal(item.base64, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(result.package)) < 2000);
});
