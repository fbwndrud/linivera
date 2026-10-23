import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';

test('OTIO mixed-rate clips, gap and transition match independently generated official library ranges', async (t) => {
  const f = await scopedFixture(t);
  const data = await readFile(new URL('../fixtures/structures/otio-oracle.json', import.meta.url), 'utf8');
  const expected = JSON.parse(await readFile(new URL('../fixtures/structures/otio-oracle.expected.json', import.meta.url), 'utf8'));
  const source = await f.resource('timeline', JSON.parse(data), 'editing-project');
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'otio' });
  for (const range of expected.ranges) {
    const unit = structure.units.find((u) => u.id === `/tracks/children/0/children/${range.index}`);
    assert.equal(unit.kind.toLowerCase(), range.kind.toLowerCase());
    assert.deepEqual(unit.parentRange, { start: range.start, duration: range.duration, timeUnit: 'seconds' });
  }
  assert.equal(structure.references.length, 2);
  assert.deepEqual(structure.units.find((u) => u.id === '/').globalStartTime, { value: 86400, rate: 24 });
  assert.deepEqual(structure.units.find((u) => u.name === 'Synthetic B').sourceRange.start, { value: 90, rate: 30 });
});

test('unknown retiming never invents a later clip position and unavailable media remains required', async (t) => {
  const f = await scopedFixture(t);
  const value = JSON.parse(await readFile(new URL('../fixtures/structures/otio-oracle.json', import.meta.url), 'utf8'));
  value.tracks.children[0].children[0].effects = [{ OTIO_SCHEMA: 'LinearTimeWarp.1', time_scalar: 2 }];
  const clip = value.tracks.children[0].children[2];
  clip.media_references.DEFAULT_MEDIA = { OTIO_SCHEMA: 'MissingReference.1' };
  const source = await f.resource('retimed', value);
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'otio' });
  assert.equal(structure.units.find((u) => u.name === 'Synthetic B').parentRange, null);
  assert.ok(structure.references.some((ref) => ref.key.endsWith('/unresolved-media') && ref.required));
  assert.ok(structure.coverage.unknown.some((reason) => reason.includes('Effect timing')));
  value.tracks.children[0].children[0].source_range.duration.rate = 0;
  const bad = await f.resource('bad-rate', value);
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: bad.revisionId, format: 'otio' }), { code: 'STRUCTURE_INVALID' });
});

test('head and tail transitions contribute to track duration without shifting local clip positions', async (t) => {
  const f = await scopedFixture(t);
  const value = JSON.parse(await readFile(new URL('../fixtures/structures/otio-boundary-oracle.json', import.meta.url), 'utf8'));
  const expected = JSON.parse(await readFile(new URL('../fixtures/structures/otio-boundary-oracle.expected.json', import.meta.url), 'utf8'));
  const source = await f.resource('boundary-transitions', value);
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'otio' });
  for (const track of expected.tracks) {
    const id = `/tracks/children/${track.trackIndex}`;
    assert.deepEqual(structure.units.find((u) => u.id === id).parentRange, { start: 0, duration: track.duration, timeUnit: 'seconds' });
    for (const range of track.ranges) assert.deepEqual(structure.units.find((u) => u.id === `${id}/children/${range.index}`).parentRange, { start: range.start, duration: range.duration, timeUnit: 'seconds' });
  }
});
