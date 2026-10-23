import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';

const declaration = () => ({ version: 1,
  files: [{ path: 'src/game.js', role: 'source', required: true }, { path: 'scenes/start.json', role: 'scene', required: true },
    { path: 'db/schema.sql', role: 'db-schema', required: true }, { path: 'db/snapshot.json', role: 'db-snapshot', required: true }],
  entrypoints: ['src/game.js'], dependencies: [{ from: 'src/game.js', to: 'scenes/start.json', kind: 'scene' },
    { from: 'db/snapshot.json', to: 'db/schema.sql', kind: 'schema' }],
  externalStates: [{ id: 'world-db', kind: 'database', required: true, evidence: ['db/schema.sql', 'db/snapshot.json'], unavailable: [] }],
});

async function definitions(f, scope, maxInputBytes = 100000) {
  const ids = { pipelineRevisionId: f.definitions.pipelineRevisionId };
  for (const [kind, body] of [['profile', { version: 1, scope, maxInputBytes }], ['policy', { version: 1, scope, allowedActions: ['create-candidate'] }]]) {
    const r = await f.resource(kind, body, kind); await f.select(r); ids[kind + 'RevisionId'] = r.revisionId;
  }
  return ids;
}

test('project declaration connects typed files, entrypoints and state evidence to exact next-task inputs', async (t) => {
  const f = await scopedFixture(t); const value = declaration(); const source = await f.resource('project', value); await f.select(source);
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'project-manifest' });
  assert.deepEqual(structure.references.map((ref) => ref.role), ['source', 'scene', 'db-schema', 'db-snapshot']);
  assert.equal(structure.units.find((unit) => unit.id === '/files/0').entrypoint, true);
  assert.ok(structure.links.some((link) => link.kind === 'declared-dependency' && link.source === '/files/0' && link.target === '/files/1' && link.role === 'scene'));
  assert.equal(structure.links.filter((link) => link.kind === 'state-evidence').length, 2);
  assert.ok(structure.coverage.unknown.some((item) => item.includes('runtime')));
  const targets = await Promise.all(value.files.map((file, i) => f.resource('file-' + i, 'synthetic ' + file.path)));
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'project-map', sourceRevisionId: source.revisionId, format: 'project-manifest',
    structureBindings: targets.map((target, i) => ({ referenceKey: `/files/${i}/path`, revisionId: target.revisionId })) });
  await f.select(map); for (const target of targets) await f.select(target);
  const scope = ['project', 'project-map', ...targets.map((r) => r.resourceId)];
  const snapshot = await prepareInput(f.root, { revisionIds: [map.revisionId], ...await definitions(f, scope) });
  assert.deepEqual(new Set(snapshot.manifest.resources.map((r) => r.resourceId)), new Set(scope));
});

