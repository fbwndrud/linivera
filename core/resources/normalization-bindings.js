import { createResourceStore } from './revisions.js';
import { alignmentInvalid } from './alignment-bindings.js';

export async function verifyNormalizationMap(root, value) {
  const store = createResourceStore(root);
  if (value.version !== 1 || value.indexUnit !== 'unicode-code-points' || !Array.isArray(value.segments) || value.segments.length > 65536) alignmentInvalid('bounded normalization map with an explicit character index unit required');
  const texts = [];
  for (const revisionId of [value.textRevisionId, value.normalizedTextRevisionId]) {
    const revision = await store.readRevision(revisionId);
    if (revision.mediaType !== 'text/plain' || revision.storageStatus !== 'owned_snapshot') alignmentInvalid('map must bind exact retained text revisions');
    texts.push((await store.readContent(revisionId)).toString('utf8'));
  }
  const lengths = texts.map((text) => [...text].length);
  for (const [index, segment] of value.segments.entries()) {
    for (const [start, end, limit] of [[segment.sourceStart, segment.sourceEnd, lengths[0]], [segment.normalizedStart, segment.normalizedEnd, lengths[1]]]) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > limit) alignmentInvalid('normalization map indices exceed exact text');
    }
    if (index && (segment.sourceStart < value.segments[index - 1].sourceStart || segment.normalizedStart < value.segments[index - 1].normalizedStart)) alignmentInvalid('normalization map indices must remain ordered');
  }
  return [value.textRevisionId, value.normalizedTextRevisionId];
}
