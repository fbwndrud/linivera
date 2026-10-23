import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resourcesTool } from '../../server/tools/resources.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';

const families = [
  ['audio-with-alignment', [['voice', 'voice.wav', 'audio/wav', 'audio'], ['alignment', 'alignment.json', 'application/json', 'alignment']]],
  ['model-with-textures', [['mesh', 'model.glb', 'model/gltf-binary', 'mesh'], ['texture', 'albedo.png', 'image/png', 'base-color'], ['rig', 'rig.fbx', 'application/octet-stream', 'rig'], ['clip', 'walk.glb', 'model/gltf-binary', 'animation']]],
  ['editing-project', [['timeline', 'timeline.xml', 'application/xml', 'timeline'], ['clip', 'clip.mp4', 'video/mp4', 'media']]],
  ['game-project', [['source', 'src/main.js', 'application/javascript', 'source'], ['lock', 'package-lock.json', 'application/json', 'lockfile'], ['build', 'dist/game.bin', 'application/octet-stream', 'build']]],
];

for (const [bundleType, files] of families) test(`${bundleType} preserves all synthetic members, opaque status and reusable pinned input`, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-family-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root); const mappings = []; const sourceBytes = new Map(); const revisions = [];
  for (const [resourceId, relativePath, mediaType] of files) {
    const bytes = mediaType === 'application/json'
      ? Buffer.from(JSON.stringify(resourceId === 'alignment' ? { version: 1, audioRevisionId: revisions[0].revisionId, synthetic: true } : { version: 1, synthetic: true }))
      : Buffer.from(`synthetic ${resourceId} bytes; not decoded`);
    const path = join(root, resourceId + '.input'); await writeFile(path, bytes); sourceBytes.set(resourceId, bytes);
    mappings.push({ relativePath, path, mediaType });
    revisions.push(await resourcesTool(root, { op: 'importFile', resourceId, kind: 'artifact-file', path, mediaType }));
  }
  const revision = await resourcesTool(root, { op: 'importBundle', resourceId: 'package', manifest: { version: 1, bundleType,
    members: files.map(([resourceId, relativePath, , role]) => ({ resourceId, relativePath, role, required: true })) }, pathMappings: mappings });
  const described = await resourcesTool(root, { op: 'describe', revisionId: revision.revisionId });
  assert.equal(described.bundle.completeness, 'complete'); assert.equal(described.bundle.restorability, 'unknown');
  assert.deepEqual(described.bundle.members.map((member) => member.role), files.map((file) => file[3]));
  assert.deepEqual(described.bundle.members.map((member) => member.relativePath), files.map((file) => file[1]));
  for (const member of described.bundle.members) {
    const metadata = await resourcesTool(root, { op: 'describe', revisionId: member.revisionId });
    const mediaType = files.find((file) => file[0] === member.resourceId)[2];
    assert.equal(metadata.validation.format, mediaType === 'application/json' ? 'validated' : 'opaque');
    assert.equal(metadata.validation.level, mediaType === 'application/json' ? 'json-syntax' : 'bytes-only');
    const output = join(root, member.resourceId + '.copy');
    await resourcesTool(root, { op: 'materialize', revisionId: member.revisionId, output });
    assert.deepEqual(await readFile(output), sourceBytes.get(member.resourceId));
    assert.equal(await store.readSourceSelection(member.resourceId), null);
  }
  async function select(item) {
    await store.decideSource({ revisionId: item.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
  }
  for (const item of [...revisions, revision]) await select(item);
  const scope = ['package', ...files.map((file) => file[0])]; const input = { revisionIds: [revision.revisionId] };
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 1000000 }], ['pipeline', { version: 1, steps: [{ id: 'reuse', capability: 'transform' }] }], ['policy', { version: 1, scope, allowedActions: ['create-candidate'] }]]) {
    const definition = await store.propose({ resourceId: kind, kind, owned: { mediaType: 'application/json', bytes: JSON.stringify(value) } });
    await select(definition); input[kind + 'RevisionId'] = definition.revisionId;
  }
  const prepared = await prepareInput(root, input); const verified = await verifyInput(root, prepared.inputSnapshotId);
  assert.equal(verified.manifest.resources.length, files.length + 1);
  assert.deepEqual(verified.manifest.resources.map((item) => item.revisionId), [revision.revisionId, ...revisions.map((item) => item.revisionId)]);
  assert.equal(verified.manifest.byteBudgetComplete, true);
});
