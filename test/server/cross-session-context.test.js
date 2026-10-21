import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../context/fixture.js';
import { connectFolio } from '../support/mcp-client.js';

test('a new MCP session previews scoped knowledge then pins actual source closure with a separate user selection', async (t) => {
  const f = await fixture(t); let folio = await connectFolio();
  t.after(() => folio.close());
  const call = async (name, args) => {
    const response = await folio.call(name, { root: f.root, ...args });
    assert.equal(response.ok, true, JSON.stringify(response)); return response.result;
  };
  const select = (revision) => call('folio_resources', { op: 'decideSource', revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
  const first = await f.text('face', 'Synthetic exact face'); const excluded = await f.text('other-event', 'Another event exceeds the item budget');
  const context = await f.json('context', 'usage-context', { version: 1, scopeId: 'episode-eight', pathId: 'river', states: [first, excluded].map((revision) => ({
    role: revision.resourceId, status: 'selected', artifactRevisionId: revision.revisionId, evidenceRevisionIds: [],
  })) });
  const definitions = {};
  for (const [kind, value] of [['profile', { version: 1, scope: ['face', 'other-event', 'context', 'knowledge'], maxInputBytes: 100000 }],
    ['pipeline', { version: 1, steps: [{ id: 'continue', capability: 'transform' }] }],
    ['policy', { version: 1, scope: ['face', 'other-event', 'context', 'knowledge'], allowedActions: ['create-candidate', 'select-source'] }]]) {
    const revision = await f.json(kind, kind, value); await select(revision); definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  await call('folio_inputs', { op: 'select', scopeId: 'episode-eight', expectedScopeSelectionRevision: null, actor: 'user', reason: 'continue river path', ...definitions,
    bindings: [{ bindingKey: 'context', role: 'context', resourceId: context.resourceId, revisionId: context.revisionId, mode: 'fixed' }] });
  await folio.close(); folio = await connectFolio();
  const preview = await call('folio_resource_query', { op: 'context', scopeId: 'episode-eight', purpose: 'next scene', pathId: 'river',
    budget: { maxTextBytes: 100, maxItems: 1, maxManifestBytes: 4000 } });
  assert.equal(preview.package.items[0].text, 'Synthetic exact face');
  assert.ok(preview.coverage.truncated.some((entry) => entry.revisionId === excluded.revisionId));
  const knowledge = await call('folio_resources', { op: 'propose', resourceId: 'knowledge', kind: 'context-package', owned: { bytes: JSON.stringify(preview.package), mediaType: 'application/json' } });
  const attempt = await folio.call('folio_inputs', { root: f.root, op: 'prepare', revisionIds: [knowledge.revisionId], ...definitions });
  assert.equal(attempt.ok, false); assert.equal(attempt.error.code, 'INPUT_INVALID');
  await select(knowledge);
  const unselectedSource = await folio.call('folio_inputs', { root: f.root, op: 'prepare', revisionIds: [knowledge.revisionId], ...definitions });
  assert.equal(unselectedSource.ok, false); assert.equal(unselectedSource.error.code, 'INPUT_INVALID');
  await select(first);
  const input = await call('folio_inputs', { op: 'prepare', revisionIds: [knowledge.revisionId], ...definitions });
  assert.equal(input.manifest.referenceClosureVersion, 1);
  assert.deepEqual(new Set(input.manifest.resources.map((item) => item.revisionId)), new Set([knowledge.revisionId, first.revisionId]));
  assert.ok(!input.manifest.resources.some((item) => item.revisionId === context.revisionId || item.revisionId === excluded.revisionId));
  assert.equal(input.manifest.resources.find((item) => item.revisionId === first.revisionId).byteLength, Buffer.byteLength('Synthetic exact face'));
  assert.deepEqual((await call('folio_inputs', { op: 'verify', inputSnapshotId: input.inputSnapshotId })).manifest, input.manifest);
  const operation = await call('folio_operations', { op: 'start', inputSnapshotId: input.inputSnapshotId, idempotencyKey: 'next-scene-with-context', actor: 'user' });
  assert.ok(operation.operationId.startsWith('sha256:'));
});
