import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { collectBundleClosure } from '../../core/resources/bundles.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';

test('required external members remain unavailable and cannot become reference-only complete input', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'linivera-bundle-storage-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const external = await store.propose({ resourceId: 'audio', kind: 'artifact-file', external: { uri: 'https://example.invalid/unobserved.wav' } });
  const member = { resourceId: 'audio', revisionId: external.revisionId, relativePath: 'voice.wav', role: 'audio', required: true };
  const manifest = { version: 1, bundleType: 'audio-with-alignment', members: [member] };
  const bundle = await resourcesTool(root, { op: 'importBundle', resourceId: 'bundle', manifest });
  const description = await resourcesTool(root, { op: 'describe', revisionId: bundle.revisionId });
  assert.equal(description.bundle.completeness, 'incomplete'); assert.equal(description.bundle.members[0].revisionId, external.revisionId);
  assert.ok(description.bundle.unavailable.some((missing) => missing.resourceId === 'audio' && missing.required));
  await assert.rejects(collectBundleClosure(root, [bundle.revisionId]), { code: 'BUNDLE_INVALID' });
  await assert.rejects(store.propose({ resourceId: 'forged', kind: 'artifact-bundle', owned: { bytes: JSON.stringify(manifest), mediaType: 'application/json' } }), { code: 'BUNDLE_INVALID' });
  const select = (revision) => store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
  await select(external); await select(bundle); const definitions = {};
  for (const [kind, value] of [['profile', { version: 1, scope: ['audio', 'bundle'], maxInputBytes: 10000 }],
    ['pipeline', { version: 1, steps: [{ id: 'use', capability: 'transform' }] }], ['policy', { version: 1, scope: ['audio', 'bundle'], allowedActions: ['create-candidate'] }]]) {
    const revision = await store.propose({ resourceId: kind, kind, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
    await select(revision); definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  await assert.rejects(prepareInput(root, { revisionIds: [bundle.revisionId], externalMode: 'reference-only', ...definitions }), { code: 'BUNDLE_INVALID' });
});
