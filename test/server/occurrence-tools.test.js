import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { TOOLS } from '../../server/tools/definitions.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';

const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => out.error?.code;

test('twenty-three tools, and folio_occurrences is one of them', () => {
  assert.equal(TOOLS.length, 23);
  assert.ok(TOOLS.some((t) => t.name === 'folio_occurrences'));
});

test('submit, usages with marks, candidates, rename plan and apply through the toolbox', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const tools = createToolbox({ packs: fakePacks() });
  ok(await tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] }));
  const usages = ok(await tools.call('folio_find', { root, query: 'usages', id: 'hana' }));
  assert.deepEqual(usages.marks.map((m) => [m.surfaceId, m.status]), [['ep-001', 'located']]);
  const candidates = ok(await tools.call('folio_find', { root, query: 'candidates', id: 'ep-003' }));
  assert.deepEqual(candidates.candidates.map((c) => c.entityId), ['hana']);
  const plan = ok(await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' }));
  assert.equal(plan.files.every((f) => !('text' in f)), true);
  assert.equal(code(await tools.call('folio_occurrences', { root, op: 'rename', entityId: 'hana', newName: '세라', planDigest: 'sha256:00' })), 'RENAME_PLAN_STALE');
  const applied = ok(await tools.call('folio_occurrences', { root, op: 'rename', entityId: 'hana', newName: '세라', planDigest: plan.planDigest }));
  assert.equal(applied.applied, true);
  assert.match(await readFile(join(root, 'entities', 'character', 'hana.md'), 'utf8'), /name: 세라/);
});

test('argument shapes are checked per op, and schema limits apply', async () => {
  const root = await copyFixture('serial-2level');
  const tools = createToolbox({ packs: fakePacks() });
  assert.equal(code(await tools.call('folio_occurrences', { root, op: 'submit', items: [] })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_occurrences', { root, op: 'rename', entityId: 'hana', newName: 'x' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: 'x'.repeat(501) }] })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_structure', { root, op: 'move', nodeId: 'ep-001', index: 100001 })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_find', { root, query: 'rename', id: 'hana' })), 'TOOL_INPUT_INVALID');
});

test('folio_run accepts recommit and folio_init accepts features', () => {
  const run = TOOLS.find((t) => t.name === 'folio_run');
  assert.deepEqual(run.inputSchema.properties.mode.enum, ['normal', 'recheck', 'recommit', 'tracking-backfill']);
  const init = TOOLS.find((t) => t.name === 'folio_init');
  assert.equal(init.inputSchema.properties.features.type, 'object');
  assert.deepEqual(init.inputSchema.properties.features.additionalProperties, { type: 'boolean' });
});
