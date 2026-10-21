import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';
import { startOperation } from '../../core/operations/requests.js';
export async function productionFixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'linivera-production-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  async function resource(resourceId, kind, value, mediaType = 'application/json') {
    return store.propose({ resourceId, kind, owned: { bytes: mediaType === 'application/json' ? JSON.stringify(value) : value, mediaType } });
  }
  async function select(revision) {
    return store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: (await store.readSourceSelection(revision.resourceId))?.selectionRevision ?? null, action: { actor: 'user', type: 'select' } });
  }
  const source = await resource('source', 'document', 'synthetic source', 'text/plain'); await select(source);
  const requestValue = { version: 1, provider: 'synthetic', product: 'fixture', endpoint: '/generate', capability: 'image', schemaVersion: '1', parameters: options.parameters ?? { prompt: 'synthetic' },
    inputBindings: [{ fieldPath: options.inputFieldPath ?? 'image', revisionId: source.revisionId, role: options.inputRole ?? 'identity' }], outputSpec: options.outputSpec ?? { groupPolicy: 'fixed', groups: ['A', 'B', 'C'].map((groupId) => ({ groupId, slots: [{ role: 'image', required: true, acceptableMediaTypes: ['text/plain'] }] })) } };
  const requestResource = await resource('request', 'generation-request', requestValue); await select(requestResource);
  const ids = {};
  const scope = ['source', 'request', ...(options.extraScope ?? [])];
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 100000 }], ['pipeline', { version: 1, steps: [{ id: 'generate', capability: 'transform' }] }], ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish'] }]]) {
    const revision = await resource(kind, kind, value); ids[kind] = revision.revisionId; await select(revision);
  }
  const snapshot = await prepareInput(root, { revisionIds: [source.revisionId, requestResource.revisionId], profileRevisionId: ids.profile, pipelineRevisionId: ids.pipeline, policyRevisionId: ids.policy });
  const start = { inputSnapshotId: snapshot.inputSnapshotId, idempotencyKey: 'production', actor: 'user', operationContractVersion: 2, requestRevisionId: requestResource.revisionId };
  return { root, store, resource, select, source, requestValue, requestResource, ids, snapshot, start, async operation() { return startOperation(root, start); } };
}
