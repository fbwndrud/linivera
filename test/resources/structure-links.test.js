import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';
import { readResourceRelations } from '../../core/resources/context-references.js';

test('retained Comfy API graph exposes nodes, wiring and explicit file slots without fetching files', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('workflow', {
    '1': { class_type: 'LoadImage', inputs: { image: 'synthetic.png' } },
    '2': { class_type: 'SyntheticTransform', inputs: { image: ['1', 0], strength: 0.5 } },
  }, 'workflow-source');
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'comfy-api' });
  assert.deepEqual(structure.units.map((unit) => unit.id), ['/1', '/2']);
  assert.deepEqual(structure.links, [{ source: '/1', target: '/2', kind: 'node-input', locator: '/2/inputs/image', outputIndex: 0 }]);
  assert.deepEqual(structure.references, [{ key: '/1/inputs/image', unitId: '/1', role: 'image', hint: 'synthetic.png', required: true }]);
  assert.ok(structure.coverage.unknown.some((entry) => entry.includes('SyntheticTransform')));
  assert.equal((await f.store.readSourceSelection('workflow')), null);
});

test('structure candidate pins mapped files, blocks missing/unselected dependencies and rejects forged structure', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('workflow', { '1': { class_type: 'LoadImage', inputs: { image: 'synthetic.png' } } }, 'workflow-source');
  const image = await f.store.propose({ resourceId: 'image', kind: 'image', owned: { bytes: Buffer.alloc(12000), mediaType: 'image/png' } });
  const args = { op: 'normalizeStructure', resourceId: 'structure', sourceRevisionId: source.revisionId, format: 'comfy-api', structureBindings: [] };
  const partial = await resourcesTool(f.root, args);
  assert.deepEqual(JSON.parse((await f.store.readContent(partial.revisionId)).toString()).unresolvedReferenceKeys, ['/1/inputs/image']);
  async function definitions(scope, maxInputBytes = 100000) {
    const ids = { pipelineRevisionId: f.definitions.pipelineRevisionId };
    for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes }], ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'select-source'] }]]) {
      const r = await f.resource(kind, value, kind); await f.select(r); ids[kind + 'RevisionId'] = r.revisionId;
    }
    return ids;
  }
  const scope = ['workflow', 'structure', 'image']; const defs = await definitions(scope);
  await f.select(source); await f.select(partial);
  await assert.rejects(prepareInput(f.root, { revisionIds: [partial.revisionId], ...defs }), { code: 'STRUCTURE_BINDINGS_INCOMPLETE' });
  const mapped = await resourcesTool(f.root, { ...args, structureBindings: [{ referenceKey: '/1/inputs/image', revisionId: image.revisionId }] });
  assert.equal(await f.store.readSourceSelection('structure').then((s) => s.revisionId), partial.revisionId);
  await f.select(mapped);
  await assert.rejects(prepareInput(f.root, { revisionIds: [mapped.revisionId], ...defs }), { code: 'INPUT_INVALID' });
  await f.select(image);
  await assert.rejects(prepareInput(f.root, { revisionIds: [mapped.revisionId], ...await definitions(['workflow', 'structure']) }), { code: 'INPUT_INVALID' });
  await assert.rejects(prepareInput(f.root, { revisionIds: [mapped.revisionId], ...await definitions(scope, 10000) }), { code: 'INPUT_INVALID' });
  const complete = await prepareInput(f.root, { revisionIds: [mapped.revisionId], ...await definitions(scope) });
  assert.deepEqual(new Set(complete.manifest.resources.map((r) => r.resourceId)), new Set(scope));
  assert.deepEqual(await readResourceRelations(f.root, mapped), [
    { targetRevisionId: source.revisionId, kind: 'structure-source' },
    { targetRevisionId: image.revisionId, kind: 'structure-reference' },
  ]);
  const value = JSON.parse((await f.store.readContent(mapped.revisionId)).toString()); value.structure.units = [];
  await assert.rejects(f.resource('forged', value, 'structure-map'), { code: 'STRUCTURE_INVALID' });
  await assert.rejects(resourcesTool(f.root, { ...args, structureBindings: [{ referenceKey: '/unknown', revisionId: image.revisionId }] }), { code: 'STRUCTURE_INVALID' });
});
