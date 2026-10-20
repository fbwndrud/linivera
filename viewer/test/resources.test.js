import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let server, ResourcesContent;
before(async () => {
  server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom' });
  ({ ResourcesContent } = await server.ssrLoadModule('/src/screens/Resources.jsx'));
});
after(async () => { await server?.close(); });
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const checkpoint = { seq: 5, hash: 'sha256:synthetic-checkpoint' };
const source = { resourceId: 'reference-notes', revisionId: 'sha256:synthetic-source', kind: 'document', storageStatus: 'owned_snapshot', role: 'source', selectionCurrent: true, contentHash: 'sha256:synthetic-content' };
const fixture = (overrides = {}) => ({ entries: [source], checkpoint, currentCheckpoint: checkpoint, freshness: 'current', unavailableReason: null, coverage: { layers: ['metadata'], resourceIds: ['reference-notes'], missing: [], unknown: [], returnedRevisionIds: [source.revisionId] }, ...overrides });

test('resource list distinguishes complete, not indexed, partial, stale and unknown views', () => {
  const current = render(ResourcesContent, { data: fixture() });
  assert.match(current, /Complete list/); assert.match(current, /Selected source/); assert.match(current, /Reference notes/);
  assert.match(current, /#\/resource\/sha256%3Asynthetic-source/);
  const missing = render(ResourcesContent, { data: fixture({ entries: [], unavailableReason: 'not-indexed', freshness: 'unknown', checkpoint: null }) });
  assert.match(missing, /Not indexed/); assert.doesNotMatch(missing, /Complete list/);
  assert.match(render(ResourcesContent, { data: fixture({ freshness: 'stale' }) }), /Older list/);
  assert.match(render(ResourcesContent, { data: fixture({ coverage: { missing: ['synthetic'], unknown: [] } }) }), /Partial list/);
  const external = { ...source, storageStatus: 'external_unobserved', external: { uri: 'https://example.invalid/synthetic' } };
  const unknown = render(ResourcesContent, { data: fixture({ entries: [external], freshness: 'unknown', coverage: { missing: [], unknown: [{ revisionId: source.revisionId }] } }) });
  assert.match(unknown, /External content not observed/); assert.doesNotMatch(unknown, /href="https:/);
  assert.match(render(ResourcesContent, { data: fixture({ entries: [] }) }), /No selected sources or approved results/);
});

test('detail retains every source and approval context and escapes the preview as text', async () => {
  const { ResourceContent } = await server.ssrLoadModule('/src/screens/Resources.jsx');
  const outputs = [1, 2].map((n) => ({ ...source, role: 'output', operationId: `operation-${n}`, receiptId: `review-${n}`, selfReview: true, reviewRequired: n === 2, reviewReasons: ['source-changed'], findings: [{ severity: 'soft', message: '<script>synthetic suggestion</script>' }] }));
  const entries = [{ ...source, selectionCurrent: false }, ...outputs];
  const data = fixture({ entries });
  const detail = { entry: entries[0], contentPreview: '<script>synthetic preview</script>', previewTruncated: true };
  const html = render(ResourceContent, { data, detail });
  assert.match(html, /Previously selected source/); assert.equal((html.match(/Approved result/g) ?? []).length, 2);
  assert.match(html, /Review needed/); assert.match(html, /Self-review/);
  for (const text of ['operation-1', 'operation-2', 'review-1', 'review-2']) assert.match(html, new RegExp(text));
  assert.match(html, /&lt;script&gt;synthetic preview&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Showing the beginning only/);
  assert.match(render(ResourceContent, { data, detail: { ...detail, contentPreview: null } }), /No text preview/);
  const list = render(ResourcesContent, { data });
  assert.equal((list.match(/#\/resource\//g) ?? []).length, 1); assert.match(list, /Review needed/);
});

test('direct detail loading keeps all list contexts in static exports and refuses missing exports', async () => {
  const { createStaticApi } = await import('../src/lib/static-api.js');
  const { loadResourceDetail } = await import('../src/lib/resource-detail.js');
  const entries = [source, { ...source, role: 'output', receiptId: 'synthetic-review', operationId: 'synthetic-operation', selfReview: true, reviewRequired: true }];
  const data = fixture({ entries });
  const detail = { entry: source, contentPreview: 'synthetic', previewTruncated: false };
  const result = await loadResourceDetail(createStaticApi({ resources: data, resourceDetails: { [source.revisionId]: detail } }), source.revisionId);
  assert.equal(result.data.entries.length, 2); assert.equal(result.detail.contentPreview, 'synthetic');
  await assert.rejects(loadResourceDetail(createStaticApi({}), source.revisionId), { code: 'STATIC_UNAVAILABLE' });
  await assert.rejects(loadResourceDetail(createStaticApi({ resources: data, resourceDetails: {} }), source.revisionId), { code: 'RESOURCE_NOT_VISIBLE' });
  await assert.rejects(loadResourceDetail(createStaticApi({ resources: data, resourceDetails: { [source.revisionId]: { ...detail, entry: { ...source, selectionCurrent: false } } } }), source.revisionId), { code: 'RESOURCE_VIEW_CHANGED' });
});

test('resources routes and resource-only navigation hide writing pages and preserve writing navigation', async () => {
  const { parseRoute, hrefFor } = await import('../src/lib/route.js');
  const { workspaceNavigation, navGroup, writingScreenUnavailable } = await import('../src/lib/workspace.js');
  assert.deepEqual(parseRoute('#/resources'), { screen: 'resources', id: null });
  assert.deepEqual(parseRoute(hrefFor('resource', source.revisionId)), { screen: 'resource', id: source.revisionId });
  assert.equal(navGroup('resource').name, 'Library');
  const resourceWork = { mode: 'resources', capabilities: { writing: false } };
  const nav = workspaceNavigation(resourceWork);
  assert.deepEqual(nav.map((group) => [group.name, group.screen, group.items]), [['Library', 'resources', [['resources', 'Resources'], ['graph', 'Connections'], ['examples', 'Examples']]]]);
  assert.equal(writingScreenUnavailable(resourceWork, 'examples'), false);
  assert.equal(writingScreenUnavailable(resourceWork, 'graph'), false);
  assert.equal(writingScreenUnavailable(resourceWork, 'read'), true);
  assert.equal(writingScreenUnavailable(resourceWork, 'stages'), true);
  assert.equal(writingScreenUnavailable(resourceWork, 'home'), false);
  assert.equal(writingScreenUnavailable(resourceWork, 'resource'), false);
  const writing = workspaceNavigation({ mode: 'writing' });
  assert.deepEqual(writing.map((group) => group.name), ['Manuscript', 'Review', 'Publish', 'Library', 'Settings']);
  assert.ok(writing[3].items.some(([screen]) => screen === 'resources'));
  assert.equal(writingScreenUnavailable({ mode: 'writing' }, 'read'), false);
});

test('actual HTTP and exported detail preserve a selected revision with two approved operations', async (t) => {
  const { approvedFixture } = await import('../../test/support/view-resources.js');
  const { tempDir, fakePacks, fixturePath } = await import('../../test/support/fixtures.js');
  const { buildMetadataProjection } = await import('../../core/projections/metadata.js');
  const { viewResources } = await import('../../core/view/resources.js');
  const { startOperation, submitResult } = await import('../../core/operations/requests.js');
  const { recordReview, decidePublication } = await import('../../core/operations/publications.js');
  const { readWorkspaceState } = await import('../../core/publications/state.js');
  const { startViewServer } = await import('../../server/view/http-server.js');
  const { createStaticApi } = await import('../src/lib/static-api.js');
  const { createApi } = await import('../src/lib/api.js');
  const { loadResourceDetail } = await import('../src/lib/resource-detail.js');
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const root = await tempDir();
  const f = await approvedFixture(root);
  await buildMetadataProjection(root);
  const initial = (await viewResources(root)).entries.find((entry) => entry.role === 'output');
  const operation = await startOperation(root, { inputSnapshotId: initial.inputSnapshotId, actor: 'user', idempotencyKey: 'synthetic-second-approval' });
  const result = await submitResult(root, { ...operation, inputSnapshotId: initial.inputSnapshotId, resultRevisionIds: [f.output.revisionId] });
  const receiptId = await recordReview(root, { operationId: operation.operationId, reviewer: 'host', outputHashes: result.outputs.map((entry) => entry.contentHash), findings: [{ severity: 'soft', message: 'synthetic second suggestion' }] });
  await decidePublication(root, { operationId: operation.operationId, receiptId, action: 'approve', actor: 'user', expectedCheckpoint: (await readWorkspaceState(root)).checkpoint });
  await f.select(f.output);
  await f.select(f.source, f.selected.selectionRevision, 'deselect');
  await buildMetadataProjection(root);
  const http = await startViewServer({ root, packs: fakePacks(), distDir: fixturePath('viewer-dist'), onError: () => {} });
  t.after(() => http.close());
  const api = createApi({ token: http.token, fetchImpl: (path, options) => fetch(new URL(path, http.url), options) });
  const live = await loadResourceDetail(api, f.output.revisionId);
  const contexts = live.data.entries.filter((entry) => entry.revisionId === f.output.revisionId);
  assert.equal(contexts.length, 3); assert.equal(contexts.filter((entry) => entry.role === 'output' && entry.reviewRequired).length, 2);
  assert.equal(live.data.freshness, 'current'); assert.deepEqual(live.detail.entry, contexts[0]);
  const { ResourceContent } = await server.ssrLoadModule('/src/screens/Resources.jsx');
  const html = render(ResourceContent, live);
  for (const id of [initial.operationId, operation.operationId, f.receiptId, receiptId]) assert.ok(html.includes(id));
  assert.match(html, /Selected source/); assert.equal((html.match(/Approved result/g) ?? []).length, 2);
  assert.match(html, /Review needed/);
  await api.post('/api/export', {});
  const exported = await readFile(join(root, 'exports', 'viewer', 'index.html'), 'utf8');
  const snapshot = JSON.parse(exported.match(/<script type="application\/json" id="folio-data">([\s\S]*?)<\/script>/)[1]);
  const staticDetail = await loadResourceDetail(createStaticApi(snapshot), f.output.revisionId);
  assert.equal(render(ResourceContent, staticDetail), html);
});

test('resource read errors explain damage, retry and static unavailability without approval controls', async () => {
  const { LoadState } = await server.ssrLoadModule('/src/components/Status.jsx');
  for (const [code, text] of [['RESOURCE_INTEGRITY_FAILURE', /could not be verified/], ['PROJECTION_INTEGRITY_FAILURE', /could not be verified/], ['OPERATION_INTEGRITY_FAILURE', /could not be verified/], ['RESOURCE_VIEW_CHANGED', /Retry/], ['STATIC_UNAVAILABLE', /not included in this exported view/], ['HTTP_ERROR', /could not be completed/]]) {
    const html = render(LoadState, { state: { loading: false, error: { code, message: '<script>synthetic diagnostic</script>' } } });
    assert.match(html, text); assert.match(html, /role="alert"/); assert.match(html, /Technical details/);
    assert.doesNotMatch(html, /<script>/); assert.doesNotMatch(html, /<button/);
  }
  const { Screen } = await server.ssrLoadModule('/src/App.jsx');
  const html = render(Screen, { route: { screen: 'stages', id: null }, outline: { data: { mode: 'resources' } } });
  assert.match(html, /Writing pages unavailable/); assert.doesNotMatch(html, /Writing steps|Reading settings/);
});

test('a new approval during preview loading requires retry even when the first entry is unchanged', async () => {
  const { loadResourceDetail } = await import('../src/lib/resource-detail.js');
  let listReads = 0;
  const api = { get: async (path) => path === '/api/resources'
    ? fixture({ currentCheckpoint: { seq: ++listReads, hash: `synthetic-${listReads}` }, entries: listReads === 1 ? [source] : [source, { ...source, role: 'output', receiptId: 'synthetic-new-review' }] })
    : { entry: source, contentPreview: 'synthetic', previewTruncated: false } };
  await assert.rejects(loadResourceDetail(api, source.revisionId), { code: 'RESOURCE_VIEW_CHANGED' });
});
