import { FolioError } from '../errors.js';
import { canonicalJson } from '../util/hash.js';
import { readWorkspaceState, sameCheckpoint } from '../publications/state.js';
import { fail } from '../operations/objects.js';
import { listGenerations } from '../projections/manifest.js';
import { METADATA_GENERATOR_REVISION, metadataEntries, metadataManifest, checkpointFreshness } from '../projections/metadata.js';
/** Pure verified read shared by locked queries and read-only views. Null means no matching generation. */
export async function readResourceQuery(root, input, state) {
  const { resourceId, selector, freshness } = input;
  const requested = selector.type === 'atCheckpoint' ? await readWorkspaceState(root, { checkpoint: selector.checkpoint }) : state;
  const generations = await listGenerations(root);
  const generation = generations.find((g) => selector.type === 'atCheckpoint' ? sameCheckpoint(g.manifest.workspaceCheckpoint, requested.checkpoint) :
    selector.type === 'atRevision' ? g.entries.some((e) => e.revisionId === selector.revisionId && (resourceId === undefined || e.resourceId === resourceId)) : true);
  if (!generation) return null;
  const prefix = await readWorkspaceState(root, { checkpoint: generation.manifest.workspaceCheckpoint });
  const generator = generation.manifest.generatorRevision;
  const legacy = generator !== METADATA_GENERATOR_REVISION;
  const verified = await metadataEntries(root, prefix, { transitive: generator === 'folio-metadata-v2', includeSubmitted: false });
  const { generationId: _generationId, ...actualManifest } = generation.manifest;
  if (!['folio-metadata-v1', 'folio-metadata-v2', METADATA_GENERATOR_REVISION].includes(generator) || canonicalJson(actualManifest) !== canonicalJson(metadataManifest(verified, prefix, generator)) || canonicalJson(verified) !== canonicalJson(generation.entries)) fail('PROJECTION_INTEGRITY_FAILURE', 'generation entries differ from verified authoritative prefix');
  let status = checkpointFreshness(generation.manifest, state);
  if (legacy) status = 'stale';
  let entries = verified.filter((e) => (resourceId === undefined || e.resourceId === resourceId) && (selector.type !== 'atRevision' || e.revisionId === selector.revisionId));
  if (status === 'current' && entries.some((e) => e.storageStatus === 'external_unobserved')) status = 'unknown';
  if (freshness === 'requireCurrent' && status !== 'current') throw new FolioError('PROJECTION_NOT_CURRENT', 'metadata does not cover the current verified checkpoint', { freshness: status, projectionCheckpoint: prefix.checkpoint, currentCheckpoint: state.checkpoint });
  // Old published outputs retain current source-change review status independently of projection freshness.
  const currentEntries = await metadataEntries(root, state);
  entries = entries.map((e) => e.role === 'output' ? { ...e, reviewRequired: currentEntries.find((c) => c.operationId === e.operationId && c.revisionId === e.revisionId)?.reviewRequired ?? e.reviewRequired,
    reviewReasons: currentEntries.find((c) => c.operationId === e.operationId && c.revisionId === e.revisionId)?.reviewReasons ?? e.reviewReasons } : e);
  const missing = resourceId !== undefined && !entries.length ? [{ resourceId, reason: 'no-selected-or-approved-entry' }] : [];
  return { entries, selector, checkpoint: prefix.checkpoint, currentCheckpoint: state.checkpoint, freshness: status, manifest: generation.manifest,
    coverage: { ...generation.manifest.coverage, returnedRevisionIds: entries.map((e) => e.revisionId), missing },
    evidence: entries.map((e) => ({ resourceId: e.resourceId, revisionId: e.revisionId, contentHash: e.contentHash,
      ...(e.role === 'source' ? { sourceCheckpoint: e.sourceCheckpoint, selectionRevision: e.selectionRevision } : { receiptId: e.receiptId, publicationCheckpoint: e.publicationCheckpoint, inputSnapshotId: e.inputSnapshotId, inputCheckpoint: e.inputCheckpoint, inputRefs: e.inputRefs }) })) };
}
