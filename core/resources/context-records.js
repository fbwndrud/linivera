import { FolioError } from '../errors.js';
import { assertRevisionId } from './schema.js';
import { createResourceStore } from './revisions.js';
import { STRUCTURE_FORMATS } from '../../packs/production/structures/versions.js';

export const CONTEXT_KINDS = new Set(['usage-context', 'resource-usage', 'context-package']);
export function contextInvalid(message) { throw new FolioError('CONTEXT_INVALID', message); }
export function recordObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) contextInvalid('unsupported context fields');
}
export function contextText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) contextInvalid(`${label} must be meaningful bounded text`);
}
export function revisionList(value) {
  if (!Array.isArray(value) || value.length > 4096 || new Set(value).size !== value.length) contextInvalid('bounded unique revision IDs required');
  value.forEach(assertRevisionId); return value;
}
export function validateUsageContext(value) {
  recordObject(value, ['version', 'scopeId', 'pathId', 'timeLabel', 'requirements', 'states']);
  if (value.version !== 1 || !Array.isArray(value.states) || value.states.length > 4096) contextInvalid('versioned usage context states required');
  contextText(value.scopeId, 'scopeId');
  if (value.requirements !== undefined) validateRequirements(value.requirements);
  for (const key of ['pathId', 'timeLabel']) if (value[key] !== undefined) contextText(value[key], key);
  for (const state of value.states) {
    recordObject(state, ['role', 'subjectRef', 'artifactRevisionId', 'status', 'evidenceRevisionIds', 'value', 'unknown', 'nodeRef']);
    contextText(state.role, 'role');
    if (!['observed', 'selected', 'unknown'].includes(state.status)) contextInvalid('context status must distinguish observation, selection and unknown');
    revisionList(state.evidenceRevisionIds);
    if (state.artifactRevisionId !== undefined) assertRevisionId(state.artifactRevisionId);
    for (const key of ['value', 'unknown']) if (state[key] !== undefined) contextText(state[key], key);
    if (state.subjectRef) {
      recordObject(state.subjectRef, ['subjectId', 'revisionId']); contextText(state.subjectRef.subjectId, 'subjectId');
      if (state.subjectRef.revisionId !== undefined) assertRevisionId(state.subjectRef.revisionId);
    }
    if (state.status === 'unknown' && !state.unknown) contextInvalid('unknown state requires a reason');
    if (state.status !== 'unknown' && !state.artifactRevisionId && !state.evidenceRevisionIds.length && !state.nodeRef) contextInvalid('observed state needs an exact artifact or evidence');
  }
  return value;
}
const RECORD_TYPES = ['brief', 'rights', 'release', 'performance'];
/** Declared roles for the next task. Shape only; exact revisions are checked in core/context/requirements.js. */
export function validateRequirements(value) {
  if (!Array.isArray(value) || !value.length || value.length > 256) contextInvalid('bounded nonempty context requirements required');
  const roles = new Set(value.map((row) => row?.role));
  if (roles.size !== value.length) contextInvalid('context requirement roles must be unique');
  for (const row of value) {
    recordObject(row, ['role', 'required', 'accepts', 'bindsRole']); contextText(row.role, 'requirement role');
    if (typeof row.required !== 'boolean') contextInvalid('context requirement needs an explicit required flag');
    if (row.bindsRole !== undefined && (row.bindsRole === row.role || !roles.has(row.bindsRole))) contextInvalid('bindsRole must name another declared requirement role');
    if (row.accepts === undefined) continue;
    if (!Array.isArray(row.accepts) || !row.accepts.length || row.accepts.length > 16) contextInvalid('bounded nonempty accepted resource types required');
    for (const accept of row.accepts) {
      recordObject(accept, ['kind', 'format', 'recordType']); contextText(accept.kind, 'accepted kind');
      if (accept.format !== undefined && (accept.kind !== 'structure-map' || !STRUCTURE_FORMATS.includes(accept.format))) contextInvalid('accepted format requires a supported structure map');
      if (accept.recordType !== undefined && (accept.format !== 'delivery-record' || !RECORD_TYPES.includes(accept.recordType))) contextInvalid('accepted recordType requires a delivery record');
    }
  }
  return value;
}
export function usageContextReferences(value) {
  return [...new Set(value.states.flatMap((state) => [state.artifactRevisionId, ...state.evidenceRevisionIds,
    state.nodeRef?.revisionId, state.subjectRef?.revisionId].filter(Boolean)))];
}
export async function readContextRecord(root, revision) {
  if (!CONTEXT_KINDS.has(revision.kind)) return null;
  if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') contextInvalid('context records require owned JSON');
  return JSON.parse((await createResourceStore(root).readContent(revision.revisionId)).toString('utf8'));
}
