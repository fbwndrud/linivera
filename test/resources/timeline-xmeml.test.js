import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';

const sequence = `<sequence id="seq"><name>Synthetic edit</name><duration>120</duration><rate><timebase>30</timebase><ntsc>TRUE</ntsc></rate><media><video><track>
<clipitem id="c1"><name>A</name><start>0</start><end>60</end><in>30</in><out>90</out><file id="f1"><name>shot.mov</name><pathurl>file:///synthetic/shot.mov</pathurl><rate><timebase>24</timebase><ntsc>FALSE</ntsc></rate></file></clipitem>
<clipitem id="c2"><name>B</name><start>60</start><end>120</end><in>90</in><out>150</out><file id="f1"/></clipitem>
</track></video><audio><track><clipitem id="a1"><name>Audio</name><start>0</start><end>120</end><in>0</in><out>120</out><file id="audio"><pathurl>file:///synthetic/voice.wav</pathurl></file></clipitem></track></audio></media></sequence>`;
export const syntheticXmeml = `<?xml version="1.0"?><!DOCTYPE xmeml><xmeml version="5">${sequence}</xmeml>`;

test('XMEML separates track placement from source range and resolves shared media IDs', async (t) => {
  const f = await scopedFixture(t); const source = await f.resource('edit', syntheticXmeml, 'editing-project');
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'xmeml' });
  assert.equal(structure.units.filter((u) => u.kind === 'track').length, 2);
  const clips = structure.units.filter((u) => u.kind === 'clip');
  assert.deepEqual(clips[0].parentRange, { startFrame: 0, endFrame: 60, rate: { numerator: 30000, denominator: 1001 } });
  assert.deepEqual(clips[0].sourceRange, { startFrame: 30, endFrame: 90, rate: { numerator: 30000, denominator: 1001 } });
  assert.equal(structure.references.length, 2);
  const links = structure.links.filter((l) => l.kind === 'clip-media');
  assert.equal(links[0].target, links[1].target);
});

test('a clip without media or nested sequence stays unresolved and cannot feed a new input', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('offline-edit', '<xmeml version="5"><sequence><name>Offline</name><rate><timebase>24</timebase></rate><media><video><track><clipitem><start>0</start><end>24</end><in>0</in><out>24</out></clipitem></track></video></media></sequence></xmeml>');
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'xmeml' });
  assert.ok(structure.references.some((ref) => ref.required && ref.role === 'media'));
  assert.ok(structure.coverage.unknown.some((reason) => reason.includes('Missing media')));
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'map', sourceRevisionId: source.revisionId, format: 'xmeml', structureBindings: [] });
  const scope = ['offline-edit', 'map'];
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 100000 }], ['policy', { version: 1, scope, allowedActions: ['select-source', 'create-candidate'] }]]) {
    const r = await f.resource(kind, value, kind); await f.select(r); f.definitions[kind + 'RevisionId'] = r.revisionId;
  }
  await f.select(source); await f.select(map);
  await assert.rejects(prepareInput(f.root, { revisionIds: [map.revisionId], ...f.definitions }), { code: 'STRUCTURE_BINDINGS_INCOMPLETE' });
});

test('unsafe or malformed XML and unresolved IDs are rejected without resolving any URI', async (t) => {
  const f = await scopedFixture(t);
  const cases = [syntheticXmeml.replace('<!DOCTYPE xmeml>', '<!DOCTYPE xmeml SYSTEM "https://example.invalid/external.dtd">'),
    syntheticXmeml.replace('<!DOCTYPE xmeml>', '<!DOCTYPE xmeml [<!ENTITY data SYSTEM "file:///private/synthetic">]>'),
    syntheticXmeml.replace('</xmeml>', '</wrong>'), syntheticXmeml.replace('<file id="f1"/>', '<file id="absent"/>')];
  for (const [i, value] of cases.entries()) {
    const r = await f.resource('bad-' + i, value);
    await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: r.revisionId, format: 'xmeml' }), { code: 'STRUCTURE_INVALID' });
  }
});

test('transition sentinels and filters remain explicit observations with unknown interpretation', async (t) => {
  const f = await scopedFixture(t);
  const source = await f.resource('transition', syntheticXmeml.replace('<start>0</start><end>60</end>', '<start>0</start><end>-1</end><filter><effect><effectid>timeremap</effectid></effect></filter><marker><in>12</in><out>-1</out></marker>'));
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'xmeml' });
  assert.equal(structure.units.find((u) => u.nativeId === 'c1').parentRange, null);
  assert.ok(structure.units.some((u) => u.kind === 'filter' && u.effectId === 'timeremap'));
  assert.ok(structure.units.some((u) => u.kind === 'marker'));
  assert.ok(structure.coverage.unknown.length);
});
