import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { createRunner } from '../../core/run/runner.js';
import { readTracking, readHistoricalTracking } from '../../core/tracking/records.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { trackingPlan, trackingCriterion, appendPlan } from '../support/tracking.js';

test('historical replay validates receipt-only scoped discoveries after an interrupted commit', async (t) => {
  const root = await copyFixture('novel-3level'); t.after(() => rm(root, { recursive: true, force: true }));
  await useFakePack(root);
  await appendPlan(root, normalizePlan(trackingPlan({ delegation: { addSubjects: true, addCriteria: true, addObservations: true } })));
  const text = '파란 열쇠는 문 옆에 있다.';
  const evidence = { nodeId: 'stairwell', textHash: sha256(text), quote: '파란 열쇠' };
  const host = createFakeHost({ drafts: { '*': text }, events: { '*': (packet) => ({ events: [], tracking: {
    planRev: packet.tracking.plan.rev,
    discoveries: {
      subjects: [{ id: 'key', kind: 'clue', name: '열쇠', aliases: [], body: '', data: {}, evidence }],
      criteria: [trackingCriterion({ id: 'location', subjectKinds: ['clue'], appliesTo: ['stairwell'] })],
    },
    observations: [{ subjectId: 'key', criterionId: 'location', value: '문', basis: 'explicit', evidence }], checked: ['owner', 'location'],
  } }) } });
  const make = (hooks = {}) => createRunner({ root, packs: fakePacks(), hooks });
  const gate = (await driveToEnd(make, host, { start: { node: 'stairwell' }, until: (outcome) => outcome.status === 'needs_user' })).at(-1);
  await assert.rejects(make({ afterReceiptWrite() { throw new Error('synthetic crash'); } }).decide({ runId: gate.runId, action: 'approve' }), /synthetic crash/);
  assert.equal((await readTracking(root)).batches.length, 0);
  assert.equal((await readHistoricalTracking(root)).batches.length, 0);
});
