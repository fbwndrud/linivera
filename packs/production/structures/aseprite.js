import { array, invalid, object, pointer, projection } from './common.js';

function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 0x7fffffff) invalid('bounded atlas integer required'); return value;
}
function size(value) {
  if (!object(value)) invalid('atlas size required'); return { w: integer(value.w, 1), h: integer(value.h, 1) };
}
function rect(value, bounds) {
  if (!object(value)) invalid('atlas rectangle required');
  const result = { x: integer(value.x), y: integer(value.y), ...size(value) };
  if (result.x > bounds.w - result.w || result.y > bounds.h - result.h) invalid('atlas rectangle exceeds declared bounds');
  return result;
}
function name(value) { if (typeof value !== 'string' || !value || value.length > 2048) invalid('bounded atlas name required'); return value; }

/** Exported frame geometry is observed metadata; image pixels and playback are not evaluated. */
export function aseprite(value) {
  if (!object(value) || !object(value.meta) || !(object(value.frames) || Array.isArray(value.frames))) invalid('Aseprite frames and meta required');
  if (value.meta.scale !== undefined && (typeof value.meta.scale !== 'string' || value.meta.scale.length > 64)) invalid('bounded atlas scale string required');
  const p = projection('aseprite'); const sheetSize = size(value.meta.size); p.unit('/meta', 'sprite-sheet', { size: sheetSize, scale: value.meta.scale ?? null });
  p.ref('/meta/image', '/meta', 'sprite-sheet', value.meta.image ?? 'Unreported sprite sheet image');
  if (!value.meta.image) p.unknown('Sprite sheet file name was not exported; an explicit sheet binding is required.');
  const hash = !Array.isArray(value.frames);
  const entries = hash ? Object.entries(value.frames) : array(value.frames, 'atlas frames').map((row, i) => [i, row]);
  if (!entries.length || entries.length > 4096) invalid('bounded nonempty atlas frames required');
  const frames = []; const names = new Set();
  for (const [key, row] of entries) {
    if (!object(row) || typeof row.rotated !== 'boolean' || typeof row.trimmed !== 'boolean') invalid('atlas frame flags required');
    const frameName = name(hash ? key : row.filename); if (names.has(frameName)) invalid('duplicate atlas frame name'); names.add(frameName);
    const id = `/frames/${pointer(key)}`; const sourceSize = size(row.sourceSize);
    p.unit(id, 'sprite-frame', { name: frameName, frame: rect(row.frame, sheetSize), rotated: row.rotated, trimmed: row.trimmed,
      spriteSourceSize: rect(row.spriteSourceSize, sourceSize), sourceSize, durationMs: integer(row.duration, 1) });
    p.link(id, '/meta', 'frame-sheet'); frames.push(id);
  }
  // JSON.parse reorders integer object keys; multiple layers can reuse source frame indices.
  const ambiguous = hash && entries.some(([key]) => /^(0|[1-9]\d*)$/.test(String(key))) || (value.meta.layers?.length ?? 0) > 1;
  for (const [i, tag] of array(value.meta.frameTags ?? [], 'animation tags').entries()) {
    if (!object(tag)) invalid('animation tag object required');
    const from = integer(tag.from); const to = integer(tag.to); if (to < from) invalid('reversed animation tag range');
    const id = `/meta/frameTags/${i}`;
    const direction = name(tag.direction); if (!['forward', 'reverse', 'pingpong', 'pingpong_reverse'].includes(direction)) invalid('unsupported animation direction');
    const repeat = tag.repeat ?? null;
    if (repeat !== null && (typeof repeat !== 'string' || !/^\d{1,10}$/.test(repeat))) invalid('invalid tag repeat');
    p.unit(id, 'animation-tag', { name: name(tag.name), from, to, direction, repeat });
    if (ambiguous || to >= frames.length) { p.unknown(`Unresolved tag frame order/range at ${id}; numeric hash names, layered or partial export cannot be resolved by index.`); continue; }
    for (let j = from; j <= to; j++) p.link(id, frames[j], 'tag-frame', { frameIndex: j });
  }
  for (const key of Object.keys(value.meta)) if (!['image', 'size', 'scale', 'frameTags', 'app', 'version', 'format'].includes(key)) p.unknown(`Uninterpreted atlas metadata: /meta/${pointer(key)}`);
  for (const key of Object.keys(value)) if (!['frames', 'meta'].includes(key)) p.unknown(`Uninterpreted atlas field: /${pointer(key)}`);
  if (value.meta.scale !== undefined && value.meta.scale !== '1') p.unknown('Atlas scale is retained as metadata; no coordinate rescaling is performed.');
  p.unknown('Atlas geometry and declared tag membership only; image decoding, layer/slice semantics and runtime playback are not verified.');
  return p.finish();
}
