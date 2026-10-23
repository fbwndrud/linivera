import { createRunner } from '../../core/run/runner.js';
import { openWork } from '../../core/store/work.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { readTree } from '../../core/store/tree.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, useFakePack, fakePacks } from './fixtures.js';
import { createFakeHost, driveToEnd } from './fake-host.js';
import { appendPlan, trackingPlan } from './tracking.js';

export const TEXT = '파란 열쇠는 문 옆에 있다.';
export async function coverageSetup(options = {}) {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  await appendPlan(root, normalizePlan(trackingPlan({ ...options, delegation: { addSubjects: true, addCriteria: true, addObservations: true, backfill: true } }),
    { nodeIds: [...(await readTree(root)).nodes.keys()] }));
  const make = () => createRunner({ root, packs: fakePacks() });
  const execute = async (node, { mode = 'normal', discover = false, value = null, checked = ['owner'] } = {}) => {
    const evidence = { nodeId: node, textHash: sha256(TEXT), quote: '파란 열쇠' };
    const host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => ({ events: [], tracking: {
      planRev: p.tracking.plan.rev, discoveries: { subjects: discover ? [{ id: 'key', kind: 'object', name: '숨은 물건', aliases: [], body: '', data: {}, evidence }] : [], criteria: [] },
      observations: value === null ? [] : [{ subjectId: 'key', criterionId: 'owner', value, basis: 'explicit', evidence }], checked,
    } }) } });
    return (await driveToEnd(make, host, { start: { node, ...(mode === 'normal' ? {} : { mode }) }, until: (o) => o.status === 'done' })).at(-1);
  };
  return { root, make, execute, work: () => openWork(root) };
}
