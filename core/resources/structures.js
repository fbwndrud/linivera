import { readStructureSource } from './structure-source.js';
import { json, invalid } from '../../packs/production/structures/common.js';
import { comfyApi, comfyUi } from '../../packs/production/structures/comfy.js';
import { martiniRun } from '../../packs/production/structures/martini.js';
import { subRip } from '../../packs/production/structures/srt.js';
import { gltf } from '../../packs/production/structures/gltf.js';
import { readGlbSource } from './glb-source.js';

export const STRUCTURE_FORMATS = ['comfy-api', 'comfy-ui', 'martini-run', 'srt', 'gltf', 'glb'];
export async function inspectStructure(root, { revisionId, format }) {
  const parser = { 'comfy-api': comfyApi, 'comfy-ui': comfyUi, 'martini-run': martiniRun }[format];
  if (!STRUCTURE_FORMATS.includes(format)) invalid('unsupported structure format');
  const { revision, bytes } = await readStructureSource(root, revisionId, format);
  if (format === 'glb') {
    const { document, ...container } = await readGlbSource(root, revision);
    return { revision, structure: gltf(document, { format, ...container }) };
  }
  return { revision, structure: format === 'srt' ? subRip(bytes) : format === 'gltf' ? gltf(json(bytes)) : parser(json(bytes)) };
}
