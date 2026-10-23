import { invalid } from './common.js';

const latest = { 'comfy-api': 2, 'comfy-ui': 2, 'martini-run': 1, srt: 1, gltf: 2, glb: 2, xmeml: 1, otio: 1, 'project-manifest': 1, aseprite: 1 };
export const STRUCTURE_FORMATS = Object.keys(latest);
export function resolveParserVersion(format, requested) {
  if (!Object.hasOwn(latest, format)) invalid('unsupported structure format');
  const version = requested ?? latest[format];
  if (!Number.isSafeInteger(version) || version < 1 || version > latest[format]) invalid('unsupported parser version for format');
  return version;
}
