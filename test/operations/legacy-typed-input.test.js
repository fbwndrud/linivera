import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scopedFixture } from '../resources/scoped-fixture.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';
import { startOperation, readOperation } from '../../core/operations/requests.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';

test('old typed v1 snapshots remain verifiable and replayable but new operations require fresh closure', async (t) => {
  const f = await scopedFixture(t);
  const change = await f.resource('change', 'synthetic expression change'); await f.select(change);
  const iteration = await f.resource('iteration', { version: 1, scopeId: 'episode-8', baseRevisionIds: [f.face2.revisionId], preserveRefs: [], changeRequestRevisionId: change.revisionId }, 'iteration'); await f.select(iteration);
  const fresh = await prepareInput(f.root, { revisionIds: [iteration.revisionId], ...f.definitions });
  const historical = JSON.parse(canonicalJson(fresh.manifest));
  delete historical.referenceClosureVersion;
  historical.resources = historical.resources.filter((resource) => resource.revisionId === iteration.revisionId);
  const ids = new Set([iteration.revisionId, ...Object.values(f.definitions)]);
  historical.selections = historical.selections.filter((selection) => ids.has(selection.revisionId));
  historical.scope = ['iteration'];
  historical.totalBytes = iteration.byteLength + Object.values(historical.definitions).reduce((total, definition) => total + definition.byteLength, 0);
  const bytes = canonicalJson(historical); const inputSnapshotId = sha256(bytes);
  await writeFile(join(f.root, '.folio/resources/inputs', inputSnapshotId.slice(7) + '.json'), bytes);
  assert.deepEqual((await verifyInput(f.root, inputSnapshotId)).manifest, historical);
  await assert.rejects(startOperation(f.root, { inputSnapshotId, idempotencyKey: 'new-from-old', actor: 'user' }), { code: 'INPUT_REFERENCE_CLOSURE_REQUIRED' });

  // Synthetic historical request, in the exact persisted pre-guard format.
  const old = { inputSnapshotId, idempotencyKey: 'already-started', actor: 'user' };
  const operationId = sha256(canonicalJson({ idempotencyKey: old.idempotencyKey })); const requestId = sha256(canonicalJson(old));
  const request = { ...old, operationId, requestId }; await mkdir(join(f.root, '.folio/operations/requests'), { recursive: true });
  await writeFile(join(f.root, '.folio/operations/requests', operationId.slice(7) + '.json'), canonicalJson({ digest: sha256(canonicalJson(request)), value: request }));
  assert.deepEqual(await readOperation(f.root, operationId), request);
  assert.deepEqual(await startOperation(f.root, old), { operationId, requestId });
  assert.ok((await startOperation(f.root, { inputSnapshotId: fresh.inputSnapshotId, idempotencyKey: 'fresh-closure', actor: 'user' })).operationId);
});

test('old alignment snapshots still verify but cannot start new work without referenced audio and text', async (t) => {
  const f = await scopedFixture(t);
  const audio = await f.store.propose({ resourceId: 'music', kind: 'production-artifact', owned: { bytes: Buffer.from('Synthetic audio'), mediaType: 'audio/mpeg' } }); await f.select(audio);
  const alignment = await f.resource('iteration', { version: 1, audioRevisionId: audio.revisionId, textRevisionId: f.face2.revisionId,
    alignmentKind: 'character', timebase: { unit: 'seconds', origin: 0 }, segments: [] }, 'audio-alignment'); await f.select(alignment);
  const fresh = await prepareInput(f.root, { revisionIds: [alignment.revisionId], ...f.definitions });
  const historical = JSON.parse(canonicalJson(fresh.manifest)); delete historical.referenceClosureVersion;
  historical.resources = historical.resources.filter((resource) => resource.revisionId === alignment.revisionId);
  const ids = new Set([alignment.revisionId, ...Object.values(f.definitions)]);
  historical.selections = historical.selections.filter((selection) => ids.has(selection.revisionId)); historical.scope = ['iteration'];
  historical.totalBytes = alignment.byteLength + Object.values(historical.definitions).reduce((total, definition) => total + definition.byteLength, 0);
  const bytes = canonicalJson(historical); const inputSnapshotId = sha256(bytes);
  await writeFile(join(f.root, '.folio/resources/inputs', inputSnapshotId.slice(7) + '.json'), bytes);
  assert.deepEqual((await verifyInput(f.root, inputSnapshotId)).manifest, historical);
  await assert.rejects(startOperation(f.root, { inputSnapshotId, idempotencyKey: 'old-alignment', actor: 'user' }), { code: 'INPUT_REFERENCE_CLOSURE_REQUIRED' });
});
