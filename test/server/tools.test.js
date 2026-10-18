import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { BASE_TOOL_NAMES, TOOLS } from '../../server/tools/definitions.js';
import { validateInput } from '../../server/validate-input.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture, seedEvents, tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

const box = async () => createToolbox({ packs: await loadBuiltinPacks() });
const ok = (out) => {
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
};
const code = (out) => (out.ok ? 'ok' : out.error.code);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (path.endsWith('.js')) yield path;
  }
}

test('the tool list keeps existing names in order and adds author context tools and each tool requires an absolute root', () => {
  assert.deepEqual(BASE_TOOL_NAMES, ['folio_init', 'folio_status', 'folio_run', 'folio_resume', 'folio_decide', 'folio_structure', 'folio_find', 'folio_view']);
  assert.deepEqual(TOOLS.map((t) => t.name), [...BASE_TOOL_NAMES, 'folio_occurrences', 'folio_sources', 'folio_config', 'folio_assets', 'folio_tracking', 'folio_resources', 'folio_inputs', 'folio_policy', 'folio_operations', 'folio_resource_query', 'folio_embeddings', 'folio_image', 'folio_import_vibelore', 'folio_export', 'folio_lore', 'folio_interview']);
  for (const tool of TOOLS) {
    assert.ok(tool.inputSchema.required.includes('root'), tool.name);
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    assert.ok(tool.description.length > 0, tool.name);
  }
});

test('input validation names the path of every problem', () => {
  const schema = TOOLS.find((t) => t.name === 'folio_resume').inputSchema;
  assert.deepEqual(validateInput(schema, { root: '/w', runId: 'r', answers: { a: 1 }, extra: true }).map((e) => e.path), ['$.answers.a', '$.extra']);
  assert.deepEqual(validateInput(schema, { root: '/w' }).map((e) => [e.path, e.message]), [['$.runId', 'is required'], ['$.answers', 'is required']]);
  assert.deepEqual(validateInput({ type: 'integer', minimum: 0 }, -1).map((e) => e.message), ['must be >= 0']);
  assert.deepEqual(validateInput({ type: 'string', enum: ['a'] }, 'b').map((e) => e.message), ['must be one of a']);
});

