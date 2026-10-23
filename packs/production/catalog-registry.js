import { FolioError } from '../../core/errors.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';

/** Published IDs are exact editions, never aliases for the latest declaration. No network or mutable overrides. */
export function createCatalogRegistry(entries, releases, errorCode) {
  const invalid = (message) => { throw new FolioError(errorCode, message); };
  const pins = new Map(); const values = new Map();
  for (const release of releases) for (const [id, hash] of Object.entries(release)) {
    if (pins.has(id)) invalid('published catalog ID cannot be replaced by a later release');
    if (!/^sha256:[a-f0-9]{64}$/.test(hash)) invalid('published catalog hash required');
    pins.set(id, hash);
  }
  for (const entry of entries) {
    if (typeof entry?.id !== 'string' || !/-v[1-9][0-9]*$/.test(entry.id) || entry.version !== 1) invalid('exact versioned catalog ID and supported record schema required');
    if (values.has(entry.id)) invalid('duplicate catalog ID');
    if (!pins.has(entry.id)) invalid('catalog edition needs an appended release hash');
    const captured = structuredClone(entry);
    if (sha256(canonicalJson(captured)) !== pins.get(entry.id)) invalid('published catalog edition was changed');
    values.set(entry.id, captured);
  }
  if ([...pins.keys()].some((id) => !values.has(id))) invalid('published catalog edition was removed');
  return Object.freeze({
    list: () => [...values.values()].map((value) => structuredClone(value)),
    get(id) {
      if (!values.has(id)) invalid('unknown catalog edition');
      return structuredClone(values.get(id));
    },
  });
}
