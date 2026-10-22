import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';
import { startOperation } from '../../core/operations/requests.js';
import { put } from '../../core/operations/objects.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { selectInput } from '../../core/resources/input-selections.js';

test('parser version 1 reproduces the immutable map hash recorded by PR #5', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('historical-source', { '1': { class_type: 'LoadImage', inputs: { image: 'synthetic.png' } } }, 'workflow-source');
  assert.equal(source.revisionId, 'sha256:0e13e401b4fda0b0f3f3f63d2e8026495576b2740ac2dffc045ea8d093c84beb');
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'historical-map', sourceRevisionId: source.revisionId,
    format: 'comfy-api', parserVersion: 1, structureBindings: [] });
  assert.equal(map.revisionId, 'sha256:c807ac15ce098b620e81ac65be4f4d515d4bb56f1fe6653cfe1ec32910726924');
  assert.equal(map.contentHash, 'sha256:b4ff2113f8db30ac7eb4dfbf823bcbd814643d6684d964fde773d44bb3722286');
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'comfy-api', parserVersion: 9 }), { code: 'STRUCTURE_INVALID' });
});

test('historical structure input verifies and an already started operation retries, while new work cannot downgrade its parser', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('workflow', { '1': { class_type: 'SyntheticCustom', inputs: {} } }, 'workflow-source');
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: 'comfy-api', parserVersion: 1, structureBindings: [] });
  const scope = ['workflow', 'map'];
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 100000 }], ['policy', { version: 1, scope, allowedActions: ['select-source', 'create-candidate'] }]]) {
    const r = await f.resource(kind, value, kind); await f.select(r); f.definitions[kind + 'RevisionId'] = r.revisionId;
  }
  await f.select(source); await f.select(map);
  const input = await prepareInput(f.root, { revisionIds: [map.revisionId], ...f.definitions });
  assert.deepEqual((await verifyInput(f.root, input.inputSnapshotId)).manifest, input.manifest);
  await assert.rejects(startOperation(f.root, { inputSnapshotId: input.inputSnapshotId, actor: 'user', idempotencyKey: 'new-from-v1' }), { code: 'STRUCTURE_PARSER_UPGRADE_REQUIRED' });
  const selection = await selectInput(f.root, { scopeId: 'historical-scope', expectedScopeSelectionRevision: null, actor: 'user', reason: 'Synthetic fixed revisions',
    bindings: [map, source].map((r) => f.binding(r.resourceId, r, 'fixed')), ...f.definitions });
  const scoped = await prepareInput(f.root, { version: 2, scopeId: 'historical-scope', scopeSelectionRevision: selection.scopeSelectionRevision, bindingKeys: ['map'], ...f.definitions });
  await assert.rejects(startOperation(f.root, { inputSnapshotId: scoped.inputSnapshotId, actor: 'user', idempotencyKey: 'v2-from-v1-map' }), { code: 'STRUCTURE_PARSER_UPGRADE_REQUIRED' });
  // Synthetic pre-upgrade request fixture; retries cross the same public operation interface.
  const old = { inputSnapshotId: input.inputSnapshotId, actor: 'user', idempotencyKey: 'already-started' };
  const operationId = sha256(canonicalJson({ idempotencyKey: old.idempotencyKey })); const requestId = sha256(canonicalJson(old));
  await put(f.root, 'requests', { ...old, operationId, requestId }, operationId);
  assert.deepEqual(await startOperation(f.root, old), { operationId, requestId });
});
