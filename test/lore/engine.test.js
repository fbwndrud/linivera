import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { copyFixture } from '../support/fixtures.js';
import { openWork } from '../../core/store/work.js';
import { loreCommand } from '../../core/lore/commands.js';

const author = { id: 'author-fact', basis: 'author', text: '합성 에너지는 푸르다.' };
const claim = { id: 'energy-color', entityId: 'atp', text: '합성 에너지는 푸르다.', status: 'adopted', support: ['author-fact'] };
const snapshot = () => ({ evidence: [author], claims: [claim], questions: [] });
async function publish(root, data, expectedRev = null) {
  const proposed = await loreCommand(root, { op: 'propose', expectedRev, snapshot: data });
  return loreCommand(root, { op: 'decide', expectedRev, proposalId: proposed.proposalId, action: 'approve', decision: '작가의 합성 승인' });
}

test('a proposal is not canon; explicit author adoption publishes an immutable revision', async () => {
  const root = await copyFixture('knowledge-book');
  const p = await loreCommand(root, { op: 'propose', expectedRev: null, snapshot: snapshot() });
  assert.equal((await loreCommand(root, { op: 'get' })).revision, null);
  assert.equal((await loreCommand(root, { op: 'get', proposalId: p.proposalId })).snapshot.claims[0].text, claim.text);
  const published = await loreCommand(root, { op: 'decide', expectedRev: null, proposalId: p.proposalId, action: 'approve', decision: '작가 승인' });
  const current = await loreCommand(root, { op: 'get' });
  assert.equal(current.revision, published.revision);
  assert.equal(current.canon[0].id, claim.id);
  const pinned = await loreCommand(root, { op: 'get', revision: published.revision });
  await publish(root, { ...snapshot(), claims: [{ ...claim, status: 'superseded' }] }, published.revision);
  assert.deepEqual(await loreCommand(root, { op: 'get', revision: published.revision }), pinned);
});

test('private evidence, inference, dependency cycles and unsupported verified resolutions cannot establish world truth', async () => {
  const root = await copyFixture('knowledge-book');
  for (const data of [
    { evidence: [{ ...author, perspectiveId: 'atp' }], claims: [claim] },
    { evidence: [{ ...author, basis: 'inferred', limitations: '합성 추론' }], claims: [claim] },
    { evidence: [{ id: 'a', basis: 'derived', text: 'a', dependencies: ['b'] }, { id: 'b', basis: 'derived', text: 'b', dependencies: ['a'] }] },
    { questions: [{ id: 'q', text: '합성 질문', status: 'resolved', resolution: { basis: 'verified', reason: '근거 없는 해소' } }] },
  ]) await assert.rejects(publish(root, data), (e) => e.code.startsWith('LORE_'));
  assert.equal((await loreCommand(root, { op: 'get' })).revision, null);
});

test('source edits invalidate current support while pinned history survives missing original files', async () => {
  const root = await copyFixture('knowledge-book'); const work = await openWork(root);
  const data = { evidence: [{ id: 'text-proof', basis: 'explicit', text: '합성 인용', anchor: { kind: 'source', id: 'cell-notes', rev: work.sources.get('cell-notes').rev, quote: 'ATP는 세포의 에너지 화폐로 불린다.' } }], claims: [{ ...claim, support: ['text-proof'] }] };
  const { revision } = await publish(root, data);
  const pinned = await loreCommand(root, { op: 'get', revision });
  const path = join(root, 'sources', 'cell-notes.txt');
  await writeFile(path, await readFile(path, 'utf8') + '\n합성 정정\n');
  const current = await loreCommand(root, { op: 'get' });
  assert.deepEqual(current.canon, []); assert.deepEqual(current.staleAdopted, [claim.id]);
  await rm(join(root, 'sources'), { recursive: true });
  assert.deepEqual(await loreCommand(root, { op: 'get', revision }), pinned);
});

test('source changes between proposal and approval are refused without adoption', async () => {
  const root = await copyFixture('knowledge-book'); const work = await openWork(root);
  const p = await loreCommand(root, { op: 'propose', expectedRev: null, snapshot: { evidence: [{ id: 's', basis: 'explicit', text: '인용', anchor: { kind: 'source', id: 'cell-notes', rev: work.sources.get('cell-notes').rev, quote: 'ATP는 세포의 에너지 화폐로 불린다.' } }] } });
  const path = join(root, 'sources', 'cell-notes.txt'); await writeFile(path, await readFile(path, 'utf8') + '\n수정\n');
  await assert.rejects(loreCommand(root, { op: 'decide', expectedRev: null, proposalId: p.proposalId, action: 'approve', decision: '합성 승인' }), { code: 'LORE_ANCHOR_STALE' });
  assert.equal((await loreCommand(root, { op: 'get' })).revision, null);
});

