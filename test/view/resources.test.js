import test from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { viewResources, viewResource, readResourceSnapshot } from '../../core/view/resources.js';
import { withResourceViewCheckpoint } from '../../core/view/resource-checkpoint.js';
import { viewerTarget } from '../../core/view/viewer-target.js';
import { viewOutline } from '../../core/view/outline.js';
import { buildSnapshot } from '../../core/view/snapshot.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { queryResources } from '../../core/query/resources.js';
import { tempDir, fakePacks, copyFixture } from '../support/fixtures.js';
import { resourceFixture, approvedFixture } from '../support/view-resources.js';
import { sha256, canonicalJson } from '../../core/util/hash.js';
import { sourceSnapshot } from '../support/export-work.js';

test('missing generation is explicit and resources reads never recover pending writes', async () => {
  const root = await tempDir(); const f = await resourceFixture(root);
  await mkdir(join(root, '.folio', 'tx'), { recursive: true });
  await mkdir(join(root, 'tree'));
  await writeFile(join(root, 'tree', 'synthetic.md'), 'synthetic after');
  await writeFile(join(root, '.folio', 'tx', 'backup-0'), 'synthetic before');
  await writeFile(join(root, '.folio', 'tx', 'journal.json'), JSON.stringify({ files: [{ path: 'tree/synthetic.md', backup: 'backup-0', beforeHash: sha256('synthetic before'), afterHash: sha256('synthetic after') }] }));
  const before = await sourceSnapshot(root);
  const empty = await viewResources(root);
  assert.equal(empty.unavailableReason, 'not-indexed'); assert.deepEqual(empty.entries, []);
  await assert.rejects(viewResource(root, f.candidate.revisionId), { code: 'RESOURCE_NOT_VISIBLE' });
  assert.deepEqual(await sourceSnapshot(root), before);
  await assert.rejects(queryResources(root, {}), { code: 'PROJECTION_NOT_CURRENT' });
  assert.equal(await readFile(join(root, 'tree', 'synthetic.md'), 'utf8'), 'synthetic before');
});

test('selected sources and approved results keep evidence, history, review status and hide candidates', async () => {
  const root = await tempDir(); const f = await approvedFixture(root);
  await buildMetadataProjection(root);
  const before = await sourceSnapshot(root);
  const current = await viewResources(root);
  assert.equal(current.freshness, 'current'); assert.equal(current.unavailableReason, null);
  assert.equal(current.entries.find((e) => e.revisionId === f.source.revisionId).selectionCurrent, true);
  const output = current.entries.find((e) => e.revisionId === f.output.revisionId);
  assert.equal(output.receiptId, f.receiptId); assert.equal(output.selfReview, true); assert.equal(output.reviewRequired, false);
  assert.equal(output.storageStatus, 'owned_snapshot'); assert.equal(output.kind, 'document');
  assert.equal(output.byteLength, f.output.byteLength); assert.equal(output.contentHash, f.output.contentHash); assert.equal(output.findings[0].severity, 'soft');
  await assert.rejects(viewResource(root, f.candidate.revisionId), { code: 'RESOURCE_NOT_VISIBLE' });
  assert.equal((await viewResource(root, f.output.revisionId)).contentPreview, 'synthetic approved');
  assert.deepEqual(await sourceSnapshot(root), before);
  await f.select(f.source, f.selected.selectionRevision, 'deselect');
  const stale = await viewResources(root);
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.entries.find((e) => e.revisionId === f.source.revisionId).selectionCurrent, false);
  assert.equal(stale.entries.find((e) => e.revisionId === f.output.revisionId).reviewRequired, true);
  assert.equal((await viewResource(root, f.source.revisionId)).contentPreview, 'synthetic selected');
  const replacement = await f.propose('source', 'synthetic replacement');
  const deselected = await f.store.readSourceSelection('source'); await f.select(replacement, deselected.selectionRevision);
  assert.equal((await viewResources(root)).entries.find((e) => e.revisionId === f.source.revisionId).selectionCurrent, false);
  await buildMetadataProjection(root);
  await assert.rejects(viewResource(root, f.source.revisionId), { code: 'RESOURCE_NOT_VISIBLE' });
});

