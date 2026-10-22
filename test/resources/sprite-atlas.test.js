import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';

const frame = (x, duration) => ({ frame: { x, y: 0, w: 8, h: 8 }, rotated: false, trimmed: true,
  spriteSourceSize: { x: 2, y: 3, w: 8, h: 8 }, sourceSize: { w: 16, h: 16 }, duration });
const atlas = () => ({ frames: { 'idle/0': frame(0, 80), 'idle/1': frame(8, 120) }, meta: { image: 'sheet.png', size: { w: 16, h: 8 }, scale: '1',
  frameTags: [{ name: 'idle', from: 0, to: 1, direction: 'pingpong', repeat: '2' }] } });

test('Aseprite hash and array atlases retain sheet references, trim rectangles, milliseconds and tag frame links', async (t) => {
  const f = await scopedFixture(t);
  for (const mode of ['hash', 'array']) {
    const value = atlas(); if (mode === 'array') value.frames = Object.entries(value.frames).map(([filename, entry]) => ({ filename, ...entry }));
    const source = await f.resource('atlas-' + mode, value);
    const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'aseprite' });
    assert.deepEqual(structure.references, [{ key: '/meta/image', unitId: '/meta', role: 'sprite-sheet', hint: 'sheet.png', required: true }]);
    const frames = structure.units.filter((unit) => unit.kind === 'sprite-frame');
    assert.deepEqual(frames.map((unit) => [unit.name, unit.durationMs]), [['idle/0', 80], ['idle/1', 120]]);
    assert.deepEqual(frames[0].spriteSourceSize, { x: 2, y: 3, w: 8, h: 8 });
    const tag = structure.units.find((unit) => unit.kind === 'animation-tag');
    assert.deepEqual([tag.from, tag.to, tag.direction, tag.repeat], [0, 1, 'pingpong', '2']);
    assert.equal(structure.links.filter((link) => link.kind === 'tag-frame').length, 2);
    const sheet = await f.resource('sheet', 'synthetic sheet');
    const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'atlas-map', sourceRevisionId: source.revisionId, format: 'aseprite',
      structureBindings: [{ referenceKey: '/meta/image', revisionId: sheet.revisionId }] });
    assert.deepEqual(JSON.parse((await f.store.readContent(map.revisionId)).toString()).unresolvedReferenceKeys, []);
  }
});

test('invalid atlas geometry fails while ambiguous numeric, layered or partial tag order stays unknown', async (t) => {
  const f = await scopedFixture(t);
  for (const mutate of [(v) => { v.frames['idle/0'].frame.x = 12; }, (v) => { v.frames['idle/0'].spriteSourceSize.w = 20; },
    (v) => { v.frames['idle/0'].duration = -1; }, (v) => { v.meta.frameTags[0].to = -1; }]) {
    const value = atlas(); mutate(value); const source = await f.resource('bad', value);
    await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'aseprite' }), { code: 'STRUCTURE_INVALID' });
  }
  for (const mutate of [(v) => { v.frames = { 1: frame(0, 80), 0: frame(8, 120) }; },
    (v) => { v.meta.layers = [{ name: 'a' }, { name: 'b' }]; }, (v) => { v.meta.frameTags[0].to = 20; }]) {
    const value = atlas(); mutate(value); const source = await f.resource('ambiguous', value);
    const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'aseprite' });
    assert.equal(structure.links.filter((link) => link.kind === 'tag-frame').length, 0);
    assert.ok(structure.coverage.unknown.some((item) => item.includes('Unresolved tag')));
  }
});
