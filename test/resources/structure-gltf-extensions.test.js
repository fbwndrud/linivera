import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';

export function syntheticExtendedModel() {
  return { asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression', 'KHR_texture_basisu'],
    buffers: [{ byteLength: 100, uri: 'compressed.bin' }], bufferViews: [{ buffer: 0, byteLength: 100, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 60, byteStride: 12, count: 8, mode: 'ATTRIBUTES' } } }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 8 }], images: [{ uri: 'texture.ktx2' }],
    textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }], materials: [{ extensions: { KHR_materials_clearcoat: { clearcoatTexture: { index: 0 } } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 9 } }, KHR_materials_variants: { mappings: [{ material: 0, variants: [0] }] } } }] }],
    nodes: [{ mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 0 } } } }],
    extensions: { KHR_materials_variants: { variants: [{ name: 'Synthetic look' }] } },
  };
}
test('glTF compression, alternate texture, material variants and instancing point to actual indexed dependencies', async (t) => {
  const f = await scopedFixture(t); const source = await f.resource('extended', syntheticExtendedModel(), 'model');
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'gltf' });
  assert.equal(structure.parserVersion, 2);
  for (const kind of ['draco-buffer-view', 'meshopt-buffer', 'extension-image', 'extension-texture', 'variant-material', 'variant-option', 'instance-accessor']) assert.ok(structure.links.some((l) => l.kind === kind), kind);
  assert.ok(structure.links.some((l) => l.kind === 'draco-buffer-view' && l.target === '/bufferViews/0'));
  assert.ok(!structure.links.some((l) => l.kind === 'instance-accessor' && l.target === '/accessors/9'));
});

test('meshopt generated fallback storage requires only the actual compressed source file', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('meshopt', { asset: { version: '2.0' }, buffers: [
    { byteLength: 96, extensions: { EXT_meshopt_compression: { fallback: true } } }, { byteLength: 60, uri: 'compressed.bin' },
  ], bufferViews: [{ buffer: 0, byteLength: 96, extensions: { EXT_meshopt_compression: { buffer: 1, byteLength: 60, byteStride: 12, count: 8, mode: 'ATTRIBUTES' } } }] });
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'gltf' });
  assert.deepEqual(structure.references.map((ref) => ref.key), ['/buffers/1/uri']);
  assert.ok(structure.links.some((link) => link.kind === 'generated-fallback-buffer' && link.source === '/buffers/0'));
  assert.ok(structure.links.some((link) => link.kind === 'meshopt-buffer' && link.target === '/buffers/1'));
});

test('unknown extensions stay visible and malformed compression and material references fail', async (t) => {
  const f = await scopedFixture(t); const value = syntheticExtendedModel();
  value.nodes[0].extensions.SYNTHETIC_future = { uri: 'not-auto-fetched.bin' };
  const unknown = await f.resource('unknown', value);
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: unknown.revisionId, format: 'gltf' });
  assert.ok(structure.coverage.unknown.some((reason) => reason.includes('/nodes/0/extensions/SYNTHETIC_future')));
  for (const [name, change] of [['bad-image', (v) => { v.textures[0].extensions.KHR_texture_basisu.source = 99; }],
    ['bad-buffer', (v) => { v.bufferViews[0].extensions.EXT_meshopt_compression.byteLength = 101; }],
    ['bad-draco-view', (v) => { v.bufferViews[0].byteOffset = 9999; }],
    ['bad-variant', (v) => { v.meshes[0].primitives[0].extensions.KHR_materials_variants.mappings[0].variants = [99]; }]]) {
    const data = syntheticExtendedModel(); change(data); const bad = await f.resource(name, data);
    await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: bad.revisionId, format: 'gltf' }), { code: 'STRUCTURE_INVALID' });
  }
});