test('previews have bounded escaped JSON text, while binary and unobserved external bytes stay absent', async () => {
  const root = await tempDir(); const f = await resourceFixture(root);
  const long = await f.propose('long', JSON.stringify('<script>' + 'x'.repeat(40000)), 'application/json'); await f.select(long);
  const binary = await f.propose('binary', Buffer.from([0, 255, 7]), 'image/png'); await f.select(binary);
  const external = await f.store.propose({ resourceId: 'external', kind: 'reference', external: { uri: 'https://example.invalid/synthetic' } }); await f.select(external);
  await buildMetadataProjection(root);
  const list = await viewResources(root); assert.equal(list.freshness, 'unknown'); assert.equal(list.coverage.unknown[0].revisionId, external.revisionId);
  const preview = await viewResource(root, long.revisionId);
  assert.equal(preview.contentPreview.length, 32768); assert.equal(preview.previewTruncated, true);
  assert.equal(JSON.parse(JSON.stringify(preview)).contentPreview, preview.contentPreview);
  for (const r of [binary, external]) assert.deepEqual((({ contentPreview, previewTruncated }) => ({ contentPreview, previewTruncated }))(await viewResource(root, r.revisionId)), { contentPreview: null, previewTruncated: false });
});

test('corrupt generation, retained bytes and review records remain errors', async () => {
  const root = await tempDir(); const f = await approvedFixture(root); const generation = await buildMetadataProjection(root);
  for (const [path, code] of [[join(root, '.folio', 'projections', 'metadata', generation.generationId.slice(7) + '.json'), 'PROJECTION_INTEGRITY_FAILURE'], [join(root, '.folio', 'resources', 'content', f.source.contentHash.slice(7) + '.bin'), 'RESOURCE_INTEGRITY_FAILURE'], [join(root, '.folio', 'operations', 'receipts', f.receiptId.slice(7) + '.json'), 'OPERATION_INTEGRITY_FAILURE']]) {
    const before = await readFile(path); await writeFile(path, '{}');
    await assert.rejects(viewResources(root), { code }); await assert.rejects(viewResource(root, f.output.revisionId), { code });
    await writeFile(path, before);
  }
});

test('resource-only workspace has explicit capabilities; missing work alone is the only fallback', async () => {
  const root = await tempDir(); await assert.rejects(viewerTarget(root), { code: 'WORK_NOT_FOUND' });
  const candidateRoot = await tempDir(); const candidateStore = createResourceStore(candidateRoot);
  const candidateOnly = await candidateStore.propose({ resourceId: 'unselected', kind: 'document', owned: { bytes: 'synthetic', mediaType: 'text/plain' } });
  assert.equal((await viewerTarget(candidateRoot)).mode, 'resources');
  await buildMetadataProjection(candidateRoot); assert.deepEqual((await viewResources(candidateRoot)).entries, []);
  await assert.rejects(viewResource(candidateRoot, candidateOnly.revisionId), { code: 'RESOURCE_NOT_VISIBLE' });
  await resourceFixture(root);
  assert.equal((await viewerTarget(root)).mode, 'resources');
  const work = await viewOutline(root, { packs: fakePacks() }); assert.equal(work.mode, 'resources');
  assert.deepEqual(work.capabilities, { resources: true, writing: false, viewerExport: true, viewerToggles: false });
  assert.deepEqual(work.availableScreens, ['resources', 'graph']); assert.deepEqual(work.nodes, []);
  await assert.rejects(viewerTarget(root, 'synthetic'), { code: 'NODE_NOT_FOUND' });
  await writeFile(join(root, 'work.yaml'), 'levels: []\n');
  await assert.rejects(viewerTarget(root), { code: 'CONFIG_INVALID' }); await assert.rejects(viewOutline(root, { packs: fakePacks() }), { code: 'CONFIG_INVALID' });
  const writing = await copyFixture('serial-2level'); assert.equal((await viewOutline(writing, { packs: fakePacks() })).mode, 'writing');
});

