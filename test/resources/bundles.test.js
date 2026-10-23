import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resourcesTool } from '../../server/tools/resources.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-bundle-')); t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: createResourceStore(root) };
}
const member = (resourceId, relativePath, revisionId) => ({ resourceId, relativePath, role: 'source', required: true, ...(revisionId ? { revisionId } : {}) });

test('bundle import binds independent members without selecting them and retains incomplete coverage', async (t) => {
  const { root, store } = await fixture(t); const path = join(root, 'synthetic.xml'); await writeFile(path, '<synthetic/>');
  const input = { op: 'importBundle', resourceId: 'edit', manifest: { version: 1, bundleType: 'editing-project',
    members: [member('xml', 'project.xml'), member('audio', 'media/voice.wav')] },
  pathMappings: [{ relativePath: 'project.xml', path, mediaType: 'application/xml' }] };
  const bundle = await resourcesTool(root, input);
  assert.equal(bundle.kind, 'artifact-bundle');
  const detail = await resourcesTool(root, { op: 'describe', revisionId: bundle.revisionId });
  assert.equal(detail.bundle.completeness, 'incomplete'); assert.equal(detail.bundle.dependencyCoverage, 'unknown');
  assert.equal(detail.bundle.restorability, 'unknown'); assert.equal(detail.bundle.members.length, 1);
  const imported = detail.bundle.members[0]; assert.equal(imported.resourceId, 'xml');
  assert.equal(await store.readSourceSelection(imported.resourceId), null);
  assert.equal((await resourcesTool(root, input)).revisionId, bundle.revisionId);
  await assert.rejects(resourcesTool(root, { ...input, manifest: { ...input.manifest, members: [member('xml', '../project.xml')] } }), { code: 'BUNDLE_INVALID' });
  await assert.rejects(resourcesTool(root, { ...input, manifest: { ...input.manifest, members: [member('xml', 'project.xml'), member('other', 'project.xml')] } }), { code: 'BUNDLE_INVALID' });
});

test('nested bundle preparation pins every member selection, scope and actual byte budget', async (t) => {
  const { root, store } = await fixture(t);
  const audio = await store.propose({ resourceId: 'voice', kind: 'audio', owned: { mediaType: 'audio/wav', bytes: Buffer.alloc(700) } });
  const inner = await resourcesTool(root, { op: 'importBundle', resourceId: 'inner', manifest: { version: 1, bundleType: 'generic', members: [member('voice', 'voice.wav', audio.revisionId)] } });
  const outer = await resourcesTool(root, { op: 'importBundle', resourceId: 'outer', manifest: { version: 1, bundleType: 'generic', members: [member('inner', 'inner', inner.revisionId)] } });
  async function choose(revision) {
    const previous = await store.readSourceSelection(revision.resourceId);
    return store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: previous?.selectionRevision ?? null, action: { type: 'select', actor: 'user' } });
  }
  async function definitions(scope, budget) {
    const result = {};
    for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: budget }], ['pipeline', { version: 1, steps: [{ id: 'edit', capability: 'transform' }] }], ['policy', { version: 1, scope, allowedActions: ['create-candidate'] }]]) {
      const revision = await store.propose({ resourceId: kind, kind, owned: { mediaType: 'application/json', bytes: JSON.stringify(value) } }); await choose(revision); result[kind + 'RevisionId'] = revision.revisionId;
    }
    return { ...result, revisionIds: [outer.revisionId] };
  }
  await choose(outer); await choose(inner);
  let input = await definitions(['outer', 'inner', 'voice'], 10000);
  await assert.rejects(prepareInput(root, input), { code: 'INPUT_INVALID' });
  await choose(audio);
  const snapshot = await prepareInput(root, input);
  assert.deepEqual(snapshot.manifest.resources.map((r) => r.resourceId), ['outer', 'inner', 'voice']);
  assert.equal((await verifyInput(root, snapshot.inputSnapshotId)).manifest.resources.length, 3);
  input = await definitions(['outer', 'inner'], 10000);
  await assert.rejects(prepareInput(root, input), { code: 'INPUT_INVALID' });
  input = await definitions(['outer', 'inner', 'voice'], 1000);
  await assert.rejects(prepareInput(root, input), { code: 'INPUT_INVALID' });
});

test('bundle descriptions verify member bytes and mappings refuse linked directories or conflicting paths', async (t) => {
  const { root, store } = await fixture(t);
  const leaf = await store.propose({ resourceId: 'leaf', kind: 'file', owned: { bytes: 'synthetic', mediaType: 'text/plain' } });
  const input = { op: 'importBundle', resourceId: 'package', manifest: { version: 1, bundleType: 'generic', members: [member('leaf', 'file.txt', leaf.revisionId)] } };
  const bundle = await resourcesTool(root, input);
  await assert.rejects(resourcesTool(root, { ...input, manifest: { ...input.manifest, members: [member('leaf', 'a', leaf.revisionId), member('leaf', 'a/b', leaf.revisionId)] } }), { code: 'BUNDLE_INVALID' });
  const directory = join(root, 'directory'); await mkdir(directory); await writeFile(join(directory, 'source'), 'synthetic');
  await symlink(directory, join(root, 'alias'));
  await writeFile(join(root, 'source'), 'synthetic');
  await assert.rejects(resourcesTool(root, { op: 'importFile', resourceId: 'traversal', kind: 'file', path: root + '/alias/../source', mediaType: 'text/plain' }), { code: 'RESOURCE_PATH_INVALID' });
  await assert.rejects(resourcesTool(root, { op: 'importBundle', resourceId: 'linked', manifest: { version: 1, bundleType: 'generic', members: [member('child', 'source')] }, pathMappings: [{ relativePath: 'source', path: join(root, 'alias', 'source'), mediaType: 'text/plain' }] }), { code: 'RESOURCE_PATH_INVALID' });
  await writeFile(join(root, '.folio', 'resources', 'content', leaf.contentHash.slice(7) + '.bin'), 'corrupted');
  await assert.rejects(resourcesTool(root, { op: 'describe', revisionId: bundle.revisionId }), { code: 'RESOURCE_INTEGRITY_FAILURE' });
});
