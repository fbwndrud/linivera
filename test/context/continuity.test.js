import test from 'node:test';
import assert from 'node:assert/strict';
import { collectContext } from '../../core/context/collect.js';
import { fixture } from './fixture.js';

test('a new session recovers only the exact path context and never selects its preview', async (t) => {
  const f = await fixture(t);
  const face = await f.text('face', 'Synthetic face from episode one');
  const context = await f.json('episode-eight', 'usage-context', { version: 1, scopeId: 'episode-eight', pathId: 'river', timeLabel: 'after rain',
    states: [{ role: 'face', artifactRevisionId: face.revisionId, status: 'selected', evidenceRevisionIds: [] },
      { role: 'coat', status: 'unknown', evidenceRevisionIds: [], unknown: 'coat state was not observed' }] });
  const result = await collectContext(f.root, { scopeId: 'episode-eight', pathId: 'river', purpose: 'next scene', contextRevisionId: context.revisionId,
    budget: { maxTextBytes: 1000, maxItems: 10, maxManifestBytes: 10000 } });
  assert.equal(result.package.items[0].text, 'Synthetic face from episode one');
  assert.deepEqual(result.package.referenceRevisionIds, [face.revisionId]);
  assert.ok(result.coverage.unknown.some((entry) => entry.role === 'coat'));
  assert.equal(await f.store.readSourceSelection('face'), null);
  await assert.rejects(collectContext(f.root, { scopeId: 'episode-eight', pathId: 'mountain', purpose: 'wrong path', contextRevisionId: context.revisionId,
    budget: { maxTextBytes: 1000, maxItems: 10, maxManifestBytes: 10000 } }), { code: 'CONTEXT_SCOPE_MISMATCH' });
  await assert.rejects(collectContext(f.root, { scopeId: 'episode-eight', timeLabel: 'before rain', purpose: 'wrong time', contextRevisionId: context.revisionId,
    budget: { maxTextBytes: 1000, maxItems: 10, maxManifestBytes: 10000 } }), { code: 'CONTEXT_SCOPE_MISMATCH' });
});

test('explicit missing references and unobserved media stay missing or unknown without invented content', async (t) => {
  const f = await fixture(t);
  const remote = await f.store.propose({ resourceId: 'remote', kind: 'reference', external: { uri: 'https://example.invalid/synthetic' } });
  const missing = 'sha256:' + 'f'.repeat(64);
  const result = await collectContext(f.root, { scopeId: 'new-scene', purpose: 'inspect evidence', revisionIds: [remote.revisionId, missing],
    budget: { maxTextBytes: 0, maxItems: 10, maxManifestBytes: 4000 } });
  assert.equal(result.package.items[0].content, 'manifest-only');
  assert.equal(result.package.items[0].status, 'candidate');
  assert.equal(result.package.items[0].text, undefined);
  assert.ok(result.coverage.unknown.some((entry) => entry.revisionId === remote.revisionId));
  assert.ok(result.coverage.missing.some((entry) => entry.revisionId === missing));
});

