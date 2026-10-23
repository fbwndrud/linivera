import assert from 'node:assert/strict';
import { syntheticDownloads, syntheticRecords } from './synthetic-chroma.js';

/**
 * Each change selects a new revision of one upstream resource. The two later results must name that
 * resource as a direct or inherited review reason; nothing is rewritten automatically.
 */
export async function chromaChanges(host, s, { outputs, intermediates, unaffected }) {
  const { call, select } = host; const propagated = {};
  const performance = syntheticRecords().performance; performance.details.metrics[0].value = 125;
  const minimax = syntheticDownloads().minimax; minimax.base_resp.status_msg = 'synthetic re-query';
  const declaration = syntheticDownloads()['response-contract']; declaration.schemaVersion = 'fixture-v2';
  const spec = await call('folio_resource_query', { op: 'specification', capabilityId: 'fal-flux-schnell-v1' });
  const access = await call('folio_resource_query', { op: 'accessSpecification', accessId: 'meshy-preview-api-v1' });
  const connection = await s.readJson('official-check');
  connection.checks = connection.checks.map((row) => row.kind === 'credits' ? { ...row, status: 'blocked', reasonCode: 'credits-insufficient' } : row);
  const changes = [
    ['access-specification', 'official-access', { bytes: JSON.stringify(access), mediaType: 'application/json' }],
    ['connection-check', 'official-check', { bytes: JSON.stringify(connection), mediaType: 'application/json' }],
    ['input-specification', 'capability-spec', { bytes: JSON.stringify(spec), mediaType: 'application/json' }],
    ['provider-declaration', 'response-contract', { bytes: JSON.stringify(declaration), mediaType: 'application/json' }],
    ['provider-raw', 'minimax', { bytes: JSON.stringify(minimax), mediaType: 'application/json' }],
    ['editing-dependency', 'provider-video', { base64: Buffer.from('synthetic opaque provider video v2').toString('base64'), mediaType: 'application/octet-stream' }],
    ['project-external-state', 'db-snapshot', { bytes: JSON.stringify({ rows: [{ id: 1, label: 'Synthetic flooded harbor' }] }), mediaType: 'application/json' }],
    ['rights-evidence', 'rights-proof', { bytes: 'synthetic rights report: distribution revoked', mediaType: 'text/plain' }],
    ['performance', 'performance', { bytes: JSON.stringify(performance), mediaType: 'application/json' }],
  ];
  for (const [label, resourceId, owned] of changes) {
    const previous = s.resources.get(resourceId);
    const revision = await call('folio_resources', { op: 'propose', resourceId, kind: previous.kind, parents: [previous.revisionId], owned });
    await select(revision);
    await call('folio_resource_query', { op: 'refresh' });
    const query = await call('folio_resource_query', { op: 'query' });
    const reasons = (id) => query.entries.find((entry) => entry.role === 'output' && entry.revisionId === s.resources.get(id).revisionId)?.reviewReasons ?? [];
    for (const id of [...outputs, ...(intermediates[resourceId] ?? [])]) {
      const reason = reasons(id).find((r) => r.resourceId === resourceId && r.inputRevisionId === previous.revisionId && r.currentRevisionId === revision.revisionId);
      assert.ok(reason, `${label} must require review of ${id}`);
    }
    for (const id of unaffected[resourceId] ?? []) assert.ok(!reasons(id).some((r) => r.resourceId === resourceId), `${label} must not touch ${id}`);
    propagated[label] = true;
  }
  const graph = await host.graph();
  for (const id of outputs) assert.equal(graph.nodes.find((n) => n.revisionId === s.resources.get(id).revisionId).reviewRequired, true);
  return { reviewPropagation: propagated };
}
