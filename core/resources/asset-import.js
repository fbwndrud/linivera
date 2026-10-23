import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { withWorkLock } from '../run/work-lock.js';
import { listResourceRevisions } from './catalog.js';
import { readResourceFile } from './intake.js';
import { proposeResourceLocked } from './revisions.js';
import { sha256 } from '../util/hash.js';

/** Snapshot one explicitly chosen managed asset; its ID and original approval remain unchanged. */
export async function importManagedAsset(root, { assetId, expectedRev }) {
  return withWorkLock(root, async () => {
    const work = await openWork(root); const asset = work.assets.get(assetId);
    if (!asset?.managed) throw new FolioError('ASSET_NOT_FOUND', 'a managed asset is required');
    if (asset.rev !== expectedRev) throw new FolioError('ASSET_REV_STALE', 'read the current asset before importing');
    const prior = (await listResourceRevisions(root)).filter((r) => r.resourceId === assetId);
    const prefix = `folio.managed-asset.v1:${assetId}:`;
    if (prior.some((r) => !r.schemaRef?.startsWith(prefix))) throw new FolioError('RESOURCE_ID_CONFLICT', 'ID already belongs to an unrelated resource');
    if (!asset.contentVerified || asset.output?.kind !== 'file') throw new FolioError('ASSET_CONTENT_UNVERIFIED', 'an unchanged owned file is required');
    const schemaRef = prefix + asset.rev;
    const existing = prior.find((r) => r.schemaRef === schemaRef);
    if (existing) return existing;
    const heads = prior.filter((r) => !prior.some((child) => child.parents.includes(r.revisionId)));
    if (heads.length > 1) throw new FolioError('RESOURCE_IMPORT_CONFLICT', 'choose a single imported revision history');
    const bytes = await readResourceFile(join(root, 'assets', asset.output.file));
    if (sha256(bytes) !== asset.output.contentHash) throw new FolioError('RESOURCE_HASH_MISMATCH', 'managed asset changed while reading');
    return proposeResourceLocked(root, { resourceId: assetId, kind: 'image', schemaRef, parents: heads.map((r) => r.revisionId),
      owned: { bytes, mediaType: asset.output.mediaType } });
  });
}
