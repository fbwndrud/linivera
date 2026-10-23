import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from '../resources/scoped-fixture.js';
import { connectFolio } from '../support/mcp-client.js';

test('XML within the sibling budget responds through MCP without repeatedly rescanning preceding tags', { timeout: 15000 }, async (t) => {
  const f = await scopedFixture(t); const folio = await connectFolio(); t.after(() => folio.close());
  const xml = `<xmeml version="5">${'<meta/>'.repeat(32000)}<sequence><name>Synthetic large metadata</name><rate><timebase>24</timebase></rate></sequence></xmeml>`;
  const source = await f.resource('many-siblings', xml);
  const response = await folio.client.callTool({ name: 'folio_resources', arguments: { root: f.root, op: 'inspectStructure', revisionId: source.revisionId, format: 'xmeml' } }, undefined, { timeout: 5000 });
  assert.ok(!response.isError, JSON.stringify(response.content));
  const value = JSON.parse(response.content[0].text);
  assert.equal(value.structure.units[0].id, '/xmeml/sequence/0');
});
