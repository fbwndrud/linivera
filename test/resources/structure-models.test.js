import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';

const model = () => ({ asset: { version: '2.0' },
  buffers: [{ byteLength: 96, uri: 'mesh.bin' }], bufferViews: [{ buffer: 0, byteLength: 96 }],
  accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 8 }],
  images: [{ uri: 'texture.png' }], textures: [{ source: 0 }], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  nodes: [{ mesh: 0, skin: 0, children: [1] }, {}], skins: [{ joints: [1], inverseBindMatrices: 0 }],
  animations: [{ samplers: [{ input: 0, output: 0 }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }] }],
  scenes: [{ nodes: [0] }], scene: 0,
});
function glb(value, binLength) {
  const raw = Buffer.from(JSON.stringify(value)); const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(json);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + 8 + binLength, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bin = Buffer.alloc(8); bin.writeUInt32LE(binLength); bin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, bin, Buffer.alloc(binLength)]);
}

test('glTF projects material, mesh, skin and clip links while exposing external byte dependencies', async (t) => {
  const f = await scopedFixture(t); const r = await f.resource('model', model(), 'model');
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: r.revisionId, format: 'gltf' });
  assert.deepEqual(structure.references.map((r) => [r.key, r.role]), [['/buffers/0/uri', 'buffer'], ['/images/0/uri', 'image']]);
  for (const kind of ['material-texture', 'mesh-material', 'node-skin', 'skin-joint', 'animation-target', 'animation-sampler']) assert.ok(structure.links.some((l) => l.kind === kind), kind);
  const invalid = model(); invalid.textures[0].source = 99;
  const bad = await f.resource('bad', invalid, 'model');
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: bad.revisionId, format: 'gltf' }), { code: 'STRUCTURE_INVALID' });
});

test('large retained GLB reads bounded JSON, preserves external textures and verifies container lengths', async (t) => {
  const f = await scopedFixture(t); const directory = await mkdtemp(join(tmpdir(), 'synthetic-glb-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const value = model(); delete value.buffers[0].uri; value.buffers[0].byteLength = 9 * 1024 * 1024;
  const bytes = glb(value, value.buffers[0].byteLength); const path = join(directory, 'model.glb'); await writeFile(path, bytes);
  const r = await resourcesTool(f.root, { op: 'importFile', resourceId: 'model', kind: 'model', path, mediaType: 'model/gltf-binary' });
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: r.revisionId, format: 'glb' });
  assert.deepEqual(structure.references.map((ref) => ref.key), ['/images/0/uri']);
  assert.ok(structure.links.some((l) => l.kind === 'embedded-buffer'));
  bytes.writeUInt32LE(bytes.length - 4, 8); await writeFile(path, bytes);
  const bad = await resourcesTool(f.root, { op: 'importFile', resourceId: 'bad', kind: 'model', path, mediaType: 'model/gltf-binary' });
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: bad.revisionId, format: 'glb' }), { code: 'STRUCTURE_INVALID' });
});