test('static resources and details share one verified generation; checkpoint changes require retry', async () => {
  const root = await tempDir(); const f = await resourceFixture(root); await buildMetadataProjection(root);
  const before = await sourceSnapshot(root);
  const snap = await buildSnapshot(root, { packs: fakePacks() });
  assert.deepEqual(snap.resources, await viewResources(root));
  assert.deepEqual(Object.keys(snap.resourceDetails), snap.resources.entries.map((e) => e.revisionId));
  assert.deepEqual(snap.resourceDetails[f.source.revisionId], await viewResource(root, f.source.revisionId));
  assert.deepEqual(await sourceSnapshot(root), before);
  await assert.rejects(withResourceViewCheckpoint(root, async (state) => {
    const data = await readResourceSnapshot(root, state);
    await f.select(f.source, f.selected.selectionRevision, 'deselect');
    return data;
  }), { code: 'RESOURCE_VIEW_CHANGED' });
});

test('actual list, detail and export reject state changes during their verified reads', async (t) => {
  const originalRead = fsPromises.readFile;
  for (const read of [viewResources, (root, f) => viewResource(root, f.source.revisionId), (root) => buildSnapshot(root, { packs: fakePacks() })]) {
    const root = await tempDir(); const f = await resourceFixture(root); const generation = await buildMetadataProjection(root);
    const path = join(root, '.folio', 'projections', 'metadata', generation.generationId.slice(7) + '.json');
    let armed = true;
    const mocked = t.mock.method(fsPromises, 'readFile', async (file, ...args) => {
      const bytes = await originalRead(file, ...args);
      if (armed && file === path) {
        armed = false;
        await f.select(f.source, f.selected.selectionRevision, 'deselect');
      }
      return bytes;
    });
    syncBuiltinESMExports();
    try { await assert.rejects(read(root, f), { code: 'RESOURCE_VIEW_CHANGED' }); }
    finally { mocked.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(armed, false);
  }
});

test('missing generation cannot mask damaged selected bytes', async () => {
  const root = await tempDir(); const f = await resourceFixture(root);
  await writeFile(join(root, '.folio', 'resources', 'content', f.source.contentHash.slice(7) + '.bin'), 'synthetic damage');
  await assert.rejects(viewResources(root), { code: 'RESOURCE_INTEGRITY_FAILURE' });
});

test('self-consistent generation hashes cannot forge the authoritative selection evidence', async () => {
  const root = await tempDir(); await resourceFixture(root); const generation = await buildMetadataProjection(root);
  const directory = join(root, '.folio', 'projections', 'metadata');
  const original = join(directory, generation.generationId.slice(7) + '.json');
  const value = JSON.parse(await readFile(original, 'utf8'));
  const { generationId: _id, ...manifest } = value.manifest;
  const entries = [];
  manifest.outputHashes = [sha256(canonicalJson(entries))];
  const generationId = sha256(canonicalJson({ manifest, entries }));
  await writeFile(join(directory, generationId.slice(7) + '.json'), canonicalJson({ manifest: { ...manifest, generationId }, entries }));
  await rm(original);
  await assert.rejects(viewResources(root), { code: 'PROJECTION_INTEGRITY_FAILURE' });
});

test('resource-only entry ignores safe interrupted immutable stages without changing or treating them as registered revisions', async () => {
  const name = '.immutable-11111111-1111-4111-8111-111111111111.tmp';
  const root = await tempDir(); await resourceFixture(root);
  const directory = join(root, '.folio', 'resources', 'revisions');
  await writeFile(join(directory, name), 'synthetic unfinished stage');
  const before = await sourceSnapshot(root);
  assert.equal((await viewerTarget(root)).mode, 'resources');
  assert.equal((await viewOutline(root, { packs: fakePacks() })).mode, 'resources');
  assert.deepEqual(await sourceSnapshot(root), before);
  const unregistered = await tempDir(); const stages = join(unregistered, '.folio', 'resources', 'revisions');
  await mkdir(stages, { recursive: true }); await writeFile(join(stages, name), 'synthetic stage');
  await assert.rejects(viewerTarget(unregistered), { code: 'WORK_NOT_FOUND' });
  await rm(join(directory, name)); await symlink(join(root, 'outside'), join(directory, name));
  await assert.rejects(viewerTarget(root), { code: 'MANAGED_PATH_UNSAFE' });
});
