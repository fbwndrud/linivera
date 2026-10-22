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

import { resolveParserVersion } from '../../packs/production/structures/versions.js';
export { STRUCTURE_FORMATS } from '../../packs/production/structures/versions.js';
export async function inspectStructure(root, { revisionId, format, parserVersion: requestedVersion, dependencyManifestRevisionId }) {
  const parserVersion = resolveParserVersion(format, requestedVersion);
  if (dependencyManifestRevisionId !== undefined && (parserVersion !== 2 || !['comfy-api', 'comfy-ui'].includes(format))) invalid('dependency manifest requires extended Comfy parser');
  const parser = { 'comfy-api': comfyApi, 'comfy-ui': comfyUi, 'martini-run': martiniRun, 'project-manifest': projectManifest, aseprite, otio }[format];
  const { revision, bytes } = await readStructureSource(root, revisionId, format);
  if (parserVersion === 2 && ['comfy-api', 'comfy-ui'].includes(format)) {
    let declaration;
    if (dependencyManifestRevisionId !== undefined) {
      const dependency = await readStructureSource(root, dependencyManifestRevisionId, 'dependency-manifest');
      if (dependency.revision.mediaType !== 'application/json') invalid('dependency manifest requires retained JSON');
      declaration = json(dependency.bytes);
    }
    return { revision, structure: comfyDependencies(json(bytes), { format, declaration }) };
  }
  if (format === 'xmeml') return { revision, structure: xmeml(bytes) };
  if (format === 'glb') {
    const { document, ...container } = await readGlbSource(root, revision);
    return { revision, structure: (parserVersion === 2 ? gltfExtensions : gltf)(document, { format, ...container }) };
  }
  return { revision, structure: format === 'srt' ? subRip(bytes) : format === 'gltf' ? (parserVersion === 2 ? gltfExtensions : gltf)(json(bytes)) : parser(json(bytes)) };
}
