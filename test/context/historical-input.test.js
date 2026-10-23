import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { coverageSetup } from '../support/tracking-coverage.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';
import { collectContext } from '../../core/context/collect.js';
import { readContextReferences } from '../../core/resources/context-references.js';
import { historicalTrackingEvidence } from '../../core/context/bridges.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { readHistoricalTracking } from '../../core/tracking/records.js';
import { trackingCriterion } from '../support/tracking.js';

test('sealed context input and historical tracking evidence ignore unrelated current manuscript errors', async (t) => {
  const s = await coverageSetup({ criteria: [trackingCriterion({ appliesTo: ['rooftop-scene'] })] }); t.after(() => rm(s.root, { recursive: true, force: true }));
  await s.execute('rooftop-scene', { discover: true, value: '문' });
  const store = createResourceStore(s.root); const node = (await s.work()).tree.nodes.get('rooftop-scene');
  const json = (resourceId, kind, value) => store.propose({ resourceId, kind, owned: { mediaType: 'application/json', bytes: JSON.stringify(value) } });
  const select = (revision) => store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
  const source = await store.propose({ resourceId: 'source', kind: 'document', owned: { bytes: node.body, mediaType: 'text/plain' } });
  const value = { version: 1, scopeId: 'scene', states: [{ role: 'prop', status: 'observed', evidenceRevisionIds: [source.revisionId],
    subjectRef: { subjectId: 'key' }, nodeRef: { nodeId: node.id, revisionId: source.revisionId, bodyHash: source.contentHash } }] };
  const context = await json('context', 'usage-context', value);
  const preview = await collectContext(s.root, { scopeId: 'scene', purpose: 'continue', contextRevisionId: context.revisionId,
    budget: { maxTextBytes: 5000, maxItems: 10, maxManifestBytes: 10000 } });
  assert.ok(preview.package.items[0].tracking.length);
  const knowledge = await json('knowledge', 'context-package', preview.package);
  for (const revision of [source, context, knowledge]) await select(revision);
  const scope = ['source', 'context', 'knowledge']; const definitions = {};
  for (const [kind, definition] of [['profile', { version: 1, scope, maxInputBytes: 100000 }],
    ['pipeline', { version: 1, steps: [{ id: 'continue', capability: 'transform' }] }],
    ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'select-source'] }]]) {
    const revision = await json(kind, kind, definition); await select(revision); definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  const input = await prepareInput(s.root, { revisionIds: [context.revisionId, knowledge.revisionId], ...definitions });
  await mkdir(join(s.root, 'tree'), { recursive: true });
  await writeFile(join(s.root, 'tree/broken.md'), '---\nid: unrelated-broken\n---\nSynthetic malformed node.');
  assert.deepEqual((await verifyInput(s.root, input.inputSnapshotId)).manifest, input.manifest);
  assert.deepEqual(await readContextReferences(s.root, knowledge), [source.revisionId]);
  await assert.rejects(json('new-context', 'usage-context', value), { code: 'CONTEXT_BRIDGE_INVALID' });
  await writeFile(join(s.root, 'tree/broken.md'), '---\nid: [unfinished\n---\nSynthetic invalid YAML.');
  assert.deepEqual((await verifyInput(s.root, input.inputSnapshotId)).manifest, input.manifest);
  assert.deepEqual(await readContextReferences(s.root, knowledge), [source.revisionId]);
});

test('a prepared tracking batch without a commit cannot become historical context evidence', async (t) => {
  const s = await coverageSetup(); t.after(() => rm(s.root, { recursive: true, force: true }));
  await s.execute('rooftop-scene', { discover: true, value: '문' });
  const store = createResourceStore(s.root); const node = (await s.work()).tree.nodes.get('rooftop-scene');
  const json = (resourceId, kind, value) => store.propose({ resourceId, kind, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
  const source = await store.propose({ resourceId: 'source', kind: 'document', owned: { bytes: node.body, mediaType: 'text/plain' } });
  const state = { role: 'prop', status: 'observed', evidenceRevisionIds: [source.revisionId], subjectRef: { subjectId: 'key' },
    nodeRef: { nodeId: node.id, revisionId: source.revisionId, bodyHash: source.contentHash } };
  const context = await json('context', 'usage-context', { version: 1, scopeId: 'scene', states: [state] });
  const preview = await collectContext(s.root, { scopeId: 'scene', purpose: 'continue', contextRevisionId: context.revisionId,
    budget: { maxTextBytes: 5000, maxItems: 10, maxManifestBytes: 10000 } });
  assert.equal(preview.package.items[0].tracking.length, 1);
  // Disposable synthetic crash prefix: receipt and prepared batch exist; final commit does not.
  const records = await openLedger(s.root, 'receipts').readAll();
  const prefix = records.slice(0, records.findIndex((record) => record.type === 'commit' && record.nodeId === node.id));
  await writeFile(join(s.root, '.folio/ledger/receipts.jsonl'), prefix.map((record) => JSON.stringify(record)).join('\n') + '\n');
  await writeFile(join(s.root, '.folio/ledger/receipts.head'), JSON.stringify({ seq: prefix.at(-1).seq, hash: prefix.at(-1).hash }));
  assert.equal((await readHistoricalTracking(s.root)).batches.length, 0);
  assert.deepEqual(await historicalTrackingEvidence(s.root, state), []);
  await assert.rejects(json('uncommitted-evidence', 'context-package', preview.package), { code: 'CONTEXT_INVALID' });
});
