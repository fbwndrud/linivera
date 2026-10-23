import { readStructureSource } from './structure-source.js';
import { json, invalid } from '../../packs/production/structures/common.js';
import { comfyApi, comfyUi } from '../../packs/production/structures/comfy.js';
import { martiniRun } from '../../packs/production/structures/martini.js';
import { subRip } from '../../packs/production/structures/srt.js';
import { gltf } from '../../packs/production/structures/gltf.js';
import { readGlbSource } from './glb-source.js';
import { xmeml } from '../../packs/production/structures/xmeml.js';
import { otio } from '../../packs/production/structures/otio.js';
import { comfyDependencies } from '../../packs/production/structures/comfy-dependencies.js';
import { gltfExtensions } from '../../packs/production/structures/gltf-extensions.js';
import { projectManifest } from '../../packs/production/structures/project-manifest.js';
import { aseprite } from '../../packs/production/structures/aseprite.js';
import { deliveryRecord } from '../../packs/production/structures/delivery-record.js';
import { declaredResponse } from '../../packs/production/structures/provider-response.js';
import { runwareImageResponse } from '../../packs/production/structures/runware-response.js';
import { minimaxVideoQuery } from '../../packs/production/structures/minimax-response.js';
import { klingVideoQuery } from '../../packs/production/structures/kling-response.js';

import { resolveParserVersion } from '../../packs/production/structures/versions.js';
export { STRUCTURE_FORMATS } from '../../packs/production/structures/versions.js';
export async function inspectStructure(root, { revisionId, format, parserVersion: requestedVersion = undefined, dependencyManifestRevisionId = undefined }) {
  const parserVersion = resolveParserVersion(format, requestedVersion);
  const comfy = parserVersion === 2 && ['comfy-api', 'comfy-ui'].includes(format);
  if (dependencyManifestRevisionId !== undefined && !comfy && format !== 'provider-response') invalid('dependency manifest requires extended Comfy or declared provider response parser');
  const parser = { 'comfy-api': comfyApi, 'comfy-ui': comfyUi, 'martini-run': martiniRun, 'project-manifest': projectManifest, 'delivery-record': deliveryRecord,
    'runware-image-response': runwareImageResponse, 'minimax-video-query': minimaxVideoQuery, 'kling-video-query': klingVideoQuery, aseprite, otio }[format];
  const { revision, bytes } = await readStructureSource(root, revisionId, format);
  if (comfy || format === 'provider-response') {
    let declaration;
    if (dependencyManifestRevisionId !== undefined) {
      const dependency = await readStructureSource(root, dependencyManifestRevisionId, 'dependency-manifest');
      if (dependency.revision.mediaType !== 'application/json') invalid('dependency manifest requires retained JSON');
      declaration = json(dependency.bytes);
    }
    return { revision, structure: comfy ? comfyDependencies(json(bytes), { format, declaration }) : declaredResponse(json(bytes), declaration) };
  }
  if (format === 'xmeml') return { revision, structure: xmeml(bytes) };
  if (format === 'glb') {
    const { document, ...container } = await readGlbSource(root, revision);
    return { revision, structure: (parserVersion === 2 ? gltfExtensions : gltf)(document, { format, ...container }) };
  }
  return { revision, structure: format === 'srt' ? subRip(bytes) : format === 'gltf' ? (parserVersion === 2 ? gltfExtensions : gltf)(json(bytes)) : parser(json(bytes)) };
}
