import { FolioError } from '../../../core/errors.js';

export const MAX_STRUCTURE_BYTES = 6 * 1024 * 1024;
export function invalid(message) { throw new FolioError('STRUCTURE_INVALID', message); }
export const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const pointer = (value) => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
export function array(value, label) {
  if (!Array.isArray(value) || value.length > 4096) invalid(`${label} must be an array of at most 4096 items`);
  return value;
}
export function json(bytes) {
  if (bytes.length > MAX_STRUCTURE_BYTES) invalid('structure JSON exceeds 6MiB');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { invalid('structure requires valid UTF-8 JSON'); }
}
/** Bounded structural facts; unknown semantics stay visible rather than being guessed. */
export function projection(format) {
  const value = { format, parserVersion: 1, units: [], links: [], references: [], coverage: { unknown: [], omittedUnknown: 0 } };
  const ids = new Set(); const keys = new Set();
  return {
    value,
    unit(id, kind, details = {}) {
      if (ids.has(id) || ids.size >= 4096) invalid('duplicate or excessive structural units');
      ids.add(id); value.units.push({ id, kind, ...details }); return id;
    },
    link(source, target, kind, details = {}) {
      if (value.links.length >= 8192) invalid('too many structural links');
      value.links.push({ source, target, kind, ...details });
    },
    ref(key, unitId, role, hint, required = true) {
      if (keys.has(key) || keys.size >= 4096 || typeof hint !== 'string' || !hint || hint.length > 8192) invalid('invalid or excessive file references');
      keys.add(key); value.references.push({ key, unitId, role, hint, required });
    },
    unknown(message) {
      const items = value.coverage.unknown;
      if (items.includes(message.slice(0, 512))) return;
      if (items.length < 128) items.push(message.slice(0, 512));
      else value.coverage.omittedUnknown++;
    },
    finish() {
      for (const link of value.links) if (!ids.has(link.source) || !ids.has(link.target)) invalid('structural link target is absent');
      if (Buffer.byteLength(JSON.stringify(value)) > MAX_STRUCTURE_BYTES) invalid('structure projection exceeds 6MiB');
      return value;
    },
  };
}
