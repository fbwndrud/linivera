import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** Synthetic host uses the public stdio protocol, including after restart. */
export async function productionHost(root) {
  let client;
  async function connect() {
    client = new Client({ name: 'synthetic-production-host', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [join(import.meta.dirname, '../../bin/folio-mcp.js')], stderr: 'pipe' }));
  }
  await connect();
  const selections = new Map(); const definitions = {};
  async function call(name, args) {
    const response = await client.callTool({ name, arguments: { root, ...args } });
    const body = JSON.parse(response.content[0].text);
    assert.ok(!response.isError, JSON.stringify(body)); return body;
  }
  const graph = () => call('folio_resource_query', { op: 'graph' });
  const json = (resourceId, value, kind = 'synthetic', parents = []) => call('folio_resources', {
    op: 'propose', resourceId, kind, parents, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
  const read = async (revisionId) => (await call('folio_resources', { op: 'read', revisionId })).revision;
  async function select(resource) {
    const result = await call('folio_resources', { op: 'decideSource', revisionId: resource.revisionId,
      expectedSelectionRevision: selections.get(resource.resourceId) ?? null, action: { actor: 'user', type: 'select' } });
    selections.set(resource.resourceId, result.selectionRevision);
  }
  const input = (refs) => call('folio_inputs', { op: 'prepare', ...definitions, revisionIds: refs.map((r) => r.revisionId) });
  async function approve(operationId, revisionId) {
    const resource = await read(revisionId);
    const receiptId = await call('folio_operations', { op: 'review', operationId,
      outputHashes: [resource.contentHash], findings: [], reviewer: 'host' });
    await call('folio_operations', { op: 'decide', operationId, receiptId, actor: 'user', action: 'approve', expectedCheckpoint: (await graph()).checkpoint });
    await select(resource); return resource;
  }
  return { call, graph, json, read, select, input, approve, definitions,
    async restart() { await client.close(); await connect(); }, close: () => client.close() };
}
