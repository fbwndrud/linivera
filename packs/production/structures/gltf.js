import { array, invalid, object, pointer, projection } from './common.js';

const groups = ['buffers', 'bufferViews', 'accessors', 'images', 'samplers', 'textures', 'materials', 'meshes', 'cameras', 'nodes', 'skins', 'animations', 'scenes'];
/** Core glTF 2 object references only; extensions and binary codecs are not interpreted. */
export function gltf(value, { format = 'gltf', binaryByteLength = null, unknown = [] } = {}) {
  if (!object(value) || value.asset?.version !== '2.0') invalid('glTF asset.version 2.0 required');
  const p = projection(format); p.unit('/', 'model'); const lists = {};
  for (const group of groups) {
    lists[group] = array(value[group] ?? [], group);
    for (const [index, row] of lists[group].entries()) {
      if (!object(row)) invalid('glTF objects must be records');
      p.unit(`/${group}/${index}`, group);
    }
  }
  function ref(source, group, index, kind, locator) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= lists[group].length) invalid(`glTF ${group} reference out of range`);
    p.link(source, `/${group}/${index}`, kind, { locator });
  }
  function uri(row, id, role) {
    if (typeof row.uri !== 'string' || !row.uri) invalid('glTF URI must be nonempty text');
    if (row.uri.startsWith('data:')) p.link(id, '/', 'embedded-data');
    else p.ref(id + '/uri', id, role, row.uri);
  }
  for (const [i, row] of lists.buffers.entries()) {
    const id = `/buffers/${i}`;
    if (!Number.isSafeInteger(row.byteLength) || row.byteLength <= 0) invalid('buffer byteLength required');
    if (row.uri !== undefined) uri(row, id, 'buffer');
    else {
      if (i !== 0 || binaryByteLength === null || binaryByteLength < row.byteLength || binaryByteLength - row.byteLength > 3) invalid('buffer requires external, data URI or exact GLB binary chunk');
      p.link(id, '/', 'embedded-buffer');
    }
  }
  for (const [i, row] of lists.bufferViews.entries()) ref(`/bufferViews/${i}`, 'buffers', row.buffer, 'buffer-view', `/bufferViews/${i}/buffer`);
  for (const [i, row] of lists.accessors.entries()) {
    const id = `/accessors/${i}`;
    if (row.bufferView !== undefined) ref(id, 'bufferViews', row.bufferView, 'accessor-view', id + '/bufferView');
    if (row.sparse !== undefined) {
      if (!object(row.sparse)) invalid('sparse accessor must be an object');
      for (const part of ['indices', 'values']) ref(id, 'bufferViews', row.sparse[part]?.bufferView, 'sparse-view', `${id}/sparse/${part}/bufferView`);
    }
  }
  for (const [i, row] of lists.images.entries()) {
    const id = `/images/${i}`;
    if ((row.uri !== undefined) === (row.bufferView !== undefined)) invalid('image requires exactly one URI or bufferView');
    if (row.uri !== undefined) uri(row, id, 'image');
    else ref(id, 'bufferViews', row.bufferView, 'image-view', id + '/bufferView');
  }
  for (const [i, row] of lists.textures.entries()) {
    const id = `/textures/${i}`;
    if (row.source !== undefined) ref(id, 'images', row.source, 'texture-image', id + '/source');
    else p.unknown('Texture source may depend on an uninterpreted extension.');
    if (row.sampler !== undefined) ref(id, 'samplers', row.sampler, 'texture-sampler', id + '/sampler');
  }
  for (const [i, row] of lists.materials.entries()) {
    const id = `/materials/${i}`;
    for (const [path, info] of [
      ['normalTexture', row.normalTexture], ['occlusionTexture', row.occlusionTexture], ['emissiveTexture', row.emissiveTexture],
      ['pbrMetallicRoughness/baseColorTexture', row.pbrMetallicRoughness?.baseColorTexture],
      ['pbrMetallicRoughness/metallicRoughnessTexture', row.pbrMetallicRoughness?.metallicRoughnessTexture],
    ]) if (info !== undefined) ref(id, 'textures', info?.index, 'material-texture', `${id}/${path}/index`);
  }
  for (const [i, row] of lists.meshes.entries()) for (const [j, primitive] of array(row.primitives, 'mesh primitives').entries()) {
    const id = p.unit(`/meshes/${i}/primitives/${j}`, 'primitive'); p.link(`/meshes/${i}`, id, 'mesh-primitive');
    if (!object(primitive) || !object(primitive.attributes)) invalid('primitive attributes required');
    for (const [name, index] of Object.entries(primitive.attributes)) ref(id, 'accessors', index, 'primitive-attribute', `${id}/attributes/${pointer(name)}`);
    if (primitive.indices !== undefined) ref(id, 'accessors', primitive.indices, 'primitive-indices', id + '/indices');
    if (primitive.material !== undefined) ref(id, 'materials', primitive.material, 'mesh-material', id + '/material');
    for (const [k, target] of array(primitive.targets ?? [], 'morph targets').entries()) {
      if (!object(target)) invalid('morph target must be an object');
      for (const [name, index] of Object.entries(target)) ref(id, 'accessors', index, 'morph-target', `${id}/targets/${k}/${pointer(name)}`);
    }
  }
  for (const [i, row] of lists.nodes.entries()) {
    const id = `/nodes/${i}`;
    for (const [field, group] of [['mesh', 'meshes'], ['skin', 'skins'], ['camera', 'cameras']]) if (row[field] !== undefined) ref(id, group, row[field], 'node-' + field, id + '/' + field);
    for (const [j, child] of array(row.children ?? [], 'children').entries()) ref(id, 'nodes', child, 'node-child', `${id}/children/${j}`);
  }
  for (const [i, row] of lists.skins.entries()) {
    const id = `/skins/${i}`;
    for (const [j, joint] of array(row.joints, 'joints').entries()) ref(id, 'nodes', joint, 'skin-joint', `${id}/joints/${j}`);
    if (row.skeleton !== undefined) ref(id, 'nodes', row.skeleton, 'skin-root', id + '/skeleton');
    if (row.inverseBindMatrices !== undefined) ref(id, 'accessors', row.inverseBindMatrices, 'skin-bind-matrices', id + '/inverseBindMatrices');
  }
  for (const [i, row] of lists.animations.entries()) {
    const id = `/animations/${i}`; const samplers = array(row.samplers, 'animation samplers');
    for (const [j, sampler] of samplers.entries()) {
      if (!object(sampler)) invalid('animation sampler must be an object');
      const unit = p.unit(`${id}/samplers/${j}`, 'animation-sampler'); p.link(id, unit, 'animation-sampler');
      for (const field of ['input', 'output']) ref(unit, 'accessors', sampler[field], 'sampler-' + field, `${unit}/${field}`);
    }
    for (const [j, channel] of array(row.channels, 'animation channels').entries()) {
      if (!object(channel) || !Number.isSafeInteger(channel.sampler) || channel.sampler < 0 || channel.sampler >= samplers.length || !object(channel.target)) invalid('invalid animation channel');
      const unit = p.unit(`${id}/channels/${j}`, 'animation-channel'); p.link(id, unit, 'animation-channel');
      p.link(unit, `${id}/samplers/${channel.sampler}`, 'channel-sampler');
      if (channel.target.node !== undefined) ref(unit, 'nodes', channel.target.node, 'animation-target', unit + '/target/node');
      else p.unknown('Animation target without a core node requires extension semantics.');
    }
  }
  for (const [i, row] of lists.scenes.entries()) for (const [j, node] of array(row.nodes ?? [], 'scene nodes').entries()) ref(`/scenes/${i}`, 'nodes', node, 'scene-node', `/scenes/${i}/nodes/${j}`);
  if (value.scene !== undefined) ref('/', 'scenes', value.scene, 'default-scene', '/scene');
  for (const extension of array(value.extensionsRequired ?? [], 'required extensions')) p.unknown('Uninterpreted required extension: ' + extension);
  for (const message of unknown) p.unknown(message);
  p.unknown('Core object references only; binary geometry, codecs, transforms, extensions and renderer restorability are not validated.');
  return p.finish();
}
