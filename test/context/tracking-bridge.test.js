import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { coverageSetup } from '../support/tracking-coverage.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { collectContext } from '../../core/context/collect.js';
import { readContextReferences } from '../../core/resources/context-references.js';
import { updateNode } from '../../core/store/tree.js';

test('tracking observations bridge only exact node evidence and saved packages keep historical proof after prose changes', async (t) => {
  const s = await coverageSetup(); t.after(() => rm(s.root, { recursive: true, force: true }));
  await s.execute('rooftop-scene', { discover: true, value: '문' });
  const store = createResourceStore(s.root); const node = (await s.work()).tree.nodes.get('rooftop-scene');
  const source = await store.propose({ resourceId: 'scene-source', kind: 'document', owned: { bytes: node.body, mediaType: 'text/plain' } });
  const context = await store.propose({ resourceId: 'scene-context', kind: 'usage-context', owned: { mediaType: 'application/json', bytes: JSON.stringify({ version: 1,
    scopeId: 'river-scene', states: [{ role: 'prop-owner', status: 'observed', evidenceRevisionIds: [source.revisionId], subjectRef: { subjectId: 'key' },
      nodeRef: { nodeId: node.id, revisionId: source.revisionId, bodyHash: source.contentHash } }] }) } });
  const request = { scopeId: 'river-scene', purpose: 'next chapter', contextRevisionId: context.revisionId, budget: { maxTextBytes: 5000, maxItems: 10, maxManifestBytes: 10000 } };
  const preview = await collectContext(s.root, request);
  assert.equal(preview.package.items[0].tracking[0].value, '문');
  assert.equal(preview.package.items[0].tracking[0].evidence.textHash, source.contentHash);
  const saved = await store.propose({ resourceId: 'knowledge', kind: 'context-package', owned: { bytes: JSON.stringify(preview.package), mediaType: 'application/json' } });
  await updateNode(s.root, node, { body: 'Synthetic changed manuscript.' });
  const refreshed = await collectContext(s.root, request);
  assert.equal(refreshed.package.items[0].tracking.length, 0);
  assert.ok(refreshed.coverage.unknown.length > 0);
  assert.deepEqual(await readContextReferences(s.root, saved), [source.revisionId]);
});
