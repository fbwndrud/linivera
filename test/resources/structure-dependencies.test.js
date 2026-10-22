import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';

test('custom Comfy package and declared model slots join exact next-task inputs with their retained contract', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('workflow', { '9': { class_type: 'SyntheticCustomLoader', inputs: { model_path: 'synthetic.model' } } }, 'workflow-source');
  const declaration = await f.resource('dependencies', { version: 1, nodes: [{ classType: 'SyntheticCustomLoader', package: { id: 'synthetic-nodes', version: '1.2.3' }, files: [{ input: 'model_path', role: 'model' }] }] });
  const args = { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: 'comfy-api', dependencyManifestRevisionId: declaration.revisionId };
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'comfy-api', dependencyManifestRevisionId: declaration.revisionId });
  assert.equal(structure.parserVersion, 2);
  assert.deepEqual(structure.references.map((r) => [r.key, r.role]), [['/9/@package', 'node-package'], ['/9/inputs/model_path', 'model']]);
  const partial = await resourcesTool(f.root, { ...args, structureBindings: [] });
  const packageFile = await f.resource('package', 'Synthetic package source'); const model = await f.resource('model', 'Synthetic model bytes');
  const map = await resourcesTool(f.root, { ...args, structureBindings: [{ referenceKey: '/9/@package', revisionId: packageFile.revisionId }, { referenceKey: '/9/inputs/model_path', revisionId: model.revisionId }] });
  const scope = ['workflow', 'dependencies', 'map', 'package', 'model'];
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 100000 }], ['policy', { version: 1, scope, allowedActions: ['select-source', 'create-candidate'] }]]) {
    const r = await f.resource(kind, value, kind); await f.select(r); f.definitions[kind + 'RevisionId'] = r.revisionId;
  }
  for (const r of [source, packageFile, model, partial]) await f.select(r);
  await assert.rejects(prepareInput(f.root, { revisionIds: [partial.revisionId], ...f.definitions }), { code: 'STRUCTURE_BINDINGS_INCOMPLETE' });
  await f.select(map);
  await assert.rejects(prepareInput(f.root, { revisionIds: [map.revisionId], ...f.definitions }), { code: 'INPUT_INVALID' });
  await f.select(declaration);
  const input = await prepareInput(f.root, { revisionIds: [map.revisionId], ...f.definitions });
  assert.deepEqual(new Set(input.manifest.resources.map((r) => r.resourceId)), new Set(scope));
  const outside = await f.resource('profile', { version: 1, scope: scope.filter((id) => id !== 'dependencies'), maxInputBytes: 100000 }, 'profile'); await f.select(outside);
  await assert.rejects(prepareInput(f.root, { revisionIds: [map.revisionId], ...f.definitions, profileRevisionId: outside.revisionId }), { code: 'INPUT_INVALID' });
});

test('UI widget slots and native package observations require explicit matching contracts', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('ui', { nodes: [{ id: 9, type: 'SyntheticCustom', properties: { cnr_id: 'synthetic-nodes', ver: '1.0' }, widgets_values: ['synthetic.model'] }], links: [] });
  const declaration = { version: 1, nodes: [{ classType: 'SyntheticCustom', package: { id: 'synthetic-nodes', version: '1.0' }, files: [{ input: 'model', role: 'model', widgetIndex: 0 }] }] };
  const contract = await f.resource('contract', declaration);
  const args = { op: 'inspectStructure', revisionId: source.revisionId, format: 'comfy-ui', dependencyManifestRevisionId: contract.revisionId };
  const { structure } = await resourcesTool(f.root, args);
  assert.ok(structure.references.some((ref) => ref.key === '/nodes/0/widgets_values/0' && ref.hint === 'synthetic.model'));
  declaration.nodes[0].package.version = '2.0'; const bad = await f.resource('bad-contract', declaration);
  await assert.rejects(resourcesTool(f.root, { ...args, dependencyManifestRevisionId: bad.revisionId }), { code: 'STRUCTURE_INVALID' });
  await assert.rejects(resourcesTool(f.root, { ...args, parserVersion: 1 }), { code: 'STRUCTURE_INVALID' });
  const builtin = await f.resource('builtin', { '1': { class_type: 'LoadImage', inputs: { image: 'synthetic.png' } } });
  const override = await f.resource('override', { version: 1, nodes: [{ classType: 'LoadImage', package: { id: 'fixture', version: '1' }, files: [{ input: 'image', role: 'model' }] }] });
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: builtin.revisionId, format: 'comfy-api', dependencyManifestRevisionId: override.revisionId }), { code: 'STRUCTURE_INVALID' });
});

test('an unreported UI package version stays unknown and can be explicitly described by a retained contract', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('ui-version-unknown', { nodes: [{ id: 1, type: 'SyntheticCustom', properties: { cnr_id: 'synthetic-nodes' }, widgets_values: [] }], links: [] });
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'comfy-ui' });
  assert.ok(structure.coverage.unknown.some((reason) => reason.includes('version')));
  assert.ok(structure.references.some((ref) => ref.role === 'node-package' && ref.required));
  const contract = await f.resource('contract', { version: 1, nodes: [{ classType: 'SyntheticCustom', package: { id: 'synthetic-nodes', version: '1.0' }, files: [] }] });
  const parsed = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'comfy-ui', dependencyManifestRevisionId: contract.revisionId });
  assert.ok(parsed.structure.references.some((ref) => ref.hint === 'synthetic-nodes@1.0'));
});
