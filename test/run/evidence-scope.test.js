import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { workStatus } from '../../core/status.js';
import { openWork } from '../../core/store/work.js';
import { claimsFor } from '../../core/evidence/scope.js';
import { validateClaims } from '../../core/evidence/validate.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, useFakePack } from '../support/fixtures.js';
import { fakePack } from '../support/fake-pack.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { rechecksOf, receiptRecordsOf } from '../support/recheck.js';

const MEMBRANES = '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다. 막을 지나는 물질은 ATP를 쓴다. 자세한 원리는 에너지 장에서 다룬다.\n';
const NOTE = 'ATP는 세포의 에너지 화폐로 불린다.';
const CLAIMS = [
  { quote: '막을 지나는 물질은 ATP를 쓴다', sources: [{ sourceId: 'cell-notes', quote: NOTE }] },
  { quote: '자세한 원리는 에너지 장에서 다룬다', sources: [] },
];

/** 가짜 팩 + 검사 ctx 의 주장을 그대로 보여 주는 참고 검사(fake.claims). */
const seeClaims = (ctx) => ctx.claims.map((c) => ({ code: 'CLAIM_SEEN', quote: c.quote, message: c.sources.map((l) => l.sourceId).join(',') || '-' }));
const packs = () => new Map([['fake', {
  ...fakePack,
  checks: [...fakePack.checks, { id: 'fake.claims', tier: 'deterministic', stage: 'facts', severity: 'advisory', origin: 'pack', run: seeClaims }],
  checkSets: { ...fakePack.checkSets, 'fake.basic': { ...fakePack.checkSets['fake.basic'], checks: [...fakePack.checkSets['fake.basic'].checks, 'fake.claims'] } },
}]]);
const makeRunner = (root) => () => createRunner({ root, packs: packs() });
const seen = (findings) => findings.filter((f) => f.code === 'CLAIM_SEEN').map((f) => [f.quote, f.message]);

async function setFeatures(root, features) {
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
}

/** 추출 요청이 주장을 물으려면 work.yaml packs 에 sources 팩이 있어야 한다(Important 1). registry 에도 그 이름의 (속 빈) 팩을 더한다. */
const packsWithSources = () => new Map([...packs(), ['sources', { name: 'sources' }]]);
const makeRunnerWithSources = (root) => () => createRunner({ root, packs: packsWithSources() });
async function withSourcesPack(root) {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, packs: [...config.packs, 'sources'] }));
  return root;
}

test('requests carry the sources of the node and its ancestors (description and spans, not the text); sources off leaves them out', async () => {
  const root = await copyFixture('knowledge-book');
  await useFakePack(root);
  const chapter = join(root, 'tree', '01-part-basics', '01-chapter-cells', '_node.md');
  await writeFile(chapter, (await readFile(chapter, 'utf8')).replace('title: 세포\n', 'title: 세포\nsources: [cell-notes, ghost, 7]\n'));
  const first = await makeRunner(root)().run({ node: 'membranes' });
  assert.match(first.requests[0].payload.sources[0].rev, /^sha256:/);
  assert.match(first.requests[0].payload.sources[0].contentHash, /^sha256:/);
  assert.deepEqual(first.requests[0].payload.sources.map(({ rev: _rev, contentHash: _hash, ...source }) => source), [
    { id: 'cell-notes', title: '세포 강의 메모', date: '2026-01-10', reliability: 'medium', spans: [{ id: 's1', quote: NOTE }] },
  ]);
  const off = await copyFixture('knowledge-book');
  await useFakePack(off);
  await writeFile(join(off, 'tree', '01-part-basics', '01-chapter-cells', '_node.md'), await readFile(chapter, 'utf8'));
  await setFeatures(off, { sources: false });
  assert.deepEqual((await makeRunner(off)().run({ node: 'membranes' })).requests[0].payload.sources, []);
});

