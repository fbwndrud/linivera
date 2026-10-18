import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture } from '../support/fixtures.js';

const CLAIM = { quote: 'ATP는 세포가 쓰는 에너지 화폐다', basis: 'attributed', perspectiveId: 'atp', sources: [{ sourceId: 'cell-notes', quote: 'ATP는 세포의 에너지 화폐로 불린다.' }] };

test('public source tools preserve perspective and expose a changed-source re-link reason', async () => {
  const root = await copyFixture('knowledge-book');
  const tools = createToolbox({ packs: await loadBuiltinPacks() });
  const call = async (op, args = {}) => {
    const out = await tools.call('folio_sources', { root, op, ...args });
    assert.equal(out.ok, true, JSON.stringify(out)); return out.result;
  };
  await call('link', { nodeId: 'atp-section', claims: [CLAIM] });
  const initial = await call('get', { id: 'cell-notes' });
  assert.equal(initial.links[0].basis, 'attributed');
  assert.equal(initial.links[0].perspectiveId, 'atp');
  assert.equal(initial.links[0].sources[0].sourceHash, initial.source.contentHash);
  const path = join(root, 'sources', 'cell-notes.txt');
  await writeFile(path, await readFile(path, 'utf8') + '\n합성 정정 사항.\n');
  const changed = await call('get', { id: 'cell-notes' });
  assert.equal(changed.links[0].sources[0].verified, false);
  assert.equal(changed.links[0].sources[0].reason, 'SOURCE_REV_CHANGED');
  assert.equal((await call('list')).evidence.stale[0].reason, 'SOURCE_REV_CHANGED');
  await call('link', { nodeId: 'atp-section', claims: [CLAIM] });
  assert.deepEqual((await call('list')).evidence.stale, []);
});
