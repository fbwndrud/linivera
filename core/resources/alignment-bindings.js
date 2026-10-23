import { FolioError } from '../errors.js';
import { createResourceStore } from './revisions.js';
import { assertRevisionId } from './schema.js';
import { verifyNormalizationMap } from './normalization-bindings.js';

export function alignmentInvalid(message) { throw new FolioError('USAGE_BINDING_INVALID', message); }
export function validateTimebase(value) {
  if (!value || !['seconds', 'milliseconds', 'frames'].includes(value.unit) || !Number.isFinite(value.origin) || value.origin < 0
    || (value.unit === 'frames' && (!Number.isFinite(value.fps) || value.fps <= 0))) alignmentInvalid('explicit time unit, origin and frame rate required');
}
async function textContent(store, revisionId) {
  assertRevisionId(revisionId);
  const revision = await store.readRevision(revisionId);
  if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'text/plain') alignmentInvalid('exact retained source text required');
  return (await store.readContent(revisionId)).toString('utf8');
}
/** Validate retained timing; no inferred normalized-to-original index conversion. */
export async function verifyAlignmentBindings(root, value) {
  const store = createResourceStore(root);
  const audio = await store.readRevision(value.audioRevisionId);
  if (audio.storageStatus !== 'owned_snapshot' || !audio.mediaType?.startsWith('audio/')) alignmentInvalid('exact retained audio required');
  const original = await textContent(store, value.textRevisionId);
  if (value.version !== 1 || !['character', 'word', 'speaker'].includes(value.alignmentKind)) alignmentInvalid('typed alignment version and kind required');
  validateTimebase(value.timebase);
  if ((value.requestText !== undefined && value.requestText !== original) || (value.original?.text !== undefined && value.original.text !== original)) alignmentInvalid('alignment original text differs from retained source');
  const segments = value.segments ?? value.original?.segments ?? value.normalized?.segments;
  if (!Array.isArray(segments) || segments.some((segment, index) => !Number.isFinite(segment.start) || !Number.isFinite(segment.end)
    || segment.start < 0 || segment.end < segment.start || (index > 0 && segment.start < segments[index - 1].start))) alignmentInvalid('ordered finite timing segments required');
  const refs = [audio.revisionId, value.textRevisionId];
  let normalized;
  if (value.normalizedTextRevisionId) {
    normalized = await textContent(store, value.normalizedTextRevisionId); refs.push(value.normalizedTextRevisionId);
    if (value.normalized?.text !== undefined && value.normalized.text !== normalized) alignmentInvalid('normalized alignment text differs from retained normalized text');
  }
  if (value.normalizationMapRevisionId) {
    if (normalized === undefined) alignmentInvalid('normalization map requires an exact normalized text revision');
    const envelope = await store.readRevision(value.normalizationMapRevisionId);
    if (envelope.kind !== 'normalization-map' || envelope.mediaType !== 'application/json' || envelope.storageStatus !== 'owned_snapshot') alignmentInvalid('typed retained normalization map required');
    const map = JSON.parse((await store.readContent(envelope.revisionId)).toString('utf8'));
    if (map.version !== 1 || map.textRevisionId !== value.textRevisionId || map.normalizedTextRevisionId !== value.normalizedTextRevisionId
      || map.indexUnit !== 'unicode-code-points' || !Array.isArray(map.segments)) alignmentInvalid('normalization map must bind both exact text revisions and index unit');
    await verifyNormalizationMap(root, map);
    refs.push(envelope.revisionId);
  }
  return { revisionIds: refs, normalizationMap: value.normalizationMapRevisionId ? 'observed' : 'unknown' };
}