test('derived support requires every dependency and private perspectives remain separate', async () => {
  const root = await copyFixture('knowledge-book');
  const evidence = [author, { id: 'guess', basis: 'inferred', text: '추측', limitations: '확정 아님' }, { id: 'rule', basis: 'derived', text: '합성 규칙', dependencies: ['author-fact', 'guess'] }];
  await assert.rejects(publish(root, { evidence, claims: [{ ...claim, support: ['rule'] }] }), { code: 'LORE_SUPPORT_REQUIRED' });
  const privateEvidence = { ...author, perspectiveId: 'atp' };
  const own = { ...claim, perspectiveId: 'atp' };
  await publish(root, { evidence: [privateEvidence], claims: [own] });
  const current = await loreCommand(root, { op: 'get' });
  assert.deepEqual(current.canon, []); assert.equal(current.perspectives[0].perspectiveId, 'atp');
  await assert.rejects(publish(root, { evidence: [privateEvidence], claims: [{ ...own, id: 'other-belief', perspectiveId: 'membrane' }] }, current.revision), { code: 'LORE_SUPPORT_REQUIRED' });
});

test('published IDs cannot be reused for a different meaning and decisions use the current revision', async () => {
  const root = await copyFixture('knowledge-book'); const first = await publish(root, snapshot());
  await assert.rejects(publish(root, { ...snapshot(), claims: [{ ...claim, text: '다른 의미' }] }, first.revision), { code: 'LORE_ID_REUSED' });
  const p = await loreCommand(root, { op: 'propose', expectedRev: first.revision, snapshot: snapshot() });
  const next = await publish(root, { ...snapshot(), questions: [{ id: 'q', text: '비필수 모순 질문', support: ['author-fact'], status: 'resolved', resolution: { basis: 'verified', reason: '작가가 근거를 검토함' } }] }, first.revision);
  await assert.rejects(loreCommand(root, { op: 'decide', expectedRev: first.revision, proposalId: p.proposalId, action: 'approve', decision: '오래된 승인' }), { code: 'LORE_REV_STALE' });
  assert.equal((await loreCommand(root, { op: 'get' })).revision, next.revision);
});

test('an orphan commit record cannot substitute for a real checked manuscript receipt', async () => {
  const { openLedger } = await import('../../core/ledger/ledger.js');
  const { sha256 } = await import('../../core/util/hash.js');
  const root = await copyFixture('knowledge-book'); const work = await openWork(root);
  const node = work.tree.nodes.get('atp-section');
  await openLedger(root, 'receipts').append({ type: 'commit', receiptId: 'missing-receipt', nodeId: node.id, committedHash: sha256(node.body) });
  await assert.rejects(publish(root, { evidence: [{ id: 'orphan-proof', basis: 'explicit', text: '확정되지 않은 원고', anchor: { kind: 'node', id: node.id, rev: sha256(node.body), quote: 'ATP는 세포가 쓰는 에너지 화폐다' } }], claims: [{ ...claim, support: ['orphan-proof'] }] }), (e) => e.code.startsWith('LORE_'));
  assert.equal((await loreCommand(root, { op: 'get' })).revision, null);
});

test('losing only an original source file leaves current lore inspectable and marks adopted support stale', async () => {
  const root = await copyFixture('knowledge-book'); const work = await openWork(root);
  const { revision } = await publish(root, { evidence: [{ id: 'proof', basis: 'explicit', text: '합성 근거', anchor: { kind: 'source', id: 'cell-notes', rev: work.sources.get('cell-notes').rev, quote: 'ATP는 세포의 에너지 화폐로 불린다.' } }], claims: [{ ...claim, support: ['proof'] }] });
  const pinned = await loreCommand(root, { op: 'get', revision });
  await rm(join(root, 'sources', 'cell-notes.txt'));
  const current = await loreCommand(root, { op: 'get' });
  assert.deepEqual(current.staleEvidence, ['proof']); assert.deepEqual(current.staleAdopted, [claim.id]); assert.deepEqual(current.canon, []);
  assert.deepEqual(await loreCommand(root, { op: 'get', revision }), pinned);
  await assert.rejects(openWork(root), { code: 'WORK_INVALID' }, 'ordinary writing still refuses missing source files');
});


test('a checked and committed manuscript can support canon, and later edits invalidate only current support', async () => {
  const { createRunner } = await import('../../core/run/runner.js');
  const { useFakePack, fakePacks } = await import('../support/fixtures.js');
  const { createFakeHost, driveToEnd } = await import('../support/fake-host.js');
  const { sha256 } = await import('../../core/util/hash.js');
  const root = await copyFixture('knowledge-book'); await useFakePack(root);
  const make = () => createRunner({ root, packs: fakePacks() });
  await driveToEnd(make, createFakeHost({ drafts: { 'atp-section': '합성 에너지는 푸르다.' } }), { start: { node: 'atp-section' }, until: (o) => o.status === 'done' });
  const work = await openWork(root); const node = work.tree.nodes.get('atp-section');
  const { revision } = await publish(root, { evidence: [{ id: 'manuscript', basis: 'explicit', text: '확정 원고의 서술', anchor: { kind: 'node', id: node.id, rev: sha256(node.body), quote: '합성 에너지는 푸르다.' } }], claims: [{ ...claim, support: ['manuscript'] }] });
  assert.equal((await loreCommand(root, { op: 'get' })).canon[0].id, claim.id);
  const pinned = await loreCommand(root, { op: 'get', revision });
  const path = join(root, 'tree', node.path);
  await writeFile(path, (await readFile(path, 'utf8')).replace('푸르다', '붉다'));
  assert.deepEqual((await loreCommand(root, { op: 'get' })).staleAdopted, [claim.id]);
  assert.deepEqual(await loreCommand(root, { op: 'get', revision }), pinned);
});
