import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';

test('Martini failed/partial run retains ordered inputs, output takes and replacement without internal approval', async (t) => {
  const f = await scopedFixture(t);
  const r = await f.resource('run', { id: 'run-1', fingerprint: 'machinery-1', status: 'failed',
    savedWorkflow: { id: 'workflow-1', version: 3 }, variables: { Script: 'Synthetic narration' }, bins: { References: ['asset-input'] },
    actions: [{ id: 'action-1', status: 'failed' }], items: [
      { id: 'take-1', actionId: 'action-1', status: 'superseded', outputAssetId: 'asset-old' },
      { id: 'take-2', actionId: 'action-1', status: 'completed', outputAssetId: 'asset-new', replacesItemId: 'take-1', verdict: { pass: true, take: 2 } },
      { id: 'take-3', actionId: 'action-1', status: 'needs_revision', revision: { inputRefs: ['Script'] } },
    ] }, 'workflow-run');
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: r.revisionId, format: 'martini-run' });
  assert.ok(structure.links.some((l) => l.kind === 'replaces' && l.source === '/items/1' && l.target === '/items/0'));
  assert.ok(structure.links.some((l) => l.kind === 'revision-input' && l.target === '/variables/Script'));
  assert.deepEqual(structure.references.filter((ref) => ref.required).map((ref) => ref.hint), ['asset-input', 'asset-old', 'asset-new']);
  assert.equal(structure.units.find((u) => u.id === '/items/1').reportedVerdict.pass, true);
  assert.equal(await f.store.readSourceSelection('run'), null);
});

test('Comfy UI links are structural facts and unknown widgets do not become guessed file bindings', async (t) => {
  const f = await scopedFixture(t);
  const r = await f.resource('ui', { nodes: [{ id: 7, type: 'LoadImage', widgets_values: ['image.png'] }, { id: 8, type: 'PreviewImage' }], links: [[1, 7, 0, 8, 0, 'IMAGE']] });
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: r.revisionId, format: 'comfy-ui' });
  assert.equal(structure.links[0].source, '/nodes/0'); assert.equal(structure.links[0].target, '/nodes/1');
  assert.deepEqual(structure.references, []); assert.ok(structure.coverage.unknown.length);
  const bad = await f.resource('bad', { nodes: [{ id: 7, type: 'LoadImage' }], links: [[1, 7, 0, 8, 0, 'IMAGE']] });
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: bad.revisionId, format: 'comfy-ui' }), { code: 'STRUCTURE_INVALID' });
});

test('Martini ambiguous variable/bin input names stay unknown instead of inventing a revision target', async (t) => {
  const f = await scopedFixture(t);
  const r = await f.resource('ambiguous', { id: 'run', status: 'needs_revision', variables: { Script: 'Synthetic cue' }, bins: { Script: ['asset-1'] },
    actions: [{ id: 'a', status: 'needs_revision' }], items: [{ id: 'i', actionId: 'a', status: 'needs_revision', revision: { inputRefs: ['Script'] } }] });
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: r.revisionId, format: 'martini-run' });
  assert.equal(structure.links.filter((link) => link.kind === 'revision-input').length, 0);
  assert.ok(structure.coverage.unknown.some((entry) => entry.includes('ambiguous')));
});

test('SRT retains ordered cue times including overlaps and links optional media explicitly', async (t) => {
  const f = await scopedFixture(t);
  const r = await f.resource('subtitles', '1\r\n00:00:01,250 --> 00:00:03,000\r\nSynthetic cue\r\n\r\n2\r\n00:00:02,000 --> 00:00:04,000\r\nSecond cue\r\n');
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: r.revisionId, format: 'srt' });
  assert.deepEqual(structure.units.map((u) => [u.start, u.end]), [[1.25, 3], [2, 4]]);
  assert.equal(structure.references[0].role, 'media'); assert.equal(structure.references[0].required, false);
  assert.ok(structure.coverage.unknown.some((s) => s.includes('alignment')));
  const bad = await f.resource('bad', '1\n00:00:03,000 --> 00:00:01,000\nSynthetic');
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: bad.revisionId, format: 'srt' }), { code: 'STRUCTURE_INVALID' });
});
