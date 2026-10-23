import { array, invalid, object, pointer, projection } from './common.js';

const files = {
  LoadImage: { image: 'image' }, LoadAudio: { audio: 'audio' },
  CheckpointLoaderSimple: { ckpt_name: 'checkpoint' }, CheckpointLoader: { ckpt_name: 'checkpoint', config_name: 'model-config' },
  LoraLoader: { lora_name: 'lora' }, LoraLoaderModelOnly: { lora_name: 'lora' },
  VAELoader: { vae_name: 'vae' }, CLIPLoader: { clip_name: 'clip' },
};
export function comfyApi(value) {
  if (!object(value) || !Object.keys(value).length || Object.keys(value).length > 4096) invalid('Comfy API graph requires bounded keyed nodes');
  const p = projection('comfy-api'); const nodes = new Map();
  for (const [id, node] of Object.entries(value)) {
    if (!object(node) || typeof node.class_type !== 'string' || !node.class_type || node.class_type.length > 512 || !object(node.inputs)) invalid('Comfy node requires class_type and inputs');
    nodes.set(id, p.unit('/' + pointer(id), 'node', { nativeId: id, classType: node.class_type }));
    if (!Object.hasOwn(files, node.class_type)) p.unknown(`uninterpreted-node:${node.class_type}`);
    else for (const name of Object.keys(files[node.class_type])) if (!Object.hasOwn(node.inputs, name)) invalid('known loader is missing a required file input');
  }
  for (const [id, node] of Object.entries(value)) for (const [name, input] of Object.entries(node.inputs)) {
    const locator = `/${pointer(id)}/inputs/${pointer(name)}`;
    if (Array.isArray(input) && input.length === 2 && ['string', 'number'].includes(typeof input[0]) && Number.isSafeInteger(input[1]) && input[1] >= 0) {
      if (!nodes.has(String(input[0]))) invalid('Comfy link names a missing node');
      p.link(nodes.get(String(input[0])), nodes.get(id), 'node-input', { locator, outputIndex: input[1] });
    } else if (Object.hasOwn(files, node.class_type) && Object.hasOwn(files[node.class_type], name)) {
      p.ref(locator, nodes.get(id), files[node.class_type][name], input);
    } else if (object(input) || Array.isArray(input)) p.unknown(`uninterpreted-input:${locator}`);
  }
  return p.finish();
}
export function comfyUi(value) {
  if (!object(value)) invalid('Comfy UI workflow requires an object');
  const nodes = array(value.nodes, 'nodes'); const links = array(value.links, 'links');
  const p = projection('comfy-ui'); const byId = new Map(); const linkIds = new Set();
  for (const [index, node] of nodes.entries()) {
    if (!object(node) || !['string', 'number'].includes(typeof node.id) || typeof node.type !== 'string' || !node.type || node.type.length > 512 || byId.has(String(node.id))) invalid('invalid or duplicate Comfy UI node');
    byId.set(String(node.id), p.unit(`/nodes/${index}`, 'node', { nativeId: String(node.id), classType: node.type }));
  }
  for (const [index, link] of links.entries()) {
    if (!Array.isArray(link) || link.length !== 6 || !['string', 'number'].includes(typeof link[0]) || linkIds.has(String(link[0])) || !Number.isSafeInteger(link[2]) || link[2] < 0 || !Number.isSafeInteger(link[4]) || link[4] < 0) invalid('invalid or duplicate Comfy UI link');
    linkIds.add(String(link[0]));
    p.link(byId.get(String(link[1])), byId.get(String(link[3])), 'node-input', { locator: `/links/${index}`, outputIndex: link[2], inputIndex: link[4] });
  }
  p.unknown('UI widget values and custom nodes are retained in the source; file roles require manual bundles or API export.');
  return p.finish();
}
