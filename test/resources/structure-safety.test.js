import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { resourceObjectPath } from '../../core/resources/files.js';
import { selectInput } from '../../core/resources/input-selections.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';

test('typed structure references cannot conceal context from another story path', async (t) => {
  const f = await scopedFixture(t);
  const foreign = await f.resource('foreign', { version: 1, scopeId: 'episode', pathId: 'mountain', states: [] }, 'usage-context');
  const source = await f.resource('srt', '1\n00:00:00,000 --> 00:00:01,000\nSynthetic cue');
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: 'srt', structureBindings: [{ referenceKey: 'media', revisionId: foreign.revisionId }] });
  await assert.rejects(f.resource('river', { version: 1, scopeId: 'episode', pathId: 'river', states: [
    { role: 'caption', status: 'selected', artifactRevisionId: map.revisionId, evidenceRevisionIds: [] },
  ] }, 'usage-context'), { code: 'CONTEXT_SCOPE_MISMATCH' });
});

test('scoped fixed inputs retain every exact structure dependency and verify historically', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('srt', '1\n00:00:00,000 --> 00:00:01,000\nSynthetic cue');
  const audio = await f.store.propose({ resourceId: 'audio', kind: 'audio', owned: { bytes: Buffer.alloc(100), mediaType: 'audio/wav' } });
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: 'srt', structureBindings: [{ referenceKey: 'media', revisionId: audio.revisionId }] });
  for (const [kind, value] of [['profile', { version: 1, scope: ['srt', 'audio', 'map'], maxInputBytes: 100000 }],
    ['policy', { version: 1, scope: ['srt', 'audio', 'map'], allowedActions: ['select-source', 'create-candidate'] }]]) {
    const r = await f.resource(kind, value, kind); await f.select(r); f.definitions[kind + 'RevisionId'] = r.revisionId;
  }
  const selection = await selectInput(f.root, { scopeId: 'episode', expectedScopeSelectionRevision: null, actor: 'user', reason: 'Synthetic fixed episode inputs',
    bindings: [map, source, audio].map((r) => f.binding(r.resourceId, r, 'fixed')), ...f.definitions });
  const input = await prepareInput(f.root, { version: 2, scopeId: 'episode', scopeSelectionRevision: selection.scopeSelectionRevision, bindingKeys: ['map'], ...f.definitions });
  assert.deepEqual(new Set(input.manifest.resources.map((r) => r.resourceId)), new Set(['map', 'srt', 'audio']));
  assert.ok(input.manifest.selectionDependencies.every((dependency) => dependency.mode === 'fixed'));
  await f.select(await f.resource('srt', '1\n00:00:02,000 --> 00:00:04,000\nChanged synthetic cue'));
  assert.deepEqual((await verifyInput(f.root, input.inputSnapshotId)).manifest, input.manifest);
});

test('external references never count as retained bindings, and source tampering invalidates a structure', async (t) => {
  const f = await scopedFixture(t);
  const external = await f.store.propose({ resourceId: 'external', kind: 'image', external: { uri: 'https://example.invalid/expired.png' } });
  const source = await f.resource('workflow', { '1': { class_type: 'LoadImage', inputs: { image: '../../outside.png' } } });
  const args = { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: 'comfy-api' };
  await assert.rejects(resourcesTool(f.root, { ...args, structureBindings: [{ referenceKey: '/1/inputs/image', revisionId: external.revisionId }] }), { code: 'STRUCTURE_INVALID' });
  const map = await resourcesTool(f.root, { ...args, structureBindings: [] });
  assert.ok(map.revisionId); // A hint containing a relative path was retained without reading that path.
  await writeFile(resourceObjectPath(f.root, source.contentHash, 'content'), '{}');
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'comfy-api' }), { code: 'RESOURCE_INTEGRITY_FAILURE' });
});

test('structural limits and malformed references fail explicitly rather than returning a complete-looking projection', async (t) => {
  const f = await scopedFixture(t);
  for (const [id, format, value] of [
    ['absent-node', 'comfy-api', { '1': { class_type: 'Synthetic', inputs: { image: ['missing', 0] } } }],
    ['excessive', 'comfy-ui', { nodes: Array.from({ length: 4097 }, (_, id) => ({ id, type: 'Synthetic' })), links: [] }],
    ['duplicate', 'martini-run', { id: 'run', status: 'completed', actions: [{ id: 'a', status: 'completed' }, { id: 'a', status: 'completed' }], items: [] }],
    ['bad-action', 'martini-run', { id: 'run', status: 'completed', actions: [], items: [{ id: 'i', actionId: 'missing', status: 'completed' }] }],
    ['bad-version', 'gltf', { asset: { version: '1.0' } }],
  ]) {
    const r = await f.resource(id, value);
    await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: r.revisionId, format }), { code: 'STRUCTURE_INVALID' }, id);
  }
});
