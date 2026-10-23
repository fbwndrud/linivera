import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resourcesTool } from '../../server/tools/resources.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { setupAssets } from '../support/assets.js';

test('local file import registers stable resource bytes without making a source selection', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-file-intake-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'synthetic.txt'); await writeFile(path, 'synthetic voice script');
  const input = { op: 'importFile', resourceId: 'voice-script', kind: 'script', path, mediaType: 'text/plain' };
  const a = await resourcesTool(root, input); const b = await resourcesTool(root, input);
  assert.equal(a.revisionId, b.revisionId);
  assert.equal(a.resourceId, 'voice-script');
  assert.equal((await createResourceStore(root).readContent(a.revisionId)).toString(), 'synthetic voice script');
  assert.equal(await createResourceStore(root).readSourceSelection(a.resourceId), null);
  await assert.rejects(resourcesTool(root, { ...input, contentHash: 'sha256:' + '0'.repeat(64) }), { code: 'RESOURCE_HASH_MISMATCH' });
  await assert.rejects(resourcesTool(root, { ...input, path: 'relative.txt' }), { code: 'RESOURCE_PATH_INVALID' });
  const linked = join(root, 'linked'); await symlink(path, linked);
  await assert.rejects(resourcesTool(root, { ...input, path: linked }), { code: 'RESOURCE_PATH_INVALID' });
  const large = join(root, 'large'); await writeFile(large, Buffer.alloc(8 * 1024 * 1024 + 1));
  await assert.rejects(resourcesTool(root, { ...input, path: large }), { code: 'RESOURCE_TOO_LARGE' });
});

test('managed image import keeps its existing ID, source revision and approval unchanged', async (t) => {
  const f = await setupAssets(); t.after(() => rm(f.base, { recursive: true, force: true }));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1kAAAAASUVORK5CYII=', 'base64');
  await writeFile(f.source, png);
  const asset = await f.approve(await f.review(await f.put(await f.add(), { mediaType: 'image/png' })));
  const input = { op: 'importAsset', assetId: asset.id, expectedRev: asset.rev };
  const a = await resourcesTool(f.root, input); const b = await resourcesTool(f.root, input);
  assert.equal(a.resourceId, asset.id); assert.equal(a.revisionId, b.revisionId);
  assert.equal(a.contentHash, asset.output.contentHash);
  assert.equal((await f.get()).asset.rev, asset.rev); assert.equal((await f.get()).asset.approved, true);
  await assert.rejects(resourcesTool(f.root, { ...input, expectedRev: 'sha256:' + '0'.repeat(64) }), { code: 'ASSET_REV_STALE' });
});

test('managed import refuses an unrelated resource using the same logical ID', async (t) => {
  const f = await setupAssets(); t.after(() => rm(f.base, { recursive: true, force: true }));
  const asset = await f.put(await f.add());
  await createResourceStore(f.root).propose({ resourceId: asset.id, kind: 'unrelated', owned: { bytes: 'x', mediaType: 'text/plain' } });
  await assert.rejects(resourcesTool(f.root, { op: 'importAsset', assetId: asset.id, expectedRev: asset.rev }), { code: 'RESOURCE_ID_CONFLICT' });
});
