import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { openWork } from '../../core/store/work.js';
import { recordRunEvidence } from '../../core/evidence/record-run.js';
import { readEvidence } from '../../core/evidence/records.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { validateClaims } from '../../core/evidence/validate.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

const CLAIM = { quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: 'ATP는 세포의 에너지 화폐로 불린다.' }] };
async function changeSource(root) {
  const path = join(root, 'sources', 'cell-notes.txt');
  await writeFile(path, await readFile(path, 'utf8') + '\n합성 변경.\n');
}

test('an outstanding extract answer is dropped after the source bytes change', async () => {
  const root = await copyFixture('knowledge-book'); await useFakePack(root);
  const path = join(root, 'work.yaml'); const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, packs: ['fake', 'sources'] }));
  const packs = new Map([...fakePacks(), ['sources', { name: 'sources' }]]);
  const make = () => createRunner({ root, packs });
  const host = createFakeHost({ drafts: { 'atp-section': 'ATP는 세포가 쓰는 에너지 화폐다.' } });
  const asked = (await driveToEnd(make, host, { start: { node: 'atp-section' }, until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'extract' })).at(-1);
  const old = asked.requests[0]; await changeSource(root);
  const again = await make().resume({ runId: asked.runId, answers: { [old.requestId]: JSON.stringify({ events: [], claims: [CLAIM] }) } });
  assert.equal(again.requests[0].stepId, 'extract');
  assert.notEqual(again.requests[0].requestId, old.requestId);
  assert.notEqual(again.requests[0].payload.sourceVersions[0].rev, old.payload.sourceVersions[0].rev);
  assert.deepEqual(await readEvidence(root), []);
});

test('recording extracted evidence never silently rebinds it to a newer source', async () => {
  const root = await copyFixture('knowledge-book'); const work = await openWork(root);
  const draft = work.tree.nodes.get('atp-section').body;
  const { claims } = validateClaims(work, draft, [CLAIM]);
  const run = { runId: 'synthetic', nodeId: 'atp-section', draftHash: sha256(draft), outputs: { draft, events: { submittedClaims: true, claims } } };
  await changeSource(root);
  await assert.rejects(recordRunEvidence({ ledger: openLedger(root, 'evidence'), ctx: { work: await openWork(root) }, run, receiptId: 'synthetic' }), { code: 'EVIDENCE_INVALID' });
  assert.deepEqual(await readEvidence(root), []);
});

test('legacy in-flight evidence without a source version is not rebound on recording', async () => {
  const root = await copyFixture('knowledge-book'); const work = await openWork(root);
  const draft = work.tree.nodes.get('atp-section').body;
  const run = { runId: 'legacy', nodeId: 'atp-section', draftHash: sha256(draft), outputs: { draft, events: { submittedClaims: true, claims: [CLAIM] } } };
  await changeSource(root);
  await assert.rejects(recordRunEvidence({ ledger: openLedger(root, 'evidence'), ctx: { work: await openWork(root) }, run, receiptId: 'legacy' }), { code: 'EVIDENCE_INVALID' });
  assert.deepEqual(await readEvidence(root), []);
});
