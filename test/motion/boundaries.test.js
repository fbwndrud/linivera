import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { motionFixture } from '../support/motion.js';
import { motionOperation } from '../../core/motion/operation.js';
import { startOperation, submitResult } from '../../core/operations/requests.js';
import { ffmpegMotion } from '../../adapters/motion/ffmpeg.js';
const exec = promisify(execFile);
const expected = { resourceId: 'film-shot-01', kind: 'motion-shot', schemaRef: 'folio.motion.v1.shot:synthetic' };
test('a pending render rechecks current authority before executing or registering another candidate', async (t) => {
  const f = await motionFixture(t); const project = await f.project();
  const input = { inputSnapshotId: (await f.input([project, f.pose])).inputSnapshotId, idempotencyKey: 'pending', actor: 'user' };
  await assert.rejects(motionOperation(f.root, input, expected, async () => { throw new Error('synthetic interruption'); }));
  const policy = await f.store.readRevision(f.definitions.policyRevisionId);
  await f.store.decideSource({ revisionId: policy.revisionId, expectedSelectionRevision: (await f.store.readSourceSelection(policy.resourceId)).selectionRevision,
    action: { actor: 'user', type: 'deselect', reason: 'Synthetic authority withdrawal' } });
  let calls = 0;
  await assert.rejects(motionOperation(f.root, input, expected, async () => { calls++; return { bytes: Buffer.from('synthetic invalid video'), technical: {} }; }), { code: 'POLICY_DENIED' });
  assert.equal(calls, 0, 'denied authority must stop the adapter before local compute');
  assert.equal(await f.store.readSourceSelection(expected.resourceId), null);
});
test('a generic submitted PNG cannot be resumed as a successful motion shot', async (t) => {
  const f = await motionFixture(t); const project = await f.project();
  const input = { inputSnapshotId: (await f.input([project, f.pose])).inputSnapshotId, idempotencyKey: 'wrong-output', actor: 'user' };
  const request = await startOperation(f.root, input);
  await submitResult(f.root, { ...request, inputSnapshotId: input.inputSnapshotId, resultRevisionIds: [f.pose.revisionId] });
  await assert.rejects(motionOperation(f.root, input, expected, async () => { throw new Error('must not render'); }), { code: 'MOTION_RESULT_MISMATCH' });
});
test('declared video cannot execute a DASH manifest with unregistered external segments', async (t) => {
  const f = await motionFixture(t); const path = join(f.root, 'unregistered.mpd');
  await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=8:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'dash', path]);
  const manifest = (await readFile(path, 'utf8')).replace(/(initialization|media)="/g, `$1="${f.root}/`);
  await assert.rejects(ffmpegMotion.assemble({ width: 64, height: 64, fps: 8, shots: [{ durationSeconds: 1, bytes: Buffer.from(manifest) }], audio: [] }), { code: 'MOTION_RENDER_FAILED' });
});
