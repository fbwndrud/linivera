import { FolioError } from '../errors.js';
import { metadataEntries } from '../projections/metadata.js';
import { readResourceQuery } from '../query/resource-read.js';
import { assertRevisionId } from '../resources/schema.js';
import { createResourceStore } from '../resources/revisions.js';
import { withResourceViewCheckpoint } from './resource-checkpoint.js';

const MAX_PREVIEW = 32768;
const INPUT = Object.freeze({ selector: { type: 'current' }, freshness: 'allowStale' });

async function resourceList(root, state) {
  const result = await readResourceQuery(root, INPUT, state);
  if (!result) {
    await metadataEntries(root, state);
    return { entries: [], checkpoint: null, currentCheckpoint: state.checkpoint, freshness: 'unknown',
      coverage: { layers: ['metadata'], resourceIds: [], returnedRevisionIds: [], missing: [], unknown: [] }, unavailableReason: 'not-indexed' };
  }
  const store = createResourceStore(root);
  const entries = [];
  for (const entry of result.entries) {
    entries.push(entry.role === 'source' ? { ...entry, selectionCurrent: state.sourceSelections[entry.resourceId]?.revisionId === entry.revisionId }
      : { ...await store.readRevision(entry.revisionId), ...entry });
  }
  return { entries,
    checkpoint: result.checkpoint, currentCheckpoint: result.currentCheckpoint, freshness: result.freshness,
    coverage: result.coverage, unavailableReason: null };
}

async function resourceDetail(root, entry) {
  const store = createResourceStore(root);
  const revision = await store.readRevision(entry.revisionId);
  const mediaType = revision.mediaType?.split(';')[0].trim().toLowerCase();
  let contentPreview = null;
  let previewTruncated = false;
  if (revision.storageStatus === 'owned_snapshot' && ['text/plain', 'application/json'].includes(mediaType) && revision.byteLength <= 8 * 1024 * 1024) {
    const text = (await store.readContent(entry.revisionId)).toString('utf8');
    contentPreview = text.slice(0, MAX_PREVIEW);
    previewTruncated = text.length > MAX_PREVIEW;
  }
  return { entry, contentPreview, previewTruncated };
}

export async function viewResources(root) {
  return withResourceViewCheckpoint(root, (state) => resourceList(root, state));
}

export async function viewResource(root, revisionId) {
  assertRevisionId(revisionId);
  return withResourceViewCheckpoint(root, async (state) => {
    const list = await resourceList(root, state);
    const entry = list.entries.find((e) => e.revisionId === revisionId);
    if (!entry) throw new FolioError('RESOURCE_NOT_VISIBLE', 'revision is not in the verified resource view');
    return resourceDetail(root, entry);
  });
}

/** Export reads details from this exact validated generation instead of querying a second list. */
export async function readResourceSnapshot(root, state) {
  const resources = await resourceList(root, state);
  const resourceDetails = {};
  for (const entry of resources.entries) {
    if (!Object.hasOwn(resourceDetails, entry.revisionId)) resourceDetails[entry.revisionId] = await resourceDetail(root, entry);
  }
  return { resources, resourceDetails };
}
