import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
import { readBundle } from '../../core/resources/bundles.js';
import { importResourceFile } from '../../core/resources/intake.js';
import { retainProductionArtifacts } from '../../server/production/retain.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'linivera-capture-bundle-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const invoke = async (name, input) => {
    assert.equal(name, 'folio_resources');
    if (input.op === 'propose') { const { op: _, ...proposal } = input;
      if (proposal.owned.base64 !== undefined) proposal.owned = { bytes: Buffer.from(proposal.owned.base64, 'base64'), mediaType: proposal.owned.mediaType };
      return store.propose(proposal); }
    if (input.op === 'importFile') { const { op: _, ...proposal } = input; return importResourceFile(root, proposal); }
    assert.fail('unexpected operation');
  };
  const json = (resourceId, value, kind) => store.propose({ resourceId, kind, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
  const member = { artifactKey: 'source', groupId: 'A', role: 'source', resourceId: 'source-file', bytes: Buffer.from('synthetic source'), mediaType: 'text/plain' };
  const bundle = { artifactKey: 'bundle', groupId: 'A', role: 'bundle', resourceId: 'file-bundle', bundleType: 'workflow',
    members: [{ artifactKey: 'source', relativePath: 'source/workflow.json', role: 'source', required: true }], unavailable: [], dependencyCoverage: 'unknown', restorability: 'unknown' };
  return { root, store, invoke, json, member, bundle, prepared: { request: { inputBindings: [] } } };
}
test('capture retains files first and seals a typed bundle to their actual revisions', async (t) => {
  const f = await fixture(t);
  const { artifacts } = await retainProductionArtifacts({ ...f, collection: { artifacts: [f.member], bundles: [f.bundle] } });
  assert.equal(artifacts.length, 2); assert.equal(artifacts[1].kind, 'artifact-bundle');
  const bundle = await readBundle(f.root, artifacts[1].revisionId);
  assert.equal(bundle.members[0].revisionId, artifacts[0].revisionId);
  assert.equal(bundle.members[0].resourceId, artifacts[0].resourceId);
  assert.equal(bundle.dependencyCoverage, 'unknown'); assert.equal(bundle.restorability, 'unknown');
  const recovered = await retainProductionArtifacts({ ...f, collection: { artifacts: [], bundles: [f.bundle] }, priorArtifacts: artifacts });
  assert.equal(recovered.artifacts[0].revisionId, artifacts[1].revisionId);
});
test('bundle capture rejects cross-group members, duplicate keys and byte transfers over 8MiB', async (t) => {
  const f = await fixture(t);
  await assert.rejects(() => retainProductionArtifacts({ ...f, collection: { artifacts: [{ ...f.member, groupId: 'B' }], bundles: [f.bundle] } }), { code: 'PRODUCTION_CAPTURE_INVALID' });
  await assert.rejects(() => retainProductionArtifacts({ ...f, collection: { artifacts: [f.member, f.member], bundles: [] } }), { code: 'PRODUCTION_CAPTURE_INVALID' });
  await assert.rejects(() => retainProductionArtifacts({ ...f, collection: { artifacts: [{ ...f.member, bytes: Buffer.alloc(8 * 1024 * 1024 + 1) }] } }), { code: 'PRODUCTION_CAPTURE_INVALID' });
});
test('large local capture is streamed and required missing files remain incomplete', async (t) => {
  const f = await fixture(t); const path = join(f.root, 'large-source.txt'); await writeFile(path, Buffer.alloc(8 * 1024 * 1024 + 1, 'x'));
  const bundle = { ...f.bundle, unavailable: [{ role: 'build', required: true, reason: 'Build export missing' }], dependencyCoverage: 'partial' };
  const { bytes: _, ...file } = f.member;
  const result = await retainProductionArtifacts({ ...f, collection: { artifacts: [{ ...file, path }], bundles: [bundle] } });
  assert.equal(result.artifacts[0].byteLength, 8 * 1024 * 1024 + 1);
  assert.equal(result.artifacts.length, 1); assert.equal(result.bundleObservations.length, 1);
  assert.equal((await readBundle(f.root, result.bundleObservations[0].revisionId)).completeness, 'incomplete');
});
