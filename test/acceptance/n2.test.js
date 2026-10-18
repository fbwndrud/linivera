import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

const MEMBRANES = '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다. 막을 지나는 물질은 ATP를 쓴다. 자세한 원리는 에너지 장에서 다룬다.\n';
const NOTE = 'ATP는 세포의 에너지 화폐로 불린다.';
const MEMBRANE_CLAIMS = [
  { quote: '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다', sources: [] },
  { quote: '막을 지나는 물질은 ATP를 쓴다', sources: [{ sourceId: 'cell-notes', quote: NOTE }] },
];

/** MCP 너머의 가짜 호스트 모델. script: 노드 id → { draft, events, claims }. 검사는 지적 없이 답하고, 수정 요청에는 같은 원고를 돌려준다. */
function answerer(script = {}) {
  return (request) => {
    const p = request.payload;
    const own = script[p.node.id] ?? {};
    if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
    if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획: 자료로 다룰 내용`;
    if (p.produces === 'children') return JSON.stringify({ children: [{ id: `${p.node.id}-1`, title: '첫 자식' }] });
    if (p.produces === 'draft') return own.draft ?? `${p.node.title || p.node.id} 본문.`;
    if (p.produces === 'events') return JSON.stringify({ events: own.events ?? [], appearances: [], mentions: [], ...(own.claims ? { claims: own.claims } : {}) });
    throw new Error(`no answer for ${request.purpose}/${p.produces}`);
  };
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** until 을 만날 때까지 run/resume/decide(approve) 를 MCP 로 돌린다. 지나온 결과 이름과 요청을 모은다. */
async function drive(folio, root, start, answer, until = (o) => o.status === 'done') {
  const labels = [];
  const requests = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 60; i += 1) {
    labels.push(label(out));
    if (until(out)) return { labels, requests, out };
    if (out.status === 'needs_model') {
      requests.push(...out.requests);
      out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}`);
  }
  throw new Error('drive did not finish');
}

