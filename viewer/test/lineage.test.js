import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStaticApi } from '../src/lib/static-api.js';
let server, ResourceLineageContent, Provider;
before(async () => {
  server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom' });
  ({ ResourceLineageContent } = await server.ssrLoadModule('/src/components/ResourceLineage.jsx'));
  ({ I18nProvider: Provider } = await server.ssrLoadModule('/src/i18n/context.jsx'));
});
test('resource lineage follows the Studio language while preserving authored resource IDs', () => {
  const data = { nodes: [{ id: 'pose', type: 'resource', resourceId: 'Authored pose', revisionId: 'sha256:pose', states: ['approved'], reviewRequired: true }], edges: [], checkpoint: { seq: 1 }, truncated: true };
  const html = renderToStaticMarkup(React.createElement(Provider, { initialLocale: 'ko' }, React.createElement(ResourceLineageContent, { data })));
  for (const text of ['자산 이력', '재검토 필요', '부분 그래프', 'Authored pose', 'sha256:pose']) assert.ok(html.includes(text), text);
});
after(async () => { await server?.close(); });
test('lineage distinguishes candidates, submitted results and review impact and escapes source labels', async () => {
  const nodes = [
    { id: 'source', type: 'resource', resourceId: '<script>source</script>', revisionId: 'sha256:source', states: ['source'] },
    { id: 'candidate', type: 'resource', resourceId: 'pose', revisionId: 'sha256:candidate', states: ['candidate'] },
    { id: 'submitted', type: 'resource', resourceId: 'shot', revisionId: 'sha256:shot', states: ['submitted'] },
    { id: 'approved', type: 'resource', resourceId: 'film', revisionId: 'sha256:film', states: ['approved'], reviewRequired: true },
  ];
  const data = { nodes, edges: [], checkpoint: { seq: 12 }, truncated: true };
  const html = renderToStaticMarkup(React.createElement(ResourceLineageContent, { data }));
  for (const text of ['candidate', 'submitted', 'approved', 'Review needed', 'Partial graph', 'sha256:film']) assert.ok(html.includes(text));
  assert.match(html, /&lt;script&gt;source&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.deepEqual(await createStaticApi({ resourceGraph: data }).get('/api/resource-graph'), data);
  await assert.rejects(createStaticApi({}).get('/api/resource-graph'), { code: 'STATIC_UNAVAILABLE' });
});

test('one history view distinguishes media families, episode choices and causal versus usage connections', () => {
  const data = { nodes: [
    { id: 'model', type: 'resource', resourceId: 'Authored model', revisionId: 'sha256:model', family: 'model', states: ['candidate'], scopedSelections: [{ scopeId: 'main/8', role: 'face', mode: 'fixed' }] },
    { id: 'context', type: 'resource', resourceId: 'episode context', revisionId: 'sha256:context', family: 'context', states: ['scoped-source'] },
    { id: 'bundle', type: 'resource', resourceId: 'model package', revisionId: 'sha256:bundle', family: 'bundle', states: ['observed-output'] },
  ], edges: [{ id: 'usage', source: 'context', target: 'model', kind: 'usage' }, { id: 'contains', source: 'bundle', target: 'model', kind: 'contains' }],
  checkpoint: { seq: 3 }, coverage: { contentVerification: 'verified', executionHeads: [] }, truncated: false };
  const html = renderToStaticMarkup(React.createElement(ResourceLineageContent, { data }));
  for (const text of ['3D model', 'Used in context', 'Included file', 'Episode selection', 'main/8']) assert.ok(html.includes(text), text);
  const korean = renderToStaticMarkup(React.createElement(Provider, { initialLocale: 'ko' }, React.createElement(ResourceLineageContent, { data })));
  for (const text of ['3D 모델', '사용 맥락', '포함 파일', '회차 선택', 'Authored model']) assert.ok(korean.includes(text), text);
  assert.deepEqual(data.nodes[0].resourceId, 'Authored model');
});
