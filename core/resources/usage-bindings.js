import { createResourceStore } from './revisions.js';
import { assertRevisionId } from './schema.js';
import { recordObject, contextText, validateUsageContext } from './context-records.js';
import { alignmentInvalid, validateTimebase, verifyAlignmentBindings } from './alignment-bindings.js';
import { canonicalJson } from '../util/hash.js';

export async function validateResourceUsage(root, value) {
  recordObject(value, ['version', 'artifactRevisionId', 'contextRevisionId', 'subjectRef', 'workRef', 'nodeRef', 'role', 'range',
    'alignmentRevisionId', 'audioRevisionId', 'textRevisionId', 'normalizedTextRevisionId', 'normalizationMapRevisionId']);
  if (value.version !== 1) alignmentInvalid('versioned resource usage required');
  contextText(value.role, 'usage role');
  const store = createResourceStore(root);
  const refs = [value.artifactRevisionId, value.contextRevisionId]; refs.forEach(assertRevisionId);
  const context = await store.readRevision(value.contextRevisionId);
  if (context.kind !== 'usage-context' || context.mediaType !== 'application/json' || context.storageStatus !== 'owned_snapshot') alignmentInvalid('usage needs an exact usage-context revision');
  validateUsageContext(JSON.parse((await store.readContent(context.revisionId)).toString('utf8')));
  let alignment;
  if (value.alignmentRevisionId) {
    const revision = await store.readRevision(value.alignmentRevisionId);
    if (revision.kind !== 'audio-alignment' || revision.mediaType !== 'application/json') alignmentInvalid('exact typed alignment required');
    alignment = JSON.parse((await store.readContent(revision.revisionId)).toString('utf8'));
    const checked = await verifyAlignmentBindings(root, alignment);
    for (const key of ['audioRevisionId', 'textRevisionId', 'normalizedTextRevisionId', 'normalizationMapRevisionId']) {
      if (value[key] !== alignment[key]) alignmentInvalid('usage must preserve exact alignment audio/text/map bindings');
    }
    if (![alignment.audioRevisionId, value.alignmentRevisionId].includes(value.artifactRevisionId)) alignmentInvalid('usage artifact differs from aligned audio');
    refs.push(value.alignmentRevisionId, ...checked.revisionIds);
  } else if (['audioRevisionId', 'textRevisionId', 'normalizedTextRevisionId', 'normalizationMapRevisionId'].some((key) => value[key] !== undefined)) alignmentInvalid('timing references require a typed alignment revision');
  if (value.range) {
    const range = value.range;
    recordObject(range, ['unit', 'start', 'end', 'timebase', 'textRevisionId']);
    if (!['seconds', 'frames', 'characters'].includes(range.unit) || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end < range.start) alignmentInvalid('bounded explicit usage range required');
    if (range.unit === 'characters') {
      if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)) alignmentInvalid('character indices must be integers');
      assertRevisionId(range.textRevisionId);
      if (value.alignmentRevisionId && ![value.textRevisionId, value.normalizedTextRevisionId].includes(range.textRevisionId)) alignmentInvalid('range references another aligned text');
      const revision = await store.readRevision(range.textRevisionId);
      if (revision.mediaType !== 'text/plain' || range.end > [...(await store.readContent(revision.revisionId)).toString('utf8')].length) alignmentInvalid('range exceeds exact retained text');
      refs.push(range.textRevisionId);
    } else {
      validateTimebase(range.timebase);
      if (range.unit !== range.timebase.unit || (range.unit === 'frames' && (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)))) alignmentInvalid('range time unit differs from explicit timebase');
      if (alignment && canonicalJson(range.timebase) !== canonicalJson(alignment.timebase)) alignmentInvalid('usage range must preserve the exact alignment timebase');
    }
  }
  if (value.nodeRef?.revisionId) refs.push(value.nodeRef.revisionId);
  if (value.subjectRef !== undefined) {
    recordObject(value.subjectRef, ['subjectId', 'revisionId']); contextText(value.subjectRef.subjectId, 'subjectId');
    if (value.subjectRef.revisionId !== undefined) assertRevisionId(value.subjectRef.revisionId);
  }
  if (value.subjectRef?.revisionId) refs.push(value.subjectRef.revisionId);
  if (value.workRef !== undefined) { recordObject(value.workRef, ['workId']); contextText(value.workRef.workId, 'workId'); }
  return [...new Set(refs)];
}
