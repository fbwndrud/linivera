import { createResourceStore } from './revisions.js';
import { invalid, MAX_STRUCTURE_BYTES } from '../../packs/production/structures/common.js';

/** The store verifies the retained bytes; no external URI or provider asset ID is dereferenced. */
export async function readStructureSource(root, revisionId, format) {
  const store = createResourceStore(root); const revision = await store.readRevision(revisionId);
  if (revision.storageStatus !== 'owned_snapshot') invalid('structure requires a retained source file');
  if (format === 'glb') return { revision, bytes: null };
  if (revision.byteLength > MAX_STRUCTURE_BYTES) invalid('structure source exceeds 6MiB');
  return { revision, bytes: await store.readContent(revisionId) };
}
