import { gltf } from './gltf.js';
import { extendProjection } from './extend.js';
import { array, invalid, object } from './common.js';

const materialTextures = {
  KHR_materials_clearcoat: ['clearcoatTexture', 'clearcoatRoughnessTexture', 'clearcoatNormalTexture'],
  KHR_materials_sheen: ['sheenColorTexture', 'sheenRoughnessTexture'],
  KHR_materials_specular: ['specularTexture', 'specularColorTexture'],
  KHR_materials_transmission: ['transmissionTexture'], KHR_materials_volume: ['thicknessTexture'],
  KHR_materials_iridescence: ['iridescenceTexture', 'iridescenceThicknessTexture'],
  KHR_materials_anisotropy: ['anisotropyTexture'], KHR_materials_pbrSpecularGlossiness: ['diffuseTexture', 'specularGlossinessTexture'],
};
export function gltfExtensions(value, container = {}) {
  const base = gltf(value, { ...container, extensionDependencies: true }); const p = extendProjection(base);
  const handled = new Set();
  const variants = value.extensions?.KHR_materials_variants?.variants ?? [];
  for (const [i, row] of array(variants, 'material variants').entries()) {
    if (!object(row) || typeof row.name !== 'string') invalid('named material variants required');
    p.unit(`/extensions/KHR_materials_variants/variants/${i}`, 'material-variant', { name: row.name });
  }
  function extension(parent, name, data) {
    if (!object(data)) invalid('glTF extension must be an object');
    const id = `${parent}/extensions/${name}`; p.unit(id, 'extension', { name }); p.link(parent, id, 'extension-dependency'); handled.add(id); return id;
  }
  function ref(source, group, index, kind, locator) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= (value[group]?.length ?? 0)) invalid(`extension ${group} reference out of range`);
    p.link(source, `/${group}/${index}`, kind, { locator });
  }
  for (const [i, row] of (value.textures ?? []).entries()) for (const name of ['KHR_texture_basisu', 'EXT_texture_webp', 'EXT_texture_avif']) {
    const data = row.extensions?.[name]; if (data === undefined) continue;
    const id = extension(`/textures/${i}`, name, data); ref(id, 'images', data.source, 'extension-image', id + '/source');
  }
  for (const [i, row] of (value.materials ?? []).entries()) for (const [name, fields] of Object.entries(materialTextures)) {
    const data = row.extensions?.[name]; if (data === undefined) continue;
    const id = extension(`/materials/${i}`, name, data);
    for (const field of fields) if (data[field] !== undefined) ref(id, 'textures', data[field]?.index, 'extension-texture', `${id}/${field}/index`);
  }
  for (const [i, row] of (value.bufferViews ?? []).entries()) {
    const data = row.extensions?.EXT_meshopt_compression; if (data === undefined) continue;
    const id = extension(`/bufferViews/${i}`, 'EXT_meshopt_compression', data);
    ref(id, 'buffers', data.buffer, 'meshopt-buffer', id + '/buffer');
    const length = value.buffers[data.buffer].byteLength;
    if (!Number.isSafeInteger(data.byteLength) || data.byteLength <= 0 || !Number.isSafeInteger(data.byteOffset ?? 0) || (data.byteOffset ?? 0) < 0 || (data.byteOffset ?? 0) + data.byteLength > length) invalid('meshopt source range exceeds declared buffer');
  }
  for (const [i, row] of (value.meshes ?? []).entries()) for (const [j, primitive] of row.primitives.entries()) {
    const parent = `/meshes/${i}/primitives/${j}`; const draco = primitive.extensions?.KHR_draco_mesh_compression;
    if (draco !== undefined) {
      const id = extension(parent, 'KHR_draco_mesh_compression', draco); ref(id, 'bufferViews', draco.bufferView, 'draco-buffer-view', id + '/bufferView');
      if (!object(draco.attributes) || Object.values(draco.attributes).some((index) => !Number.isSafeInteger(index) || index < 0)) invalid('Draco attributes are nonnegative codec IDs, not accessor references');
    }
    const data = primitive.extensions?.KHR_materials_variants;
    if (data !== undefined) {
      const id = extension(parent, 'KHR_materials_variants', data);
      for (const [k, mapping] of array(data.mappings, 'variant mappings').entries()) {
        if (!object(mapping)) invalid('variant mapping requires an object');
        ref(id, 'materials', mapping.material, 'variant-material', `${id}/mappings/${k}/material`);
        for (const [v, index] of array(mapping.variants, 'variant indices').entries()) {
          if (!Number.isSafeInteger(index) || index < 0 || index >= variants.length) invalid('variant index out of range');
          p.link(id, `/extensions/KHR_materials_variants/variants/${index}`, 'variant-option', { locator: `${id}/mappings/${k}/variants/${v}` });
        }
      }
    }
  }
  for (const [i, row] of (value.nodes ?? []).entries()) {
    const data = row.extensions?.EXT_mesh_gpu_instancing; if (data === undefined) continue;
    const id = extension(`/nodes/${i}`, 'EXT_mesh_gpu_instancing', data);
    if (!object(data.attributes)) invalid('GPU instancing attributes required');
    for (const [name, index] of Object.entries(data.attributes)) ref(id, 'accessors', index, 'instance-accessor', `${id}/attributes/${name}`);
  }
  let visited = 0;
  function inspect(row, path, depth = 0) {
    if (row === null || typeof row !== 'object') return;
    if (++visited > 32768 || depth > 64) invalid('extension discovery exceeds structural budget');
    if (!Array.isArray(row) && row.extensions !== undefined) {
      if (!object(row.extensions)) invalid('extensions must be an object');
      for (const name of Object.keys(row.extensions)) {
        const id = `${path}/extensions/${name}`;
        if (!handled.has(id) && !(path === '' && name === 'KHR_materials_variants')) p.unknown(`Uninterpreted extension location: ${id}`);
      }
    }
    for (const [key, item] of Object.entries(row)) if (!['extensions', 'extras'].includes(key)) inspect(item, `${path}/${key}`, depth + 1);
  }
  inspect(value, '');
  p.unknown('Extension references only; compressed payloads, GPU layouts, texture codecs and material rendering are not decoded or validated.');
  return p.finish();
}
