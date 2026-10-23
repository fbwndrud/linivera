import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';
import { startOperation, submitResult } from '../../core/operations/requests.js';
import { recordReview, decidePublication } from '../../core/operations/publications.js';
import { readWorkspaceState } from '../../core/publications/state.js';

/** Synthetic decisions only; never run this fixture against an existing workspace. */
export async function lineageFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-lineage-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const propose = (resourceId, value, parents = [], kind = 'synthetic') => store.propose({ resourceId, kind, parents,
    owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
  const select = async (revision) => store.decideSource({ revisionId: revision.revisionId,
    expectedSelectionRevision: (await store.readSourceSelection(revision.resourceId))?.selectionRevision ?? null,
    action: { actor: 'user', type: 'select' } });
  const definitions = {};
  const scope = ['hero', 'pose', 'shot', 'panel', 'project', 'background', 'voice'];
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 1024 * 1024 }],
    ['pipeline', { version: 1, steps: [{ id: 'make', capability: 'transform' }] }],
    ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish'] }]]) {
    const revision = await propose(kind, value, [], kind); await select(revision); definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  const input = (revisions) => prepareInput(root, { ...definitions, revisionIds: revisions.map((r) => r.revisionId) });
  async function produce(inputs, output, key, action = 'approve') {
    const snapshot = await input(inputs);
    const request = await startOperation(root, { inputSnapshotId: snapshot.inputSnapshotId, actor: 'user', idempotencyKey: key });
    const result = await submitResult(root, { ...request, inputSnapshotId: snapshot.inputSnapshotId, resultRevisionIds: [output.revisionId] });
    const receiptId = await recordReview(root, { operationId: request.operationId, outputHashes: result.outputs.map((r) => r.contentHash), findings: [], reviewer: 'host' });
    await decidePublication(root, { operationId: request.operationId, receiptId, actor: 'user', action,
      expectedCheckpoint: (await readWorkspaceState(root)).checkpoint });
    return { ...request, inputSnapshotId: snapshot.inputSnapshotId };
  }
  const hero = await propose('hero', { color: 'blue' }); await select(hero);
  const pose = await propose('pose', { posture: 'wave' }); const poseOperation = await produce([hero], pose, 'pose'); await select(pose);
  const shot = await propose('shot', { seconds: 2 }); const shotOperation = await produce([pose], shot, 'shot');
  return { root, store, propose, select, definitions, input, produce, hero, pose, shot, poseOperation, shotOperation };
}
