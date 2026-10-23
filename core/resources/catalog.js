import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { assertManagedPath } from '../util/managed-path.js';
import { isImmutableStage } from './immutable-stage.js';
import { createResourceStore } from './revisions.js';

/** A verified scan, not a second registry. Interrupted immutable writes are not results. */
export async function objectIds(root, directory) {
  await assertManagedPath(root, directory, { directory: true });
  const names = await readdir(directory).catch((e) => { if (e.code === 'ENOENT') return []; throw e; });
  if (names.length > 10000) throw new FolioError('RESOURCE_CATALOG_TOO_LARGE', 'catalog exceeds the inspection budget');
  const ids = [];
  for (const name of names.sort()) {
    if (await isImmutableStage(root, join(directory, name))) continue;
    if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'unsupported immutable object filename');
    ids.push('sha256:' + name.slice(0, -5));
  }
  return ids;
}

export async function listResourceRevisions(root) {
  const store = createResourceStore(root);
  const ids = await objectIds(root, join(root, '.folio', 'resources', 'revisions'));
  const revisions = [];
  for (const id of ids) revisions.push(await store.readRevision(id));
  return revisions;
}
