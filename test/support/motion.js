import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syntheticPng } from '../../examples/support/synthetic-media.js';
export { syntheticPng, syntheticWav } from '../../examples/support/synthetic-media.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';

/** All selections in this fixture are synthetic; the real tool never invents user decisions. */
export async function motionFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-motion-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const propose = (resourceId, value, kind = 'synthetic', parents = []) => store.propose({ resourceId, kind, parents,
    owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
  const select = async (r) => store.decideSource({ revisionId: r.revisionId,
    expectedSelectionRevision: (await store.readSourceSelection(r.resourceId))?.selectionRevision ?? null, action: { actor: 'user', type: 'select' } });
  const scope = ['hero', 'pose', 'pose2', 'project', 'narration-project', 'voice', 'film', 'film-shot-01', 'film-shot-02', 'film-timeline', 'narration', 'narration-shot-01', 'narration-timeline'];
  const definitions = {};
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 8 * 1024 * 1024 }],
    ['pipeline', { version: 1, steps: [{ id: 'motion', capability: 'transform' }] }], ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish'] }]]) {
    const r = await propose(kind, value, kind); await select(r); definitions[kind + 'RevisionId'] = r.revisionId;
  }
  const input = (revisions) => prepareInput(root, { ...definitions, revisionIds: revisions.map((r) => r.revisionId) });
  const pose = await store.propose({ resourceId: 'pose', kind: 'character-pose', owned: { bytes: syntheticPng(), mediaType: 'image/png' } }); await select(pose);
  const spec = { version: 1, outputResourceId: 'film', width: 64, height: 64, fps: 8,
    shots: [{ durationSeconds: 1, backgroundColor: '#eeeeee', layers: [{ revisionId: pose.revisionId, x: 0, y: 16, width: 16, dx: 32 }] }], audio: [] };
  const project = async (value = spec, resourceId = 'project') => { const r = await propose(resourceId, value, 'motion-project'); await select(r); return r; };
  return { root, store, propose, select, input, definitions, pose, spec, project };
}
