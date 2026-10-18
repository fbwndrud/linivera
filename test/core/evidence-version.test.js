import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { copyFixture } from '../support/fixtures.js';
import { openWork } from '../../core/store/work.js';
import { submitEvidence } from '../../core/evidence/submit.js';
import { readEvidence } from '../../core/evidence/records.js';
import { evidenceStates } from '../../core/evidence/state.js';
import { evidenceStatus } from '../../core/evidence/status.js';
import { claimsFor } from '../../core/evidence/scope.js';

const CLAIM = { quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: 'ATP는 세포의 에너지 화폐로 불린다.' }] };

test('a changed source cannot keep old evidence verified even if the quote survives', async () => {
  const root = await copyFixture('knowledge-book');
  await submitEvidence(root, { nodeId: 'atp-section', claims: [{ ...CLAIM, basis: 'inferred' }] });
  const records = await readEvidence(root); const before = await openWork(root);
  const link = records[0].claims[0].sources[0];
  assert.equal(link.sourceRev, before.sources.get('cell-notes').rev);
  assert.match(link.sourceHash, /^sha256:/);
  assert.equal(records[0].claims[0].basis, 'inferred');
  assert.equal(evidenceStates(before, records)[0].sources[0].verified, true);
  const path = join(root, 'sources', 'cell-notes.txt');
  await writeFile(path, await readFile(path, 'utf8') + '\n사용 범위 변경.\n');
  const after = await openWork(root);
  assert.equal(evidenceStates(after, records)[0].sources[0].verified, false);
  assert.equal((await evidenceStatus(root, after)).stale[0].reason, 'SOURCE_REV_CHANGED');
  assert.deepEqual(claimsFor({ work: after, records, nodeId: 'atp-section', draft: after.tree.nodes.get('atp-section').body, extracted: null })[0].sources, []);
  assert.deepEqual(await readEvidence(root), records, 'sealed evidence history remains untouched');
});

test('attributed claims require a known perspective and legacy links remain unversioned', async () => {
  const root = await copyFixture('knowledge-book'); const work = await openWork(root);
  await assert.rejects(submitEvidence(root, { nodeId: 'atp-section', claims: [{ ...CLAIM, basis: 'attributed' }] }), { code: 'EVIDENCE_INVALID' });
  const records = [{ type: 'evidence', nodeId: 'atp-section', claims: [CLAIM] }];
  const [state] = evidenceStates(work, records);
  assert.equal(state.sources[0].verified, false);
  assert.equal(state.sources[0].reason, 'SOURCE_VERSION_UNKNOWN');
  assert.equal(records[0].claims[0].sources[0].sourceRev, undefined);
});

test('bound source spans and hashes cannot be forged or rebound during validation', async () => {
  const { validateClaims } = await import('../../core/evidence/validate.js');
  const root = await copyFixture('knowledge-book'); const work = await openWork(root);
  const body = work.tree.nodes.get('atp-section').body;
  const { claims } = validateClaims(work, body, [CLAIM]); const link = claims[0].sources[0];
  for (const changed of [{ sourceHash: `sha256:${'0'.repeat(64)}` }, { span: { kind: 'text', start: 999, end: 1000 } }, { sourceRev: undefined }]) {
    assert.equal(validateClaims(work, body, [{ ...claims[0], sources: [{ ...link, ...changed }] }]).errors.length, 1);
  }
  const attributed = validateClaims(work, body, [{ ...CLAIM, basis: 'attributed', perspectiveId: 'atp' }]);
  assert.equal(attributed.errors.length, 0);
  assert.equal(attributed.claims[0].perspectiveId, 'atp');
  assert.equal(attributed.claims[0].basis, 'attributed');
});
