import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { collectContext } from '../../core/context/collect.js';

test('other path state cannot enter through evidence or a nested file bundle', async (t) => {
  const f = await fixture(t); const first = await f.text('face', 'Synthetic reusable face'); const second = await f.text('prop', 'Synthetic mountain prop');
  const mountain = await f.json('mountain', 'usage-context', { version: 1, scopeId: 'episode', pathId: 'mountain', timeLabel: 'night', states: [
    { role: 'prop', status: 'selected', artifactRevisionId: second.revisionId, evidenceRevisionIds: [] },
  ] });
  const river = { version: 1, scopeId: 'episode', pathId: 'river', timeLabel: 'morning', states: [
    { role: 'face', status: 'selected', artifactRevisionId: first.revisionId, evidenceRevisionIds: [mountain.revisionId] },
  ] };
  await assert.rejects(f.json('river', 'usage-context', river), { code: 'CONTEXT_SCOPE_MISMATCH' });
  const bundle = await f.json('hidden-mountain', 'artifact-bundle', { version: 1, bundleType: 'generic', members: [
    { resourceId: mountain.resourceId, revisionId: mountain.revisionId, relativePath: 'state.json', role: 'state', required: true },
  ] });
  await assert.rejects(f.json('river-bundle', 'usage-context', { ...river, states: [{ ...river.states[0], evidenceRevisionIds: [bundle.revisionId] }] }), { code: 'CONTEXT_SCOPE_MISMATCH' });
  await assert.rejects(collectContext(f.root, { scopeId: 'episode', pathId: 'river', timeLabel: 'morning', purpose: 'next scene', revisionIds: [bundle.revisionId],
    budget: { maxTextBytes: 1000, maxItems: 10, maxManifestBytes: 4000 } }), { code: 'CONTEXT_SCOPE_MISMATCH' });
  await f.json('generic-reuse', 'usage-context', { ...river, states: [{ ...river.states[0], evidenceRevisionIds: [second.revisionId] }] });
  const riverContext = await f.json('empty-river', 'usage-context', { ...river, states: [] });
  await assert.rejects(f.json('direct-package', 'context-package', { version: 1, scopeId: 'episode', pathId: 'river', timeLabel: 'morning', purpose: 'bypass preview',
    sourceContextRevisionId: riverContext.revisionId, items: [{ role: 'explicit-reference', status: 'candidate', revisionId: mountain.revisionId,
      referenceRevisionIds: [mountain.revisionId], contentHash: mountain.contentHash, mediaType: mountain.mediaType, byteLength: mountain.byteLength, content: 'manifest-only' }],
    referenceRevisionIds: [mountain.revisionId], coverage: { missing: [], unknown: [], truncated: [] } }), { code: 'CONTEXT_SCOPE_MISMATCH' });
  await assert.rejects(f.json('wrong-usage-context', 'resource-usage', { version: 1, artifactRevisionId: mountain.revisionId,
    contextRevisionId: riverContext.revisionId, role: 'state' }), { code: 'CONTEXT_SCOPE_MISMATCH' });
});
