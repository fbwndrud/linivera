import { FolioError } from '../../core/errors.js';
import { canonicalJson } from '../../core/util/hash.js';
import { accessCatalog } from './access-catalog.js';
import { createCatalogRegistry } from './catalog-registry.js';
import { accessReleases } from './catalog-releases.js';

function invalid(message) { throw new FolioError('ACCESS_SPEC_INVALID', message); }
const registry = createCatalogRegistry(accessCatalog, accessReleases, 'ACCESS_SPEC_INVALID');
export const listAccessSpecs = () => registry.list();
export const getAccessSpec = (id) => registry.get(id);
/** Versioned evidence-scoped declarations cannot be edited into official access claims. */
export function validateAccessSpec(value) {
  const expected = getAccessSpec(value?.id);
  if (canonicalJson(value) !== canonicalJson(expected)) invalid('access specification differs from the versioned catalog');
  return expected;
}
