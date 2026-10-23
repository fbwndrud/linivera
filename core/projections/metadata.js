import { readWorkspaceState, sameCheckpoint, withWorkspaceStateTransaction } from '../publications/state.js';
import { sha256, canonicalJson } from '../util/hash.js';
import { copy, fail } from '../operations/objects.js';
import { sourceEvidence, publicationEvidence } from './evidence.js';
import { saveGeneration, assertProjectionCheckpoint } from './manifest.js';
import { applyReviewImpact } from './review-impact.js';
import { readOperationLineage, operationImpactFacts, selectionChanges } from '../operations/lineage.js';

export const METADATA_GENERATOR_REVISION = 'folio-metadata-v3';
export async function metadataEntries(root, state, { transitive = true, includeSubmitted = true } = {}) {
  const entries = [];
  for (const selection of Object.values(state.sourceSelections)) {
    const revision = await sourceEvidence(root, selection);
    if (selection.revisionId) entries.push({ ...revision, role: 'source', sourceCheckpoint: selection.checkpoint, selectionRevision: selection.selectionRevision });
  }
  for (const publication of state.publications) {
    const { manifest, receipt, outputs, expectedCheckpoint } = await publicationEvidence(root, publication);
    const before = await readWorkspaceState(root, { checkpoint: expectedCheckpoint });
    if (before.checkpoint.seq !== publication.checkpoint.seq - 1) fail('PUBLICATION_INTEGRITY_FAILURE', 'publication predecessor differs');
    if (publication.action !== 'approve') continue;
    const reviewReasons = selectionChanges(manifest, state);
    for (const output of outputs) entries.push({ ...output, role: 'output', operationId: publication.operationId, requestId: publication.requestId, inputSnapshotId: publication.inputSnapshotId,
      receiptId: publication.receiptId, publicationCheckpoint: publication.checkpoint, selfReview: true, findings: receipt.findings,
      inputRefs: manifest.resources, inputCheckpoint: manifest.workspaceCheckpoint, reviewRequired: reviewReasons.length > 0, reviewReasons });
  }
  if (!transitive) return entries;
  return applyReviewImpact(entries, includeSubmitted ? operationImpactFacts(await readOperationLineage(root), state) : []);
}
/** Explicit refresh; generation does not append an authoritative workspace marker. */
export async function buildMetadataProjection(root, input = {}) {
  input = copy(input);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((k) => k !== 'checkpoint')) fail('PROJECTION_INVALID', 'only checkpoint is supported');
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    if (Object.hasOwn(input, 'checkpoint')) assertProjectionCheckpoint(input.checkpoint);
    if (input.checkpoint) state = await readWorkspaceState(root, { checkpoint: input.checkpoint });
    // Candidate submissions have no workspace marker. Freeze authoritative entries only;
    // live impact is derived at read time so later submissions cannot corrupt old generations.
    const entries = await metadataEntries(root, state, { transitive: false });
    const manifest = metadataManifest(entries, state);
    return saveGeneration(root, manifest, entries);
  });
}
export function checkpointFreshness(generation, state) { return sameCheckpoint(generation.workspaceCheckpoint, state.checkpoint) ? 'current' : 'stale'; }

export function metadataManifest(entries, state, generatorRevision = METADATA_GENERATOR_REVISION) {
  const unknown = entries.filter((e) => e.storageStatus === 'external_unobserved').map((e) => ({ resourceId: e.resourceId, revisionId: e.revisionId, reason: 'external-unobserved' }));
  const manifest = { version: 1, projectionId: 'metadata', kind: 'metadata', workspaceCheckpoint: state.checkpoint, generatorRevision,
      definitionRevision: null, parametersHash: sha256(canonicalJson({})), inputManifestId: sha256(canonicalJson(state.markers)), status: 'complete',
      coverage: { layers: ['metadata'], resourceIds: [...new Set(entries.map((e) => e.resourceId))].sort(), missing: [], unknown }, outputHashes: [sha256(canonicalJson(entries))] };
  return manifest;
}
