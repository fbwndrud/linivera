import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { readObject } from '../resources/files.js';
import { assertManagedPath } from '../util/managed-path.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';

/** Metadata fingerprint only: deliberately does not claim to verify opaque content bytes. */
export async function graphCatalogFingerprint(root) {
  const files = []; let bytesRead = 0;
  async function visit(directory) {
    await assertManagedPath(root, directory, { directory: true });
    const entries = await readdir(directory, { withFileTypes: true }).catch((error) => { if (error.code === 'ENOENT') return []; throw error; });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { await visit(path); continue; }
      if (!entry.isFile()) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'unsafe graph catalog entry');
      const bytes = await readObject(root, path);
      bytesRead += bytes.length;
      if (files.length >= 30000 || bytesRead > 64 * 1024 * 1024) throw new FolioError('RESOURCE_CATALOG_TOO_LARGE', 'graph metadata catalog exceeds inspection budget');
      files.push({ path: relative(root, path), digest: sha256(bytes) });
    }
  }
  for (const directory of ['resources/revisions', 'resources/inputs', 'operations', 'ledger']) await visit(join(root, '.folio', directory));
  return sha256(canonicalJson(files));
}