test('required entrypoints, cyclic imports and state evidence cannot downgrade dependencies to optional files', async (t) => {
  const f = await scopedFixture(t); const value = declaration();
  value.files.forEach((file) => { file.required = false; });
  value.dependencies.push({ from: 'scenes/start.json', to: 'src/game.js', kind: 'imports' });
  const source = await f.resource('project', value); await f.select(source);
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'project-manifest' });
  assert.ok(structure.references.every((ref) => ref.required));
  const targets = await Promise.all(value.files.map((file, i) => f.resource('file-' + i, 'synthetic ' + file.path)));
  const args = { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: 'project-manifest' };
  const missing = await resourcesTool(f.root, { ...args, structureBindings: [] }); await f.select(missing);
  const scope = ['project', 'map', ...targets.map((r) => r.resourceId)]; const defs = await definitions(f, scope);
  await assert.rejects(prepareInput(f.root, { revisionIds: [missing.revisionId], ...defs }), { code: 'STRUCTURE_BINDINGS_INCOMPLETE' });
  const complete = await resourcesTool(f.root, { ...args, structureBindings: targets.map((r, i) => ({ referenceKey: `/files/${i}/path`, revisionId: r.revisionId })) }); await f.select(complete);
  await assert.rejects(prepareInput(f.root, { revisionIds: [complete.revisionId], ...defs }), { code: 'INPUT_INVALID' });
  for (const target of targets) await f.select(target);
  await assert.rejects(prepareInput(f.root, { revisionIds: [complete.revisionId], ...await definitions(f, scope.filter((id) => id !== 'file-3')) }), { code: 'INPUT_INVALID' });
  await assert.rejects(prepareInput(f.root, { revisionIds: [complete.revisionId], ...await definitions(f, scope, 100) }), { code: 'INPUT_INVALID' });
  const snapshot = await prepareInput(f.root, { revisionIds: [complete.revisionId], ...await definitions(f, scope) });
  const mapValue = JSON.parse((await f.store.readContent(complete.revisionId)).toString()); mapValue.structure.links = [];
  await assert.rejects(f.resource('forged', mapValue, 'structure-map'), { code: 'STRUCTURE_INVALID' });
  await f.select(await f.resource('file-3', 'synthetic new database snapshot'));
  assert.equal((await verifyInput(f.root, snapshot.inputSnapshotId)).manifest.resources.find((r) => r.resourceId === 'file-3').revisionId, targets[3].revisionId);
});

test('missing external state evidence and known omissions remain visible and block required next-task inputs', async (t) => {
  const f = await scopedFixture(t); const value = declaration();
  value.externalStates.push({ id: 'host', kind: 'deployment', required: true, evidence: [], unavailable: ['Build receipt was not captured'] },
    { id: 'runtime', kind: 'environment', required: false, evidence: [], unavailable: [] });
  const source = await f.resource('project', value); await f.select(source);
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'project-manifest' });
  assert.equal(structure.references.find((ref) => ref.key === '/externalStates/1/@evidence').required, true);
  assert.equal(structure.references.find((ref) => ref.key === '/externalStates/1/unavailable/0').required, true);
  assert.equal(structure.references.find((ref) => ref.key === '/externalStates/2/@evidence').required, false);
  const evidence = await f.resource('evidence', 'synthetic retained evidence'); await f.select(evidence);
  const bindings = structure.references.filter((ref) => !ref.key.startsWith('/externalStates/1')).map((ref) => ({ referenceKey: ref.key, revisionId: evidence.revisionId }));
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: 'project-manifest', structureBindings: bindings }); await f.select(map);
  await assert.rejects(prepareInput(f.root, { revisionIds: [map.revisionId], ...await definitions(f, ['project', 'map', 'evidence']) }), { code: 'STRUCTURE_BINDINGS_INCOMPLETE' });
  const external = await f.store.propose({ resourceId: 'url-only', kind: 'state', external: { uri: 'https://example.invalid/snapshot.json' } });
  await assert.rejects(resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'external-map', sourceRevisionId: source.revisionId, format: 'project-manifest',
    structureBindings: [{ referenceKey: '/externalStates/1/@evidence', revisionId: external.revisionId }] }), { code: 'STRUCTURE_INVALID' });
});

test('project declarations reject ambiguous paths, undeclared relations and silent contract typos', async (t) => {
  const f = await scopedFixture(t);
  for (const mutate of [
    (v) => { v.files[0].path = '../escape'; }, (v) => { v.files.push({ ...v.files[0] }); },
    (v) => { v.files.push({ path: 'src', role: 'source', required: true }); },
    (v) => { v.dependencies[0].to = 'absent'; }, (v) => { v.entrypoints.push('absent'); },
    (v) => { v.externalStates[0].evidence.push('absent'); }, (v) => { v.files[0].require = true; },
    (v) => { v.externalStates[0].required = 'yes'; },
  ]) {
    const value = declaration(); mutate(value); const source = await f.resource('bad', value);
    await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'project-manifest' }), { code: 'STRUCTURE_INVALID' });
  }
});