test('the toolbox never throws: unknown tools, bad input and relative roots come back as errors', async () => {
  const tools = await box();
  assert.equal(code(await tools.call('folio_write', { root: '/w' })), 'TOOL_UNKNOWN');
  assert.equal(code(await tools.call('folio_run', { root: '/w', mode: 'fast' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_status', {})), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_status', { root: 'relative/work' })), 'ROOT_NOT_ABSOLUTE');
  assert.equal(code(await tools.call('folio_status', { root: join(await tempDir('folio-none-'), 'missing') })), 'WORK_NOT_FOUND');
  assert.equal(code(await tools.call('folio_view', { root: join(await tempDir('folio-none-'), 'missing') })), 'WORK_NOT_FOUND');
});

test('init, structure, run and status work together; structure refuses while a question is open', async () => {
  const tools = await box();
  const root = join(await tempDir('folio-tools-'), 'work');
  assert.equal(ok(await tools.call('folio_init', { root, title: '유리 등대', preset: 'serial' })).created, true);
  assert.equal(ok(await tools.call('folio_init', { root, title: '다른 제목', preset: 'serial' })).created, false);
  assert.equal(code(await tools.call('folio_structure', { root, op: 'add', level: 'arc' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_structure', { root, op: 'move', nodeId: 'x', level: 'arc' })), 'TOOL_INPUT_INVALID');
  const added = ok(await tools.call('folio_structure', { root, op: 'add', level: 'arc', id: 'arc-1', title: '첫 아크' }));
  assert.deepEqual(added.outline.map((n) => n.id), ['arc-1']);
  const asked = ok(await tools.call('folio_run', { root }));
  assert.equal(label(asked), 'model:plan');
  assert.equal(asked.requests[0].payload.node.id, 'arc-1');
  const status = ok(await tools.call('folio_status', { root }));
  assert.deepEqual(status.activeRun, { runId: asked.runId, nodeId: 'arc-1', state: 'awaiting_model' });
  assert.deepEqual(status.pending, JSON.parse(JSON.stringify(asked)));
  assert.equal(code(await tools.call('folio_structure', { root, op: 'add', level: 'arc', id: 'arc-2' })), 'STRUCTURE_RUN_OPEN');
  assert.equal(code(await tools.call('folio_resume', { root, runId: asked.runId, answers: {} })), 'ANSWERS_INCOMPLETE');
});

test('find reads nodes and entities, and usages and events from a fresh index', async () => {
  const tools = await box();
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  assert.equal(ok(await tools.call('folio_find', { root, query: 'node', id: 'ep-004' })).node.title, '4화');
  assert.equal(ok(await tools.call('folio_find', { root, query: 'entity', id: 'doyun' })).entity.kind, 'character');
  assert.ok(ok(await tools.call('folio_find', { root, query: 'usages', id: 'doyun' })).usages.some((u) => u.surfaceId === 'ep-004'));
  assert.deepEqual(ok(await tools.call('folio_find', { root, query: 'events', id: 'doyun' })).events, [{ eventId: 'seed-2', nodeId: 'ep-002', kind: 'state' }]);
  assert.equal(code(await tools.call('folio_find', { root, query: 'node', id: 'ep-999' })), 'NODE_NOT_FOUND');
  assert.equal(code(await tools.call('folio_find', { root, query: 'usages', id: 'nobody' })), 'ENTITY_NOT_FOUND');
});

test('config shows steps per level, sets and checks, and validates a check draft against this work', async () => {
  const tools = await box();
  const root = await copyFixture('serial-2level');
  const config = ok(await tools.call('folio_config', { root }));
  assert.deepEqual(Object.keys(config.pipelines), ['arc', 'episode']);
  assert.deepEqual(config.pipelines.episode.steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  assert.deepEqual(config.checkSets.filter((s) => s.selected).map((s) => s.id), ['novel.basic', 'novel.serial']);
  assert.ok(config.checks.some((c) => c.id === 'core.promise-order' && c.locked));
  assert.deepEqual(config.stages, { deterministic: ['facts'], model: ['critic', 'fit', 'review'] });
  assert.equal(config.checkDraft, undefined);
  const good = ok(await tools.call('folio_config', { root, checkDraft: { id: 'no-destiny', words: ['운명처럼'] } })).checkDraft;
  assert.equal(good.ok, true);
  const bad = ok(await tools.call('folio_config', { root, checkDraft: { id: 'no-destiny', words: ['운명처럼'], stage: 'critic' } })).checkDraft;
  assert.deepEqual(bad.errors.map((e) => e.code), ['USER_CHECK_STAGE_INVALID']);
});

test('config recommends by work kind and by node, and refuses an unknown node', async () => {
  const tools = await box();
  const root = await copyFixture('serial-2level');
  const withoutKind = ok(await tools.call('folio_config', { root }));
  assert.ok(!withoutKind.recommended.find((r) => r.setId === 'novel.serial')?.reasons.some((r) => r.kind === 'workKind'));
  const withKind = ok(await tools.call('folio_config', { root, workKind: 'serial' }));
  assert.deepEqual(withKind.nodeRecommendations, undefined);
  assert.ok(withKind.recommended.find((r) => r.setId === 'novel.serial').reasons.some((r) => r.kind === 'workKind' && r.value === 'serial'));
  const withNode = ok(await tools.call('folio_config', { root, node: 'ep-004' }));
  assert.equal(withNode.nodeRecommendations.nodeId, 'ep-004');
  assert.ok(withNode.nodeRecommendations.sets.some((s) => s.setId === 'novel.serial'));
  assert.equal(code(await tools.call('folio_config', { root, node: 'nope' })), 'NODE_NOT_FOUND');
});

const BANNED = [
  'core/run/commit.js', 'core/run/recheck-commit.js', 'core/structure/ops.js', 'core/ledger/ledger.js', 'core/store/tree.js', 'core/util/file-tx.js', 'core/util/file-tx-journal.js',
  // N2: 자료 원본·설명서 쓰기와 잠금 없이 근거 기록장에 쓰는 길. 서버는 스스로 작업 잠금을 잡는 addSource·submitEvidence 만 부른다.
  'core/store/sources.js', 'core/evidence/record-run.js',
  'core/store/assets.js', 'core/assets/records.js', 'core/assets/files.js',
  'core/image/commit.js',
];

test('server code never imports the commit path, the structure writers, the ledgers or the tree store directly', async () => {
  const offenders = [];
  let files = 0;
  for (const dir of ['server', 'bin']) {
    for await (const file of walk(dir)) {
      files += 1;
      const text = await readFile(file, 'utf8');
      for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        if (!spec.startsWith('.')) continue;
        const target = relative(process.cwd(), resolve(dirname(file), spec)).split(sep).join('/');
        if (BANNED.includes(target)) offenders.push(`${file} -> ${target}`);
      }
    }
  }
  assert.ok(files > 0);
  assert.deepEqual(offenders, []);
});

test('only server/ imports the MCP SDK', async () => {
  for (const dir of ['core', 'packs']) {
    for await (const file of walk(dir)) assert.doesNotMatch(await readFile(file, 'utf8'), /@modelcontextprotocol/, file);
  }
});

test('core error details such as hints pass through, and anything else becomes INTERNAL_ERROR', async () => {
  const { FolioError } = await import('../../core/errors.js');
  const logged = [];
  const tools = createToolbox({
    packs: new Map(),
    onError: (error) => { logged.push(String(error?.message ?? error)); },
    handlers: {
      folio_resume: async () => { throw new FolioError('ANSWER_STALE', 'config changed', { runId: 'run-1', hint: 'run folio_run again' }); },
      folio_status: async () => { throw new TypeError('boom'); },
      folio_find: () => { throw 'not an error'; },
    },
  });
  const stale = await tools.call('folio_resume', { root: '/w', runId: 'run-1', answers: {} });
  assert.deepEqual(stale.error.details, { runId: 'run-1', hint: 'run folio_run again' });
  assert.equal(stale.error.code, 'ANSWER_STALE');
  assert.deepEqual((await tools.call('folio_status', { root: '/w' })).error, { code: 'INTERNAL_ERROR', message: 'internal error (see the folio-mcp server log)', details: { errno: null } });
  assert.equal(code(await tools.call('folio_find', { root: '/w', query: 'node', id: 'x' })), 'INTERNAL_ERROR');
  assert.deepEqual(logged, ['boom', 'not an error'], 'the raw message stays on the server side');
  assert.equal(code(await tools.call('folio_status', 'not an object')), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_status', null)), 'TOOL_INPUT_INVALID');
});
