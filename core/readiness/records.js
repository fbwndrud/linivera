import { FolioError } from '../errors.js';
import { assertResourceId, assertRevisionId } from '../resources/schema.js';
import { createResourceStore } from '../resources/revisions.js';
import { validateCapabilitySpec } from '../../packs/production/capabilities.js';
import { validateProductionRequest } from '../../packs/production/request-schema.js';

export const READINESS_KIND = 'capability-readiness';
export const SPECIFICATION_KIND = 'capability-specification';
export function invalidReadiness(message) { throw new FolioError('CAPABILITY_READINESS_INVALID', message); }
export function validateReadinessInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['specificationRevisionId', 'requestRevisionId', 'candidateRevisionIds', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId', 'scopeId', 'pathId', 'search'].includes(key))) invalidReadiness('unsupported readiness fields');
  for (const key of ['specificationRevisionId', 'requestRevisionId', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId']) assertRevisionId(input[key]);
  assertResourceId(input.scopeId); if (input.pathId !== undefined) assertResourceId(input.pathId);
  if (!Array.isArray(input.candidateRevisionIds) || input.candidateRevisionIds.length > 256 || new Set(input.candidateRevisionIds).size !== input.candidateRevisionIds.length) invalidReadiness('bounded unique exact candidate revisions required');
  input.candidateRevisionIds.forEach(assertRevisionId);
  if (!input.search || Object.keys(input.search).some((key) => !['completeness', 'reason'].includes(key)) || !['complete', 'partial'].includes(input.search.completeness) || typeof input.search.reason !== 'string' || !input.search.reason.trim() || input.search.reason.length > 4096) invalidReadiness('explicit search completeness and reason required');
  return input;
}
export async function readTypedJson(root, revisionId, kind) {
  const store = createResourceStore(root); const revision = await store.readRevision(revisionId);
  if (revision.kind !== kind || revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') invalidReadiness(`owned exact JSON ${kind} required`);
  const value = JSON.parse((await store.readContent(revisionId)).toString('utf8'));
  if (kind === SPECIFICATION_KIND) validateCapabilitySpec(value);
  if (kind === 'generation-request') validateProductionRequest(value);
  return { revision, value };
}
export const exactFact = (revision) => ({ resourceId: revision.resourceId, revisionId: revision.revisionId, contentHash: revision.contentHash,
  storageStatus: revision.storageStatus, mediaType: revision.mediaType ?? null, byteLength: revision.byteLength ?? null });
export function readinessInputReferences(value) {
  return [...new Set([value.input.specificationRevisionId, value.input.requestRevisionId, ...value.boundRevisionIds])];
}
export function readinessEvidenceReferences(value) {
  return [...new Set([...value.input.candidateRevisionIds, ...['profile', 'pipeline', 'policy'].map((kind) => value.input[kind + 'RevisionId'])])].filter((id) => !readinessInputReferences(value).includes(id));
}