/** knowledge-book 복사본(packs: [knowledge, sources]) — work.yaml 고치기는 작가가 하는 일. 원본 fixture 는 그대로. */
async function book(config = {}) {
  const root = await copyFixture('knowledge-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), packs: ['knowledge', 'sources'], ...config }));
  return root;
}

const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
const findingsOf = (out) => [...out.question.blocking, ...out.question.advisories].map((f) => [f.checkId, f.code, f.quote ?? null, f.severity]);
const untilUser = (o) => o.status === 'needs_user';

test('N2-1 over MCP stdio sources are added (text and a chosen file), listed and read; a link with one wrong quote records nothing', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book();
  const added = await ok(folio.call('folio_sources', { root, op: 'add', id: 'history-notes', title: '세포 발견사', date: '2026-02-01', reliability: 'high', text: '로버트 훅은 1665년에 코르크에서 세포를 처음 관찰했다.\n' }));
  assert.deepEqual([added.source.file, added.read], ['history-notes.txt', null]);
  const outside = await tempDir('folio-n2-scan-');
  await writeFile(join(outside, 'scan.pdf'), Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]));
  const scan = await ok(folio.call('folio_sources', { root, op: 'add', id: 'scan', path: join(outside, 'scan.pdf'), spans: [{ id: 'p1', quote: '세포는 1839년에 생명의 단위로 정리됐다.' }] }));
  assert.deepEqual([scan.source.file, scan.read.path, scan.read.bytes], ['scan.pdf', join(outside, 'scan.pdf'), 5]);
  const again = await folio.call('folio_sources', { root, op: 'add', id: 'scan', text: '덮어쓰기' });
  assert.equal(again.error.code, 'SOURCE_EXISTS');
  assert.deepEqual((await ok(folio.call('folio_sources', { root, op: 'list' }))).sources.map((s) => [s.id, s.file, s.reliability, s.text]), [
    ['cell-notes', 'cell-notes.txt', 'medium', true], ['history-notes', 'history-notes.txt', 'high', true], ['scan', 'scan.pdf', null, false],
  ]);
  const got = await ok(folio.call('folio_sources', { root, op: 'get', id: 'history-notes' }));
  assert.equal(got.source.text, '로버트 훅은 1665년에 코르크에서 세포를 처음 관찰했다.\n');
  assert.equal((await ok(folio.call('folio_sources', { root, op: 'get', id: 'scan' }))).source.text, null);

  const good = { quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: NOTE }, { sourceId: 'scan', quote: '세포는 1839년에 생명의 단위로 정리됐다.' }] };
  for (const bad of [
    { quote: '에너지 화폐다', sources: [{ sourceId: 'history-notes', quote: '1666년에 관찰했다' }] },
    { quote: '에너지 화폐다', sources: [{ sourceId: 'scan', quote: '1839년에' }] },
    { quote: '없는 주장이다', sources: [] },
  ]) {
    const refused = await folio.call('folio_sources', { root, op: 'link', nodeId: 'atp-section', claims: [good, bad] });
    assert.equal(refused.error.code, 'EVIDENCE_INVALID', JSON.stringify(bad));
    assert.deepEqual(refused.error.details.errors.map((e) => e.index), [1]);
  }
  assert.deepEqual((await ok(folio.call('folio_sources', { root, op: 'list' }))).evidence, { stale: [], total: 0 });
  assert.equal((await ok(folio.call('folio_sources', { root, op: 'link', nodeId: 'atp-section', claims: [good] }))).accepted, 1);
  assert.deepEqual((await ok(folio.call('folio_sources', { root, op: 'get', id: 'scan' }))).links.map((l) => [l.nodeId, l.status, l.sources[0].verified]), [['atp-section', 'located', true]]);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N2-2 an unsupported claim is an advisory; raised to block it stops the run and approving needs a reason', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const script = answerer({ membranes: { draft: MEMBRANES, claims: MEMBRANE_CLAIMS } });
  const root = await book({ checkSets: ['sources.citations'] });
  const { out, requests } = await drive(folio, root, { node: 'membranes' }, script, untilUser);
  assert.deepEqual(requests.find((r) => r.stepId === 'extract').payload.evidence, { wanted: true });
  assert.equal(label(out), 'user:approve');
  assert.deepEqual(findingsOf(out), [['sources.claim-supported', 'CLAIM_UNSUPPORTED', '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다', 'advisory']]);
  assert.equal((await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }))).status, 'done');
  assert.deepEqual((await receiptOf(root, 'membranes')).appliedChecks.map((a) => a.checkId), ['core.promise-order', 'sources.claim-supported', 'sources.numbers-match', 'sources.reliability']);

  const strict = await book({ checkSets: ['sources.citations'], checks: { 'sources.claim-supported': { severity: 'block' } } });
  const blocked = await drive(folio, strict, { node: 'membranes' }, script, untilUser);
  assert.equal(label(blocked.out), 'user:blocked');
  assert.equal(blocked.labels.filter((l) => l === 'model:revise').length, 3);
  assert.deepEqual(blocked.out.question.blocking.map((f) => [f.code, f.quote, f.severity]), [['CLAIM_UNSUPPORTED', '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다', 'block']]);
  assert.equal(blocked.out.question.canApprove, true);
  const refused = await folio.call('folio_decide', { root: strict, runId: blocked.out.runId, action: 'approve' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'OVERRIDE_REASON_REQUIRED']);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N2-3 a number or year in a claim that the linked source does not carry is caught', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book({ checkSets: ['sources.citations'] });
  await ok(folio.call('folio_sources', { root, op: 'add', id: 'history-notes', reliability: 'high', text: '로버트 훅은 1665년에 코르크에서 세포를 처음 관찰했다. 사람 몸의 세포는 약 37조 개로 추정된다.\n' }));
  const draft = '세포는 1666년에 처음 관찰됐다. 사람 몸의 세포는 약 37조 개다.\n';
  const claims = [
    { quote: '세포는 1666년에 처음 관찰됐다', sources: [{ sourceId: 'history-notes', quote: '로버트 훅은 1665년에 코르크에서 세포를 처음 관찰했다' }] },
    { quote: '사람 몸의 세포는 약 37조 개다', sources: [{ sourceId: 'history-notes', quote: '사람 몸의 세포는 약 37조 개로 추정된다' }] },
  ];
  const { out } = await drive(folio, root, { node: 'membranes' }, answerer({ membranes: { draft, claims } }), untilUser);
  assert.deepEqual(findingsOf(out), [['sources.numbers-match', 'NUMBER_NOT_IN_SOURCE', '세포는 1666년에 처음 관찰됐다', 'advisory']]);
  assert.deepEqual(out.question.advisories[0].numbers, ['1666']);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N2-4 a claim that leans only on low-reliability sources is caught; one reliable source clears it', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book({ checkSets: ['sources.citations'] });
  await ok(folio.call('folio_sources', { root, op: 'add', id: 'blog', reliability: 'low', text: '세포는 모두 둥글다고 한다. 세포막은 세포를 둘러싼다고 한다.\n' }));
  await ok(folio.call('folio_sources', { root, op: 'add', id: 'lecture', reliability: 'medium', text: '세포막은 세포를 둘러싼다.\n' }));
  const draft = '세포는 모두 둥글다. 세포막은 세포를 둘러싼다.\n';
  const claims = [
    { quote: '세포는 모두 둥글다', sources: [{ sourceId: 'blog', quote: '세포는 모두 둥글다고 한다' }] },
    { quote: '세포막은 세포를 둘러싼다', sources: [{ sourceId: 'blog', quote: '세포막은 세포를 둘러싼다고 한다' }, { sourceId: 'lecture', quote: '세포막은 세포를 둘러싼다.' }] },
  ];
  const { out } = await drive(folio, root, { node: 'membranes' }, answerer({ membranes: { draft, claims } }), untilUser);
  assert.deepEqual(findingsOf(out), [['sources.reliability', 'LOW_RELIABILITY_ONLY', '세포는 모두 둥글다', 'advisory']]);
  assert.deepEqual(out.question.advisories[0].sources, ['blog']);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N2-5 editing the claimed text makes its link stale; changing a source description makes the node need a re-check', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book({ checkSets: ['sources.citations'] });
  const { out } = await drive(folio, root, { node: 'membranes' }, answerer({ membranes: { draft: MEMBRANES, claims: MEMBRANE_CLAIMS } }));
  assert.equal(out.status, 'done');
  const clean = await ok(folio.call('folio_status', { root }));
  assert.deepEqual([clean.stale, clean.evidence], [[], { stale: [], total: 2 }]);

  const meta = join(root, 'sources', 'cell-notes.yaml');
  await writeFile(meta, (await readFile(meta, 'utf8')).replace('reliability: medium', 'reliability: high'));
  const stale = (await ok(folio.call('folio_status', { root }))).stale;
  assert.deepEqual(stale.map((s) => [s.nodeId, s.reasons.map((r) => [r.kind, r.id])]), [['membranes', [['source', 'cell-notes']]]]);

  const file = join(root, 'tree', '01-part-basics', '01-chapter-cells', '02-membranes.md');
  await writeFile(file, (await readFile(file, 'utf8')).replace('막을 지나는 물질은 ATP를 쓴다', '막을 지나는 물질은 에너지를 쓴다'));
  // 근거 stale 의 정본 자리는 folio_status 다(결정 19). 다른 "다시 확인 필요"와 한 번에 본다.
  const edited = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(edited.evidence, { stale: [{ nodeId: 'membranes', quote: '막을 지나는 물질은 ATP를 쓴다', reason: 'QUOTE_MISSING' }], total: 2 });
  assert.deepEqual(edited.stale.map((s) => s.nodeId), ['membranes']);
  assert.deepEqual((await ok(folio.call('folio_sources', { root, op: 'get', id: 'cell-notes' }))).links.map((l) => [l.quote, l.status, l.reason]), [
    ['막을 지나는 물질은 ATP를 쓴다', 'stale', 'QUOTE_MISSING'],
  ]);
  // 작가·호스트가 지금 본문으로 다시 이으면 stale 이 풀린다
  const relinked = [{ quote: '막을 지나는 물질은 에너지를 쓴다', sources: [] }];
  assert.equal((await ok(folio.call('folio_sources', { root, op: 'link', nodeId: 'membranes', claims: relinked }))).accepted, 1);
  assert.deepEqual((await ok(folio.call('folio_status', { root }))).evidence, { stale: [], total: 1 });
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N2-6 sets or toggles turned off stop the sources checks; the locks stay', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const script = answerer({ membranes: { draft: MEMBRANES, claims: MEMBRANE_CLAIMS } });
  const none = await book({ checkSets: [] });
  const first = await drive(folio, none, { node: 'membranes' }, script, untilUser);
  assert.deepEqual(findingsOf(first.out), []);
  await ok(folio.call('folio_decide', { root: none, runId: first.out.runId, action: 'approve' }));
  assert.deepEqual((await receiptOf(none, 'membranes')).appliedChecks.map((a) => a.checkId), ['core.promise-order']);

  const off = await book({ checkSets: ['sources.citations'], features: { evidence: false, sources: false } });
  const second = await drive(folio, off, { node: 'membranes' }, script, untilUser);
  assert.deepEqual(second.requests.find((r) => r.stepId === 'extract').payload.evidence, { wanted: false });
  assert.deepEqual(findingsOf(second.out), []);
  assert.equal((await folio.call('folio_sources', { root: off, op: 'list' })).error.code, 'FEATURE_DISABLED');

  const locked = await book({ checkSets: [], features: { sources: false, evidence: false, occurrences: false, recommit: false } });
  const events = [{ entityId: 'energy-detail', kind: 'promise.resolved', quote: 'ATP는 세포가 쓰는 에너지 화폐다' }];
  const hard = await drive(folio, locked, { node: 'atp-section' }, answerer({ 'atp-section': { draft: 'ATP는 세포가 쓰는 에너지 화폐다.\n', events } }), untilUser);
  assert.equal(label(hard.out), 'user:blocked');
  assert.deepEqual([hard.out.question.canApprove, findingsOf(hard.out).map((f) => [f[0], f[1], f[3]])], [false, [['core.promise-order', 'PROMISE_RESOLVED_BEFORE_PLANT', 'hard']]]);
  const refused = await folio.call('folio_decide', { root: locked, runId: hard.out.runId, action: 'approve', reason: '괜찮다' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'APPROVE_BLOCKED_BY_HARD']);
  for (const [config, want] of [[{ checks: { 'core.promise-order': { mode: 'off' } } }, 'LOCKED_CHECK_OVERRIDE'], [{ features: { locks: false } }, 'FEATURE_UNKNOWN']]) {
    const out = await folio.call('folio_run', { root: await book(config), node: 'membranes' });
    assert.deepEqual([out.error.code, out.error.details.errors.map((e) => e.code)], ['CONFIG_INVALID', [want]], JSON.stringify(config));
  }
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N2-7 the root plan request of a sourcebook work carries the sources, then is checked and approved like any plan', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = join(await tempDir('folio-n2-'), '세포 자료집');
  assert.equal((await ok(folio.call('folio_init', { root, title: '세포 자료집', preset: 'sourcebook', packs: ['knowledge', 'sources'] }))).created, true);
  await ok(folio.call('folio_sources', { root, op: 'add', id: 'history-notes', title: '세포 발견사', reliability: 'high', spans: [{ id: 'hooke', quote: '1665년에 코르크에서 세포를 처음 관찰했다' }], text: '로버트 훅은 1665년에 코르크에서 세포를 처음 관찰했다.\n' }));
  await ok(folio.call('folio_structure', { root, op: 'add', level: 'part', id: 'part-1', title: '1부 세포의 발견' }));
  // 작가가 맨 위 노드 앞머리에 자료를 적는다(손 작업)
  const node = (await ok(folio.call('folio_find', { root, query: 'node', id: 'part-1' }))).node;
  const file = join(root, 'tree', node.path);
  await writeFile(file, (await readFile(file, 'utf8')).replace('status: draft\n', 'status: draft\nsources: [history-notes]\n'));
  const { labels, requests } = await drive(folio, root, { node: 'part-1' }, answerer(), (o) => o.status === 'needs_model' && o.requests[0].stepId === 'children');
  assert.deepEqual(labels, ['model:plan', 'user:approve', 'model:children']);
  const plan = requests.find((r) => r.stepId === 'plan').payload;
  assert.deepEqual(plan.sources.map(({ rev: _rev, contentHash: _hash, ...source }) => source), [{ id: 'history-notes', title: '세포 발견사', date: null, reliability: 'high', spans: [{ id: 'hooke', quote: '1665년에 코르크에서 세포를 처음 관찰했다' }] }]);
  assert.match(plan.instructions, /`sources`/);
  assert.doesNotMatch(folio.stderr(), /Error/);
});
