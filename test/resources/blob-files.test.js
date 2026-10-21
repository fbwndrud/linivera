import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile, truncate, open, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resourcesTool } from '../../server/tools/resources.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';

test('large opaque files have stable v2 revisions and explicit verified materialization', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-blob-')); t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.alloc(8 * 1024 * 1024 + 17, 37); const path = join(root, 'synthetic.exr'); await writeFile(path, bytes);
  const input = { op: 'importFile', resourceId: 'hdr', kind: 'image', path, mediaType: 'image/x-exr' };
  const revision = await resourcesTool(root, input);
  assert.equal(revision.version, 2); assert.equal(revision.byteLength, bytes.length);
  assert.equal(revision.contentHash, 'sha256:' + createHash('sha256').update(bytes).digest('hex'));
  assert.equal((await resourcesTool(root, input)).revisionId, revision.revisionId);
  const described = await resourcesTool(root, { op: 'describe', revisionId: revision.revisionId });
  assert.equal(described.revision.contentHash, revision.contentHash); assert.equal(described.validation.format, 'opaque');
  await assert.rejects(resourcesTool(root, { op: 'read', revisionId: revision.revisionId }), { code: 'RESOURCE_TOO_LARGE' });
  const output = join(root, 'copy.exr');
  const materialized = await resourcesTool(root, { op: 'materialize', revisionId: revision.revisionId, output });
  assert.equal(materialized.contentHash, revision.contentHash); assert.deepEqual(await readFile(output), bytes);
  await assert.rejects(resourcesTool(root, { op: 'materialize', revisionId: revision.revisionId, output }), { code: 'RESOURCE_OUTPUT_EXISTS' });
  await writeFile(path, 'changed source');
  assert.equal((await createResourceStore(root).readRevision(revision.revisionId)).byteLength, bytes.length);
  const stored = join(root, '.folio', 'resources', 'content', revision.contentHash.slice(7) + '.bin');
  await truncate(stored, 12);
  await assert.rejects(resourcesTool(root, { op: 'describe', revisionId: revision.revisionId }), { code: 'RESOURCE_INTEGRITY_FAILURE' });
});

test('file transfer limits and destinations cannot bypass inline or immutable-state boundaries', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-blob-boundary-')); t.after(() => rm(root, { recursive: true, force: true }));
  const sparse = join(root, 'sparse'); const handle = await open(sparse, 'wx'); await handle.truncate(2 * 1024 * 1024 * 1024 + 1); await handle.close();
  await assert.rejects(resourcesTool(root, { op: 'importFile', resourceId: 'big', kind: 'opaque', path: sparse, mediaType: 'application/octet-stream' }), { code: 'RESOURCE_TOO_LARGE' });
  const revision = await createResourceStore(root).propose({ resourceId: 'original', kind: 'opaque', owned: { bytes: Buffer.from('synthetic'), mediaType: 'application/x-custom-native' } });
  await assert.rejects(resourcesTool(root, { op: 'materialize', revisionId: revision.revisionId, output: join(root, '.folio', 'new-file') }), { code: 'RESOURCE_PATH_INVALID' });
  const output = join(root, 'existing'); await writeFile(output, 'keep');
  await assert.rejects(resourcesTool(root, { op: 'materialize', revisionId: revision.revisionId, output }), { code: 'RESOURCE_OUTPUT_EXISTS' });
  assert.equal((await readFile(output)).toString(), 'keep');
  const linked = join(root, 'linked'); await symlink(output, linked);
  await assert.rejects(resourcesTool(root, { op: 'importFile', resourceId: 'linked', kind: 'opaque', path: linked, mediaType: 'application/octet-stream' }), { code: 'RESOURCE_PATH_INVALID' });
  await assert.rejects(resourcesTool(root, { op: 'propose', resourceId: 'inline', kind: 'opaque', owned: { base64: Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64'), mediaType: 'application/octet-stream' } }), { code: 'RESOURCE_CONTENT_INVALID' });
});

test('large retained bytes are included in sealed budgets and verified without inline reads', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-large-input-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'synthetic-video'); const length = 8 * 1024 * 1024 + 1; await writeFile(path, Buffer.alloc(length, 42));
  const revision = await resourcesTool(root, { op: 'importFile', resourceId: 'video', kind: 'video', path, mediaType: 'video/mp4' });
  const store = createResourceStore(root); const input = { revisionIds: [revision.revisionId] };
  async function selected(resourceId, kind, value) {
    const result = value ?? await store.propose({ resourceId, kind, owned: { mediaType: 'application/json', bytes: '{}' } });
    const old = await store.readSourceSelection(resourceId);
    await store.decideSource({ revisionId: result.revisionId, expectedSelectionRevision: old?.selectionRevision ?? null, action: { actor: 'user', type: 'select' } });
    return result;
  }
  await selected('video', 'video', revision);
  for (const [kind, value] of [['profile', { version: 1, scope: ['video'], maxInputBytes: length + 10000 }], ['pipeline', { version: 1, steps: [{ id: 'continue', capability: 'transform' }] }], ['policy', { version: 1, scope: ['video'], allowedActions: ['create-candidate'] }]]) {
    const definition = await store.propose({ resourceId: kind, kind, owned: { mediaType: 'application/json', bytes: JSON.stringify(value) } });
    await selected(kind, kind, definition); input[kind + 'RevisionId'] = definition.revisionId;
  }
  const prepared = await prepareInput(root, input);
  assert.equal(prepared.manifest.resources[0].byteLength, length);
  assert.ok(prepared.manifest.totalBytes > length);
  assert.equal((await verifyInput(root, prepared.inputSnapshotId)).manifest.resources[0].contentHash, revision.contentHash);
  const smaller = await store.propose({ resourceId: 'profile', kind: 'profile', owned: { mediaType: 'application/json', bytes: JSON.stringify({ version: 1, scope: ['video'], maxInputBytes: length - 1 }) } });
  await selected('profile', 'profile', smaller);
  await assert.rejects(prepareInput(root, { ...input, profileRevisionId: smaller.revisionId }), { code: 'INPUT_INVALID' });
});
