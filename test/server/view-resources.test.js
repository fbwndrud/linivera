import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { join } from 'node:path';
import fsPromises, { mkdir, readFile, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { startViewServer } from '../../server/view/http-server.js';
import { createViewerRegistry } from '../../server/view/registry.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { sourceSnapshot } from '../support/export-work.js';
import { resourceFixture } from '../support/view-resources.js';
import { tempDir, fakePacks, fixturePath, copyFixture } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

const DIST = fixturePath('viewer-dist');
async function serve(t, root) {
  const server = await startViewServer({ root, packs: fakePacks(), distDir: DIST, onError: () => {} });
  t.after(() => server.close());
  const call = async (path, options = {}) => {
    const res = await fetch(new URL(path, server.url), { ...options, headers: { 'x-folio-token': server.token, ...options.headers } });
    return { status: res.status, json: await res.json() };
  };
  return { server, call };
}
const raw = (server, path, headers = {}) => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: server.port, path, headers: { 'x-folio-token': server.token, ...headers } }, (res) => {
    let text = ''; res.on('data', (chunk) => { text += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }));
  }); req.on('error', reject); req.end();
});

test('resource-only viewer starts through the registry and uses the authenticated fixed root', async (t) => {
  const root = await tempDir(); const f = await resourceFixture(root); await buildMetadataProjection(root);
  const other = await tempDir(); const otherFixture = await resourceFixture(other);
  const extra = await otherFixture.propose('outside', 'synthetic outside'); await otherFixture.select(extra); await buildMetadataProjection(other);
  const registry = createViewerRegistry({ packs: fakePacks(), distDir: DIST }); t.after(() => registry.closeAll());
  const opened = await registry.open(root); assert.equal(opened.status, 'ready');
  const { server, call } = await serve(t, root);
  await mkdir(join(root, '.folio', 'tx'), { recursive: true }); await writeFile(join(root, '.folio', 'tx', 'journal.json'), '{}');
  const before = await sourceSnapshot(root);
  const work = await call('/api/work'); assert.equal(work.json.mode, 'resources');
  const graph = await call('/api/resource-graph'); assert.equal(graph.status, 200); assert.ok(graph.json.nodes.some((n) => n.revisionId === f.source.revisionId));
  assert.ok(!graph.json.nodes.some((n) => n.revisionId === extra.revisionId));
  assert.equal((await call('/api/resource-graph', { headers: { 'x-folio-token': '' } })).status, 401);
  const list = await call('/api/resources'); assert.equal(list.status, 200); assert.equal(list.json.entries.length, 1);
  const detail = await call(`/api/resources/${encodeURIComponent(f.source.revisionId)}`); assert.equal(detail.json.contentPreview, 'synthetic selected');
  assert.equal((await call(`/api/resources/${extra.revisionId}?root=${encodeURIComponent(other)}`)).json.error.code, 'RESOURCE_NOT_VISIBLE');
  assert.equal((await call('/api/resources', { headers: { 'x-folio-token': '' } })).status, 401);
  assert.equal((await raw(server, '/api/resources', { host: `evil.example:${server.port}` })).status, 421);
  assert.equal((await call('/api/resources', { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'application/json' }, body: '{}' })).json.error.code, 'ORIGIN_NOT_ALLOWED');
  assert.equal((await call('/api/resources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ root: other }) })).status, 405);
  assert.deepEqual(await sourceSnapshot(root), before);
});

test('resource revision routes reject invalid encoding, paths and hashes; invisible candidates are 404', async (t) => {
  const root = await tempDir(); const f = await resourceFixture(root); await buildMetadataProjection(root);
  const { server, call } = await serve(t, root);
  for (const path of ['/api/resources/%E0%A4%A', '/api/resources/a%2Fb', '/api/resources/a%5Cb', '/api/resources/%00', '/api/resources/' + 'x'.repeat(201)]) assert.equal((await raw(server, path)).json.error.code, 'ROUTE_INVALID', path);
  assert.equal((await call('/api/resources/not-a-hash')).json.error.code, 'RESOURCE_REVISION_INVALID');
  assert.equal((await call(`/api/resources/${f.candidate.revisionId}`)).status, 404);
  assert.equal((await call('/api/resources')).json.coverage.returnedRevisionIds[0], f.source.revisionId);
});

test('resource routes retain writing viewer shutdown behavior and configuration errors', async (t) => {
  const root = await copyFixture('serial-2level'); await resourceFixture(root); await buildMetadataProjection(root);
  const { call } = await serve(t, root);
  assert.equal((await call('/api/work')).json.mode, 'writing'); assert.equal((await call('/api/resources')).status, 200);
  await editYaml(root, (config) => { config.features = { viewer: false }; });
  const off = await call('/api/resources'); assert.deepEqual([off.status, off.json.error.code], [403, 'FEATURE_DISABLED']);
  const broken = await tempDir(); await resourceFixture(broken); await writeFile(join(broken, 'work.yaml'), 'levels: []\n');
  const second = await serve(t, broken); assert.equal((await second.call('/api/work')).json.error.code, 'CONFIG_INVALID');
});

test('static export carries verified resource list and escaped allowed previews without creating approvals', async (t) => {
  const root = await tempDir(); const f = await resourceFixture(root);
  const script = await f.propose('script', '</script><script>synthetic</script>'); await f.select(script);
  await buildMetadataProjection(root); const before = await sourceSnapshot(root);
  const { call } = await serve(t, root);
  const exported = await call('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(exported.status, 200);
  const html = await readFile(join(root, 'exports', 'viewer', 'index.html'), 'utf8');
  const snapshot = JSON.parse(html.match(/<script type="application\/json" id="folio-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(snapshot.work.mode, 'resources'); assert.equal(snapshot.resources.entries.length, 2);
  assert.equal(snapshot.resourceDetails[script.revisionId].contentPreview, '</script><script>synthetic</script>');
  assert.doesNotMatch(html, /<script>synthetic<\/script>/);
  assert.deepEqual(snapshot.assetFiles, {});
  const after = await sourceSnapshot(root);
  for (const path of Object.keys(after)) if (path.startsWith('exports/')) delete after[path];
  assert.deepEqual(after, before);
});


test('changed resource reads ask HTTP clients to retry and refuse export before creating files', async (t) => {
  const originalRead = fsPromises.readFile;
  for (const method of ['GET', 'POST']) {
    const root = await tempDir(); const f = await resourceFixture(root); const generation = await buildMetadataProjection(root);
    const path = join(root, '.folio', 'projections', 'metadata', generation.generationId.slice(7) + '.json');
    const { call } = await serve(t, root);
    let armed = true;
    const mocked = t.mock.method(fsPromises, 'readFile', async (file, ...args) => {
      const bytes = await originalRead(file, ...args);
      if (armed && file === path) { armed = false; await f.select(f.source, f.selected.selectionRevision, 'deselect'); }
      return bytes;
    });
    syncBuiltinESMExports();
    try {
      const out = await call(method === 'GET' ? '/api/resources' : '/api/export', method === 'GET' ? {} : { method, headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.deepEqual([out.status, out.json.error.code], [409, 'RESOURCE_VIEW_CHANGED']);
    } finally { mocked.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(armed, false);
    await assert.rejects(readFile(join(root, 'exports', 'viewer', 'index.html')), { code: 'ENOENT' });
  }
});
