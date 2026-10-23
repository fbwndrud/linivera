import { FolioError } from '../errors.js';
import { createResourceStore } from '../resources/revisions.js';
import { usageContextReferences } from '../resources/context-records.js';
import { readinessInputReferences, readinessEvidenceReferences } from '../readiness/records.js';
import { checkReferences, connectionReferences, connectionEvidenceReferences } from '../access/records.js';

function references(kind, value) {
  if (kind === 'connection-check') return checkReferences(value);
  if (kind === 'connection-readiness') return [...connectionReferences(value), ...connectionEvidenceReferences(value)];
  if (kind === 'capability-readiness') return [...readinessInputReferences(value), ...readinessEvidenceReferences(value)];
  if (kind === 'structure-map') return [value.sourceRevisionId, ...value.bindings.map((binding) => binding.revisionId), ...(value.dependencyManifestRevisionId ? [value.dependencyManifestRevisionId] : [])];
  if (kind === 'artifact-bundle') return value.members.map((member) => member.revisionId);
  if (kind === 'usage-context') return usageContextReferences(value);
  if (kind === 'context-package') return value.referenceRevisionIds;
  if (kind === 'resource-usage') return [value.artifactRevisionId, value.contextRevisionId, value.alignmentRevisionId, value.audioRevisionId,
    value.textRevisionId, value.normalizedTextRevisionId, value.normalizationMapRevisionId, value.range?.textRevisionId, value.nodeRef?.revisionId, value.subjectRef?.revisionId].filter(Boolean);
  if (kind === 'audio-alignment') return [value.audioRevisionId, value.textRevisionId, value.normalizedTextRevisionId, value.normalizationMapRevisionId].filter(Boolean);
  if (kind === 'normalization-map') return [value.textRevisionId, value.normalizedTextRevisionId];
  if (kind === 'iteration') return [...value.baseRevisionIds, ...value.preserveRefs, value.changeRequestRevisionId];
  if (kind === 'generation-request') return [...value.inputBindings.flatMap((binding) => [binding.revisionId, binding.transformRevisionId].filter(Boolean)),
    ...(value.iteration?.baseRevisionIds ?? []), ...(value.iteration?.preserveRefs ?? []), ...(value.iteration?.changeRequestRevisionId ? [value.iteration.changeRequestRevisionId] : [])];
  return [];
}
const typed = new Set(['artifact-bundle', 'usage-context', 'resource-usage', 'context-package', 'audio-alignment', 'normalization-map', 'iteration', 'generation-request', 'structure-map', 'capability-readiness', 'connection-check', 'connection-readiness']);

/** Follow actual typed references only. Provenance is not implicitly provided context. */
export async function assertContextIsolation(root, revisions, expected) {
  const store = createResourceStore(root);
  const visited = new Set(); const active = new Set(); let edges = 0;
  async function visit(revision, depth) {
    if (active.has(revision.revisionId) || depth > 32) throw new FolioError('CONTEXT_INVALID', 'context isolation exceeds reference depth or count');
    if (visited.has(revision.revisionId)) return;
    if (visited.size >= 4096) throw new FolioError('CONTEXT_INVALID', 'context isolation exceeds reference depth or count');
    visited.add(revision.revisionId);
    if (!typed.has(revision.kind)) return;
    if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') throw new FolioError('CONTEXT_INVALID', 'typed context references require owned JSON');
    active.add(revision.revisionId);
    const value = JSON.parse((await store.readContent(revision.revisionId)).toString('utf8'));
    const scopeValue = ['capability-readiness', 'connection-readiness'].includes(revision.kind) ? value.input : value;
    if (['usage-context', 'context-package', 'capability-readiness', 'connection-check', 'connection-readiness'].includes(revision.kind)
      && (scopeValue.scopeId !== expected.scopeId || (expected.pathId !== undefined && scopeValue.pathId !== expected.pathId)
        || (expected.timeLabel !== undefined && scopeValue.timeLabel !== expected.timeLabel))) throw new FolioError('CONTEXT_SCOPE_MISMATCH', 'contextual state belongs to another scope, path or time');
    for (const revisionId of references(revision.kind, value)) {
      if (++edges > 8192) throw new FolioError('CONTEXT_INVALID', 'context isolation exceeds reference budget');
      await visit(await store.readRevision(revisionId), depth + 1);
    }
    active.delete(revision.revisionId);
  }
  for (const revision of Array.isArray(revisions) ? revisions : [revisions]) await visit(typeof revision === 'string' ? await store.readRevision(revision) : revision, 0);
}
