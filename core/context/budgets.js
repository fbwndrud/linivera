import { FolioError } from '../errors.js';
import { canonicalJson } from '../util/hash.js';
import { recordObject } from '../resources/context-records.js';

export function contextBudget(value) {
  recordObject(value, ['maxTextBytes', 'maxItems', 'maxManifestBytes']);
  for (const [key, max] of [['maxTextBytes', 8 * 1024 * 1024], ['maxItems', 4096], ['maxManifestBytes', 8 * 1024 * 1024]]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < (key === 'maxManifestBytes' ? 256 : 0) || value[key] > max) throw new FolioError('CONTEXT_BUDGET_INVALID', 'explicit bounded text, item and manifest budgets required');
  }
  return { ...value };
}
export function truncateUtf8(text, maxBytes) {
  let result = ''; let bytes = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > maxBytes) break;
    result += character; bytes += size;
  }
  return result;
}
export function packageBytes(value) { return Buffer.byteLength(canonicalJson(value)); }