test('claimsFor: the run\'s extracted claims, else the recorded claims when the draft is the file text; links are re-checked; none with evidence off', async () => {
  const work = await openWork(await copyFixture('knowledge-book'));
  const body = work.tree.nodes.get('atp-section').body;
  const [claim] = validateClaims(work, body, [{ quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: NOTE }] }]).claims;
  const gone = { sourceId: 'gone', quote: NOTE };
  const records = [{ type: 'evidence', nodeId: 'atp-section', claims: [{ ...claim, sources: [...claim.sources, gone] }, { quote: '없는 문장', before: '', after: '', sources: [] }] }];
  const base = { work, records, nodeId: 'atp-section', draft: body, extracted: null };
  assert.deepEqual(claimsFor(base), [{ quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: NOTE }] }]);
  const extracted = { submittedClaims: true, claims: [{ quote: '에너지 화폐', before: '', after: '', sources: [claim.sources[0], { ...claim.sources[0], quote: '바뀐 인용' }] }] };
  assert.deepEqual(claimsFor({ ...base, extracted }), [{ quote: '에너지 화폐', sources: [{ sourceId: 'cell-notes', quote: NOTE }] }]);
  assert.deepEqual(claimsFor({ ...base, draft: '새로 쓴 원고' }), []);
  assert.deepEqual(claimsFor({ ...base, nodeId: 'ghost' }), []);
  const off = { ...work, config: { ...work.config, features: { ...work.config.features, evidence: false } } };
  assert.deepEqual(claimsFor({ ...base, work: off, extracted }), []);
});

test('claimsFor tolerates a malformed run claim (not an object, sources not an array, a link not an object): it skips them instead of throwing', async () => {
  const work = await openWork(await copyFixture('knowledge-book'));
  const body = work.tree.nodes.get('atp-section').body;
  const [bound] = validateClaims(work, body, [{ quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: NOTE }] }]).claims;
  const good = { ...bound, sources: [...bound.sources, 'not-a-link', 3] };
  const extracted = { submittedClaims: true, claims: [good, 'not-a-claim', null, { quote: 'x', sources: 'not-an-array' }, { sources: [] }] };
  assert.deepEqual(claimsFor({ work, records: [], nodeId: 'atp-section', draft: body, extracted }), [
    { quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: NOTE }] },
  ]);
});

test('checks see the claims; the claimed source joins refs; a recheck reads recorded claims; a changed source description makes the node stale', async () => {
  const root = await copyFixture('knowledge-book');
  await useFakePack(root);
  await withSourcesPack(root);
  const host = createFakeHost({ drafts: { membranes: MEMBRANES }, events: { membranes: { events: [], claims: CLAIMS } } });
  const asked = (await driveToEnd(makeRunnerWithSources(root), host, { start: { node: 'membranes' }, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.deepEqual(seen(asked.question.advisories), [['막을 지나는 물질은 ATP를 쓴다', 'cell-notes'], ['자세한 원리는 에너지 장에서 다룬다', '-']]);
  const critic = host.calls.find((c) => c.stepId === 'critic').payload;
  assert.deepEqual([critic.claims.length, critic.sources.map((s) => s.id)], [2, ['cell-notes']]);
  const done = (await driveToEnd(makeRunnerWithSources(root), host, { from: await makeRunnerWithSources(root)().decide({ runId: asked.runId, action: 'approve' }), until: (o) => o.status === 'done' })).at(-1);
  const receipt = (await receiptRecordsOf(root)).find((r) => r.type === 'receipt' && r.receiptId === done.receiptId);
  assert.deepEqual(receipt.refs.filter((r) => r.kind === 'source').map((r) => r.id), ['cell-notes']);

  const recheckHost = createFakeHost({ events: { membranes: { events: [] } } });
  const rechecked = (await driveToEnd(makeRunnerWithSources(root), recheckHost, { start: { node: 'membranes', mode: 'recheck' }, until: (o) => o.status === 'done' })).at(-1);
  assert.equal(rechecked.mode, 'recheck');
  assert.deepEqual(recheckHost.calls.find((c) => c.stepId === 'extract').payload.evidence, { wanted: false });
  assert.deepEqual(seen((await rechecksOf(root)).at(-1).advisories), [['막을 지나는 물질은 ATP를 쓴다', 'cell-notes'], ['자세한 원리는 에너지 장에서 다룬다', '-']]);

  await setFeatures(root, { evidence: false });
  await driveToEnd(makeRunnerWithSources(root), recheckHost, { start: { node: 'membranes', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.deepEqual(seen((await rechecksOf(root)).at(-1).advisories), []);

  const meta = join(root, 'sources', 'cell-notes.yaml');
  await writeFile(meta, (await readFile(meta, 'utf8')).replace('reliability: medium', 'reliability: low'));
  const status = await workStatus(root, { packs: packsWithSources() });
  const stale = status.stale.find((s) => s.nodeId === 'membranes');
  assert.deepEqual(stale.reasons.filter((r) => r.kind === 'source').map((r) => r.id), ['cell-notes']);
});