test('a fresh query recovers the user selected context for a scope and reports absent knowledge explicitly', async (t) => {
  const f = await fixture(t);
  const source = await f.text('voice', 'Synthetic recurring voice');
  const context = await f.json('selected-context', 'usage-context', { version: 1, scopeId: 'episode-ten', timeLabel: 'morning', states: [
    { role: 'voice', artifactRevisionId: source.revisionId, status: 'selected', evidenceRevisionIds: [] },
  ] });
  const definitions = {};
  for (const [kind, value] of [['profile', { version: 1, scope: ['voice', 'selected-context'], maxInputBytes: 100000 }],
    ['pipeline', { version: 1, steps: [{ id: 'continue', capability: 'transform' }] }],
    ['policy', { version: 1, scope: ['voice', 'selected-context'], allowedActions: ['create-candidate', 'select-source'] }]]) {
    const revision = await f.json(kind, kind, value);
    await f.store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
    definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  const { selectInput } = await import('../../core/resources/input-selections.js');
  await selectInput(f.root, { scopeId: 'episode-ten', actor: 'user', reason: 'continue this episode', expectedScopeSelectionRevision: null, ...definitions,
    bindings: [{ bindingKey: 'scene-context', role: 'context', resourceId: context.resourceId, revisionId: context.revisionId, mode: 'fixed' }] });
  const { resourceQueryTool } = await import('../../server/tools/resource-query.js');
  const query = { op: 'context', scopeId: 'episode-ten', purpose: 'next shot', budget: { maxTextBytes: 1000, maxItems: 10, maxManifestBytes: 4000 } };
  const recovered = await resourceQueryTool(f.root, query);
  assert.equal(recovered.package.sourceContextRevisionId, context.revisionId);
  assert.equal(recovered.package.items[0].text, 'Synthetic recurring voice');
  const missing = await resourceQueryTool(f.root, { ...query, scopeId: 'unknown-episode' });
  assert.equal(missing.package.items.length, 0);
  assert.ok(missing.coverage.unknown.length > 0);
});

test('byte and item budgets preserve exclusions without forcing excluded references into the next input', async (t) => {
  const f = await fixture(t);
  const first = await f.text('first', '가나다라마');
  const second = await f.text('second', 'Synthetic second');
  const context = await f.json('budget-context', 'usage-context', { version: 1, scopeId: 'episode-nine', states: [first, second].map((revision) => ({
    role: revision.resourceId, artifactRevisionId: revision.revisionId, status: 'observed', evidenceRevisionIds: [],
  })) });
  const result = await collectContext(f.root, { scopeId: 'episode-nine', purpose: 'small context', contextRevisionId: context.revisionId,
    budget: { maxTextBytes: 7, maxItems: 1, maxManifestBytes: 3000 } });
  assert.equal(result.package.items.length, 1);
  assert.equal(result.package.items[0].text, '가나');
  assert.equal(result.package.items[0].textComplete, false);
  assert.deepEqual(result.package.referenceRevisionIds, [first.revisionId]);
  assert.ok(result.coverage.truncated.some((entry) => entry.revisionId === second.revisionId));
  assert.ok(result.coverage.truncated.some((entry) => entry.revisionId === first.revisionId));
  assert.ok(Buffer.byteLength(JSON.stringify(result.package)) <= 3000);
  const saved = await f.json('package', 'context-package', result.package);
  assert.equal(await f.store.readSourceSelection(saved.resourceId), null);
  const silent = structuredClone(result.package); silent.coverage.truncated = [];
  await assert.rejects(f.json('silent-omission', 'context-package', silent), { code: 'CONTEXT_INVALID' });
});

test('typed context packages cannot claim unrelated hashes or bypass exact original input references', async (t) => {
  const f = await fixture(t);
  const source = await f.text('source', 'Synthetic original');
  const context = await f.json('context', 'usage-context', { version: 1, scopeId: 'scene', states: [
    { role: 'identity', artifactRevisionId: source.revisionId, status: 'selected', evidenceRevisionIds: [] },
  ] });
  const preview = await collectContext(f.root, { scopeId: 'scene', purpose: 'continue', contextRevisionId: context.revisionId,
    budget: { maxTextBytes: 100, maxItems: 10, maxManifestBytes: 3000 } });
  const corrupt = structuredClone(preview.package); corrupt.items[0].text = 'Invented source';
  await assert.rejects(f.json('bad-package', 'context-package', corrupt), { code: 'CONTEXT_INVALID' });
  const omitted = structuredClone(preview.package); omitted.referenceRevisionIds = [];
  await assert.rejects(f.json('bad-closure', 'context-package', omitted), { code: 'CONTEXT_INVALID' });
  const invented = structuredClone(preview.package); invented.items[0].value = 'Invented prop state';
  await assert.rejects(f.json('invented-state', 'context-package', invented), { code: 'CONTEXT_INVALID' });
  const saved = await f.json('good-package', 'context-package', preview.package);
  const { readContextReferences } = await import('../../core/resources/context-references.js');
  assert.deepEqual(await readContextReferences(f.root, saved), [source.revisionId]);
});

test('state descriptions and tracking text share the same explicit text budget', async (t) => {
  const f = await fixture(t); const source = await f.text('prop', 'Wet');
  const context = await f.json('state-context', 'usage-context', { version: 1, scopeId: 'scene', states: [
    { role: 'prop', value: 'Synthetic description exceeds six bytes', status: 'observed', artifactRevisionId: source.revisionId, evidenceRevisionIds: [] },
  ] });
  const preview = await collectContext(f.root, { scopeId: 'scene', purpose: 'tiny', contextRevisionId: context.revisionId,
    budget: { maxTextBytes: 6, maxItems: 10, maxManifestBytes: 3000 } });
  assert.equal(preview.package.items.length, 0);
  assert.ok(preview.coverage.truncated.some((entry) => entry.reason === 'state text byte budget'));
});

test('explicit context references cannot import another path state into the requested path', async (t) => {
  const f = await fixture(t);
  const context = await f.json('mountain-context', 'usage-context', { version: 1, scopeId: 'episode-eight', pathId: 'mountain', states: [] });
  await assert.rejects(collectContext(f.root, { scopeId: 'episode-eight', pathId: 'river', purpose: 'continue river', revisionIds: [context.revisionId],
    budget: { maxTextBytes: 100, maxItems: 10, maxManifestBytes: 3000 } }), { code: 'CONTEXT_SCOPE_MISMATCH' });
});

test('a context package cannot replace the selected primary artifact with another evidence revision', async (t) => {
  const f = await fixture(t); const primary = await f.text('primary', 'Synthetic selected face'); const evidence = await f.text('evidence', 'Synthetic unrelated evidence');
  const context = await f.json('context-primary', 'usage-context', { version: 1, scopeId: 'scene', states: [
    { role: 'face', status: 'selected', artifactRevisionId: primary.revisionId, evidenceRevisionIds: [evidence.revisionId] },
  ] });
  const preview = await collectContext(f.root, { scopeId: 'scene', purpose: 'continue', contextRevisionId: context.revisionId,
    budget: { maxTextBytes: 1000, maxItems: 10, maxManifestBytes: 4000 } });
  const forged = structuredClone(preview.package);
  Object.assign(forged.items[0], { revisionId: evidence.revisionId, contentHash: evidence.contentHash, mediaType: evidence.mediaType,
    byteLength: evidence.byteLength, text: 'Synthetic unrelated evidence', textComplete: true });
  await assert.rejects(f.json('forged-primary', 'context-package', forged), { code: 'CONTEXT_INVALID' });
});
