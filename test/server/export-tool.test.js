import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VIBELORE_FIXTURE, treeHashes } from '../support/import-source.js';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { featuresDigest } from '../../core/work/features.js';
import { openWork } from '../../core/store/work.js';
import { exportFixture, sourceSnapshot } from '../support/export-work.js';
import { editYaml } from '../support/recheck.js';
test('마지막 folio_export 도구는 check를 읽기만 수행하고 web/epub을 새 외부 폴더에 낸다', async (t) => {
  const f = await exportFixture(t), tools = createToolbox({ packs: await loadBuiltinPacks() }), before = await sourceSnapshot(f.root);
  assert.equal(tools.tools.length, 23); assert.equal(tools.tools.at(-1).name, 'folio_export');
  const checked = await tools.call('folio_export', { root: f.root, op: 'check' }); assert.equal(checked.ok, true); assert.equal(checked.result.nodes, 4);
  assert.equal((await tools.call('folio_export', { root: f.root, op: 'check', language: 'en-US' })).result.language, 'en-US');
  assert.equal((await tools.call('folio_export', { root: f.root, op: 'check', language: '한국어' })).error.code, 'EXPORT_LANGUAGE_INVALID');
  assert.deepEqual(await sourceSnapshot(f.root), before);
  for (const format of ['web', 'epub']) {
    const out = await tools.call('folio_export', { root: f.root, format, output: f.output(format) }); assert.equal(out.ok, true); assert.equal(out.result.format, format);
    assert.equal((await stat(join(out.result.output, 'manifest.json'))).isFile(), true);
    if (format === 'epub') assert.equal((await stat(join(out.result.output, 'book.epub'))).isFile(), true);
    assert.deepEqual(await sourceSnapshot(f.root), before);
  }
  const pdf = await tools.call('folio_export', { root: f.root, format: 'pdf', output: f.output('pdf') }); assert.equal(pdf.error.code, 'TOOL_INPUT_INVALID');
  const missing = await tools.call('folio_export', { root: f.root }); assert.equal(missing.error.code, 'TOOL_INPUT_INVALID');
});
test('export/layout 토글은 잠금·실행 digest를 바꾸지 않고 명시적으로 적용된다', async (t) => {
  const f = await exportFixture(t), tools = createToolbox({ packs: await loadBuiltinPacks() });
  const work = await openWork(f.root), beforeDigest = featuresDigest(work.config.features);
  await writeFile(join(f.root, 'layout.yaml'), 'version: [broken');
  await editYaml(f.root, (config) => { config.features = { layout: false }; });
  const off = await tools.call('folio_export', { root: f.root, op: 'check' }); assert.equal(off.ok, true); assert.ok(off.result.warnings.some((w) => w.code === 'LAYOUT_DISABLED'));
  assert.equal(featuresDigest((await openWork(f.root)).config.features), beforeDigest);
  const original = await readFile(join(f.root, 'layout.yaml'), 'utf8'); assert.equal(original, 'version: [broken');
  await editYaml(f.root, (config) => { config.features.export = false; });
  assert.equal((await tools.call('folio_export', { root: f.root, op: 'check' })).error.code, 'FEATURE_DISABLED');
  assert.equal(featuresDigest((await openWork(f.root)).config.features), beforeDigest);
});

test('합성 M7b 가져오기 뒤 그림·원고·가져오기 기록은 웹 내보내기에서도 보존된다', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'folio-import-export-')); t.after(() => rm(parent, { recursive: true, force: true }));
  const tools = createToolbox({ packs: await loadBuiltinPacks() }), beforeSource = await treeHashes(VIBELORE_FIXTURE);
  const imported = await tools.call('folio_import_vibelore', { root: join(parent, 'work'), from: VIBELORE_FIXTURE }); assert.equal(imported.ok, true);
  const root = imported.result.root, before = await sourceSnapshot(root);
  const out = await tools.call('folio_export', { root, output: join(parent, 'publication') }); assert.equal(out.ok, true, JSON.stringify(out.error));
  const manifest = JSON.parse(await readFile(join(out.result.output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.assets.length, 2); assert.ok(manifest.warnings.some((w) => w.code === 'EXPORT_UNVERIFIED'));
  const html = await readFile(join(out.result.output, 'index.html'), 'utf8'); assert.ok(html.includes('images/image-0.svg')); assert.ok(html.includes('images/image-1.svg'));
  assert.deepEqual(await sourceSnapshot(root), before); assert.deepEqual(await treeHashes(VIBELORE_FIXTURE), beforeSource);
});
