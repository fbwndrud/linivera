import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from '../resources/scoped-fixture.js';
import { productionHost } from '../../examples/support/production-host.js';
test('MCP keeps episode scopes and exact old revisions across a host restart', async (t) => {
  const f = await scopedFixture(t); const host = await productionHost(f.root); t.after(() => host.close());
  const selected = await host.call('folio_inputs', { op: 'select', scopeId: 'episode-8', expectedScopeSelectionRevision: null, actor: 'user', reason: 'reuse episode-one face', bindings: [f.binding('face', f.face1, 'fixed')], ...f.definitions });
  await host.call('folio_inputs', { op: 'select', scopeId: 'episode-9', expectedScopeSelectionRevision: null, actor: 'user', reason: 'use updated face', bindings: [f.binding('face', f.face2, 'global')], ...f.definitions });
  const prepared = await host.call('folio_inputs', { op: 'prepare', version: 2, scopeId: 'episode-8', scopeSelectionRevision: selected.scopeSelectionRevision, ...f.definitions });
  await host.restart();
  assert.deepEqual((await host.call('folio_inputs', { op: 'verify', inputSnapshotId: prepared.inputSnapshotId })).manifest.revisionIds, [f.face1.revisionId]);
  assert.equal((await f.store.readSourceSelection('face')).revisionId, f.face2.revisionId);
});
