import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { submitEvidence } from '../../core/evidence/submit.js';
import { readEvidence } from '../../core/evidence/records.js';
import { openWork } from '../../core/store/work.js';
import { sha256 } from '../../core/util/hash.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture } from '../support/fixtures.js';

const NOTE = 'ATP는 세포의 에너지 화폐로 불린다.';
const GOOD = { quote: 'ATP는 세포가 쓰는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: NOTE }] };

test('submitEvidence records all of a node\'s claims or nothing', async () => {
  const root = await copyFixture('knowledge-book');
  const refused = await submitEvidence(root, { nodeId: 'atp-section', claims: [GOOD, { quote: '에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: '틀린 인용' }] }] }).catch((e) => e);
  assert.equal(refused.code, 'EVIDENCE_INVALID');
  assert.deepEqual(refused.details.errors, [{ index: 1, link: 0, code: 'CLAIM_SOURCE_QUOTE_NOT_FOUND', sourceId: 'cell-notes' }]);
  assert.deepEqual(await readEvidence(root), []);
  const out = await submitEvidence(root, { nodeId: 'atp-section', claims: [GOOD] }, { now: () => '2026-09-28T00:00:00.000Z' });
  const body = (await openWork(root)).tree.nodes.get('atp-section').body;
  assert.deepEqual(out, { nodeId: 'atp-section', textHash: sha256(body), accepted: 1, seq: 1 });
  const [record] = await readEvidence(root);
  assert.deepEqual([record.type, record.origin, record.at, record.claims[0].sources.map(({ sourceId, quote }) => ({ sourceId, quote }))], ['evidence', 'tool', '2026-09-28T00:00:00.000Z', GOOD.sources]);
  assert.equal((await submitEvidence(root, { nodeId: 'atp-section', claims: [] })).accepted, 0);
  assert.equal((await readEvidence(root)).length, 2);
});

test('submitEvidence needs both the sources and the evidence features, and a real node', async () => {
  for (const features of [{ sources: false }, { evidence: false }]) {
    const root = await copyFixture('knowledge-book');
    const path = join(root, 'work.yaml');
    await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
    const error = await submitEvidence(root, { nodeId: 'atp-section', claims: [GOOD] }).catch((e) => e);
    assert.deepEqual([error.code, error.details.feature], ['FEATURE_DISABLED', Object.keys(features)[0]]);
  }
  const root = await copyFixture('knowledge-book');
  for (const nodeId of ['ghost', '__proto__', 7]) assert.equal((await submitEvidence(root, { nodeId, claims: [] }).catch((e) => e)).code, 'NODE_NOT_FOUND', String(nodeId));
});
