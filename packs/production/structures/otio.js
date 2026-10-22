import { array, invalid, object, pointer, projection } from './common.js';
import { boundedSeconds, rationalTime, seconds, timeRange } from './otio-time.js';

const schemas = new Set(['Timeline.1', 'Stack.1', 'Track.1', 'Clip.1', 'Clip.2', 'Gap.1', 'Transition.1']);
export function otio(value) {
  if (!object(value) || value.OTIO_SCHEMA !== 'Timeline.1') invalid('OTIO Timeline.1 root required');
  const p = projection('otio');
  function media(row, owner) {
    const refs = row.OTIO_SCHEMA === 'Clip.1' ? [['media_reference', row.media_reference]] : Object.entries(row.media_references ?? {});
    if (!refs.length) { p.ref(owner + '/missing-media', owner, 'media', 'Missing media for clip'); return null; }
    if (row.OTIO_SCHEMA === 'Clip.2' && !refs.some(([key]) => key === row.active_media_reference_key)) invalid('OTIO active media reference key missing');
    let activeRange = null;
    for (const [key, ref] of refs) {
      const active = row.OTIO_SCHEMA === 'Clip.1' || row.active_media_reference_key === key;
      const id = row.OTIO_SCHEMA === 'Clip.1' ? owner + '/media_reference' : owner + '/media_references/' + pointer(key);
      p.unit(id, 'media', { schema: ref?.OTIO_SCHEMA ?? null, active }); p.link(owner, id, 'clip-media');
      if (ref?.OTIO_SCHEMA === 'ExternalReference.1') p.ref(id + '/target_url', id, 'media', ref.target_url, active);
      else { p.ref(id + '/unresolved-media', id, 'media-or-generator', `Unresolved ${ref?.OTIO_SCHEMA ?? 'missing reference'} at ${id}`, active); p.unknown(`Uninterpreted media reference: ${id}`); }
      if (active && ref?.available_range != null) activeRange = timeRange(ref.available_range);
    }
    return activeRange;
  }
  function decorations(row, id) {
    const effects = array(row.effects ?? [], 'effects');
    for (const kind of ['effects', 'markers']) for (const [i, item] of array(row[kind] ?? [], kind).entries()) {
      if (!object(item)) invalid('OTIO effect/marker must be an object');
      const unit = `${id === '/' ? '' : id}/${kind}/${i}`;
      p.unit(unit, kind === 'effects' ? 'effect' : 'marker', { schema: item.OTIO_SCHEMA ?? null, name: item.name ?? null }); p.link(id, unit, 'editing-' + kind);
    }
    if (effects.length) p.unknown(`Effect timing is not interpreted: ${id}`);
    return effects.length > 0;
  }
  function visit(row, id, depth = 0) {
    if (!object(row) || depth > 32) invalid('OTIO item is invalid or exceeds nesting depth');
    const schema = row.OTIO_SCHEMA; if (typeof schema !== 'string' || !schema || schema.length > 512) invalid('bounded OTIO schema name required');
    const supported = schemas.has(schema);
    const kind = supported ? schema.split('.')[0].toLowerCase() : 'unsupported';
    const index = p.value.units.length;
    p.unit(id, kind, { name: row.name ?? null, schema, enabled: row.enabled ?? true, parentRange: null, sourceRange: supported ? timeRange(row.source_range) : null });
    const unit = p.value.units[index];
    if (!supported) { p.unknown(`Uninterpreted OTIO schema at ${id}: ${schema}`); return { unit, duration: null }; }
    const retimed = decorations(row, id);
    if (kind === 'timeline') {
      unit.globalStartTime = row.global_start_time == null ? null : rationalTime(row.global_start_time);
      const tracks = visit(row.tracks, '/tracks', depth + 1); p.link(id, '/tracks', 'timeline-tracks');
      return { unit, duration: tracks.duration };
    }
    if (kind === 'transition') {
      unit.inOffset = rationalTime(row.in_offset); unit.outOffset = rationalTime(row.out_offset);
      if (unit.inOffset.value < 0 || unit.outOffset.value < 0) invalid('negative OTIO transition offset');
      return { unit, duration: boundedSeconds(seconds(unit.inOffset) + seconds(unit.outOffset)), transition: true };
    }
    if (kind === 'clip') {
      const available = media(row, id); const range = unit.sourceRange ?? available; unit.sourceRange = range;
      if (!range) p.unknown(`Clip duration not supplied: ${id}`);
      return { unit, duration: retimed || !range ? null : seconds(range.duration) };
    }
    if (kind === 'gap') {
      if (!unit.sourceRange) invalid('OTIO gap requires source_range');
      return { unit, duration: retimed ? null : seconds(unit.sourceRange.duration) };
    }
    const rows = array(row.children, 'composition children'); const children = [];
    for (const [i, child] of rows.entries()) {
      const childId = `${id}/children/${i}`; const result = visit(child, childId, depth + 1);
      children.push(result); p.link(id, childId, 'composition-item', { order: i });
    }
    let cursor = 0; let duration = 0;
    for (const item of children) {
      const start = kind === 'stack' ? 0 : item.transition ? cursor === null ? null : boundedSeconds(cursor - seconds(item.unit.inOffset)) : cursor;
      if (start !== null && item.duration !== null) item.unit.parentRange = { start, duration: item.duration, timeUnit: 'seconds' };
      if (kind === 'stack') duration = duration === null || item.duration === null ? null : Math.max(duration, item.duration);
      else if (!item.transition) { cursor = cursor === null || item.duration === null ? null : boundedSeconds(cursor + item.duration); duration = cursor; }
    }
    if (unit.sourceRange) { p.unknown(`Composition trim is retained; visible descendant ranges are not flattened: ${id}`); duration = seconds(unit.sourceRange.duration); }
    if (retimed) duration = null;
    if (duration === null) p.unknown(`Composition duration has unknown coverage: ${id}`);
    return { unit, duration };
  }
  visit(value, '/');
  p.unknown('Structural editorial projection only; metadata, effects, image sequences and native editor restoration require separate interpretation.');
  return p.finish();
}
