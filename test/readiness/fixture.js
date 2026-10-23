import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
import { getCapabilitySpec } from '../../packs/production/capabilities.js';
export async function readinessFixture(t, { maxInputBytes = 1024 * 1024 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'folio-readiness-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  async function put(resourceId, kind, value, { select = false, mediaType = 'application/json', parents = [] } = {}) {
    const revision = await store.propose({ resourceId, kind, parents, owned: { bytes: typeof value === 'string' ? value : JSON.stringify(value), mediaType } });
    if (select) { const old = await store.readSourceSelection(resourceId); await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: old?.selectionRevision ?? null, action: { actor: 'user', type: 'select' } }); }
    return revision;
  }
  const source = await put('source', 'file', 'synthetic bytes', { select: true, mediaType: 'text/plain' });
  const instruction = await put('instruction', 'document', 'Count retained bytes', { select: true, mediaType: 'text/plain' });
  const specification = await put('specification', 'capability-specification', getCapabilitySpec('local-broker-v1'), { select: true });
  const requestValue = { version: 1, ...getCapabilitySpec('local-broker-v1').identity,
    parameters: { instruction: 'Count retained bytes' }, inputBindings: [
      { fieldPath: 'instruction', role: 'instruction', revisionId: instruction.revisionId }, { fieldPath: 'source', role: 'source', revisionId: source.revisionId }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'one', slots: [{ role: 'result', required: true, acceptableMediaTypes: ['application/json'] }] }] } };
  const request = await put('request', 'generation-request', requestValue, { select: true });
  const scope = ['source', 'instruction', 'specification', 'request', 'readiness', 'other', 'context'];
  const profile = await put('profile', 'profile', { version: 1, scope, maxInputBytes }, { select: true });
  const pipeline = await put('pipeline', 'pipeline', { version: 1, steps: [{ id: 'transform', capability: 'transform' }] }, { select: true });
  const policy = await put('policy', 'policy', { version: 1, scope, allowedActions: ['select-source', 'create-candidate'] }, { select: true });
  const input = { specificationRevisionId: specification.revisionId, requestRevisionId: request.revisionId,
    candidateRevisionIds: [source.revisionId, instruction.revisionId], profileRevisionId: profile.revisionId, pipelineRevisionId: pipeline.revisionId, policyRevisionId: policy.revisionId,
    scopeId: 'story', pathId: 'main', search: { completeness: 'partial', reason: 'Only explicitly named synthetic candidates.' } };
  return { root, store, put, input, source, instruction, specification, request, requestValue };
}
