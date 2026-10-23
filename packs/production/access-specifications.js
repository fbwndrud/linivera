import { FolioError } from '../../core/errors.js';
import { canonicalJson } from '../../core/util/hash.js';
import { accessCatalog } from './access-catalog.js';

function invalid(message) { throw new FolioError('ACCESS_SPEC_INVALID', message); }
export function listAccessSpecs() { return structuredClone(accessCatalog); }
export function getAccessSpec(id) {
  const value = accessCatalog.find((spec) => spec.id === id);
  if (!value) invalid('unknown access specification');
  return structuredClone(value);
}
/** Versioned evidence-scoped declarations cannot be edited into official access claims. */
export function validateAccessSpec(value) {
  const expected = getAccessSpec(value?.id);
  if (canonicalJson(value) !== canonicalJson(expected)) invalid('access specification differs from the versioned catalog');
  return expected;
}
