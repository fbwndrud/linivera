import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';

test('usage ranges bind the exact audio, original and normalized text and observed normalization map', async (t) => {
  const f = await fixture(t);
  const text = await f.text('dialogue', 'Hi!'); const normalized = await f.text('normalized', 'Hi');
  const audio = await f.store.propose({ resourceId: 'voice', kind: 'production-artifact', owned: { bytes: Buffer.from('synthetic audio'), mediaType: 'audio/wav' } });
  const map = await f.json('map', 'normalization-map', { version: 1, textRevisionId: text.revisionId, normalizedTextRevisionId: normalized.revisionId,
    indexUnit: 'unicode-code-points', segments: [{ sourceStart: 0, sourceEnd: 2, normalizedStart: 0, normalizedEnd: 2 }] });
  const alignment = await f.json('alignment', 'audio-alignment', { version: 1, audioRevisionId: audio.revisionId, textRevisionId: text.revisionId,
    normalizedTextRevisionId: normalized.revisionId, normalizationMapRevisionId: map.revisionId, alignmentKind: 'character',
    timebase: { unit: 'seconds', origin: 0 }, segments: [{ start: 0, end: 0.4 }], requestText: 'Hi!', normalized: { text: 'Hi' } });
  const context = await f.json('context', 'usage-context', { version: 1, scopeId: 'scene', states: [] });
  const usage = { version: 1, artifactRevisionId: audio.revisionId, contextRevisionId: context.revisionId, role: 'dialogue',
    alignmentRevisionId: alignment.revisionId, audioRevisionId: audio.revisionId, textRevisionId: text.revisionId,
    normalizedTextRevisionId: normalized.revisionId, normalizationMapRevisionId: map.revisionId,
    range: { unit: 'characters', start: 0, end: 2, textRevisionId: normalized.revisionId } };
  const valid = await f.json('usage', 'resource-usage', usage);
  const { readContextReferences } = await import('../../core/resources/context-references.js');
  assert.ok((await readContextReferences(f.root, valid)).includes(map.revisionId));
  const other = await f.text('other', 'Wrong voice script');
  await assert.rejects(f.json('wrong-script', 'resource-usage', { ...usage, textRevisionId: other.revisionId }), { code: 'USAGE_BINDING_INVALID' });
  await assert.rejects(f.json('wrong-map', 'resource-usage', { ...usage, normalizationMapRevisionId: text.revisionId }), { code: 'USAGE_BINDING_INVALID' });
  await assert.rejects(f.json('bad-range', 'resource-usage', { ...usage, range: { unit: 'frames', start: 0, end: 8 } }), { code: 'USAGE_BINDING_INVALID' });
});

test('node evidence bridges require the exact retained body and report stale current manuscript as unknown', async (t) => {
  const f = await fixture(t);
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const body = 'Synthetic lantern is wet.\n';
  await mkdir(join(f.root, 'tree'));
  await writeFile(join(f.root, 'tree', 'scene.md'), '---\nid: scene-one\nlevel: scene\n---\n' + body);
  const source = await f.text('manuscript-scene', body);
  const value = { version: 1, scopeId: 'river', pathId: 'river', states: [{ role: 'prop-state', value: 'wet lantern', status: 'observed',
    nodeRef: { nodeId: 'scene-one', bodyHash: source.contentHash, revisionId: source.revisionId }, evidenceRevisionIds: [source.revisionId] }] };
  const context = await f.json('prop-context', 'usage-context', value);
  await assert.rejects(f.json('false-evidence', 'usage-context', { ...value, states: [{ ...value.states[0], nodeRef: { ...value.states[0].nodeRef, bodyHash: 'sha256:' + 'a'.repeat(64) } }] }), { code: 'CONTEXT_BRIDGE_INVALID' });
  await assert.rejects(f.json('false-node', 'usage-context', { ...value, states: [{ ...value.states[0], nodeRef: { ...value.states[0].nodeRef, nodeId: 'another-node' } }] }), { code: 'CONTEXT_BRIDGE_INVALID' });
  await writeFile(join(f.root, 'tree', 'scene.md'), '---\nid: scene-one\nlevel: scene\n---\nSynthetic dry lantern.\n');
  const { collectContext } = await import('../../core/context/collect.js');
  const result = await collectContext(f.root, { scopeId: 'river', pathId: 'river', contextRevisionId: context.revisionId, purpose: 'continue',
    budget: { maxTextBytes: 1000, maxItems: 10, maxManifestBytes: 4000 } });
  assert.ok(result.coverage.unknown.some((entry) => entry.reason.includes('manuscript changed')));
  assert.equal(result.package.items[0].text, body);
  assert.equal(result.package.items[0].value, 'wet lantern');
});
