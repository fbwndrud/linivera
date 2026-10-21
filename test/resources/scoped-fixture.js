import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createResourceStore } from '../../core/resources/revisions.js';
export async function scopedFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'linivera-scoped-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  async function resource(resourceId, value, kind = 'document') {
    return store.propose({ resourceId, kind, owned: { bytes: typeof value === 'string' ? value : JSON.stringify(value), mediaType: typeof value === 'string' ? 'text/plain' : 'application/json' } });
  }
  async function select(revision) {
    return store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: (await store.readSourceSelection(revision.resourceId))?.selectionRevision ?? null, action: { actor: 'user', type: 'select' } });
  }
  const face1 = await resource('face', 'synthetic original face'); await select(face1);
  const face2 = await resource('face', 'synthetic revised face'); await select(face2);
  const music = await resource('music', 'synthetic music'); await select(music);
  const definitions = {};
  for (const [kind, value] of [['profile', { version: 1, scope: ['face', 'music', 'result', 'request', 'iteration', 'change'], maxInputBytes: 100000 }], ['pipeline', { version: 1, steps: [{ id: 'generate', capability: 'transform' }] }], ['policy', { version: 1, scope: ['face', 'music', 'result', 'request', 'iteration', 'change'], allowedActions: ['select-source', 'create-candidate', 'publish'] }]]) {
    const revision = await resource(kind, value, kind); await select(revision); definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  const binding = (bindingKey, revision, mode = 'scoped', role = bindingKey) => ({ bindingKey, resourceId: revision.resourceId, revisionId: revision.revisionId, mode, role });
  return { root, store, resource, select, face1, face2, music, definitions, binding };
}
