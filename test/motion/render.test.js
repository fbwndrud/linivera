import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHandlers } from '../../server/tools/handlers.js';
import { recordReview, decidePublication } from '../../core/operations/publications.js';
import { get } from '../../core/operations/objects.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { queryResourceGraph } from '../../core/query/resource-graph.js';
import { motionFixture, syntheticPng, syntheticWav } from '../support/motion.js';
const exec = promisify(execFile);
const handler = () => { const h = createHandlers({ packs: new Map() }).folio_motion; assert.equal(typeof h, 'function', 'motion pack must be exposed through shared tools'); return h; };

test('motion planning distinguishes missing required audio, absent optional audio and unpinned inputs', async (t) => {
  const motion = handler(); const f = await motionFixture(t);
  const plan = async (spec, refs = [f.pose]) => motion({ root: f.root, op: 'plan', inputSnapshotId: (await f.input([await f.project(spec), ...refs])).inputSnapshotId });
  const ready = await plan(f.spec); assert.equal(ready.status, 'ready'); assert.equal(ready.plan.shots[0].layers[0].revisionId, f.pose.revisionId);
  const optional = await plan({ ...f.spec, audio: [{ role: 'music', revisionId: null, required: false }] }); assert.equal(optional.status, 'ready');
  const required = await plan({ ...f.spec, audio: [{ role: 'voice', revisionId: null, required: true }] }); assert.equal(required.status, 'needs_assets'); assert.equal(required.missing[0].role, 'voice');
  await assert.rejects(plan(f.spec, []), { code: 'MOTION_INPUT_MISSING' });
  await assert.rejects(plan({ ...f.spec, fps: 0 }), { code: 'MOTION_SPEC_INVALID' });
  await assert.rejects(plan({ ...f.spec, shots: [{ ...f.spec.shots[0], durationSeconds: 121 }] }), { code: 'MOTION_SPEC_INVALID' });
});

test('selected voice produces an observed audio stream; missing FFmpeg remains an explicit failure', async (t) => {
  const motion = handler(); const f = await motionFixture(t);
  const voice = await f.store.propose({ resourceId: 'voice', kind: 'voice', owned: { bytes: syntheticWav(), mediaType: 'audio/wav' } }); await f.select(voice);
  const project = await f.project({ ...f.spec, audio: [{ role: 'voice', revisionId: voice.revisionId, required: true, gain: 0.5, startSeconds: 0 }] });
  const input = await f.input([project, f.pose, voice]);
  const args = { root: f.root, op: 'render', inputSnapshotId: input.inputSnapshotId, idempotencyKey: 'audio', actor: 'user' };
  const originalPath = process.env.PATH; process.env.PATH = '/path-with-no-executables';
  try { await assert.rejects(motion(args), { code: 'MOTION_RENDERER_UNAVAILABLE' }); } finally { process.env.PATH = originalPath; }
  const rendered = await motion(args); const shot = await f.store.readRevision(rendered.shots[0].revisionId); await f.select(shot);
  const compiled = await motion({ ...args, op: 'compile', inputSnapshotId: (await f.input([project, f.pose, voice, shot])).inputSnapshotId, idempotencyKey: 'audio-compile' });
  const timeline = await f.store.readRevision(compiled.timelineRevisionId); await f.select(timeline);
  const assembly = await f.input([timeline, shot, voice]);
  const finalArgs = { ...args, op: 'assemble', inputSnapshotId: assembly.inputSnapshotId, idempotencyKey: 'audio-assemble' };
  const result = await motion(finalArgs); assert.equal(result.technical.audio, true); assert.equal(result.technical.observation, 'local-ffprobe');
  assert.equal(result.creativeReview, 'not-performed'); assert.deepEqual(await motion(finalArgs), result);
  const changed = await f.project({ ...f.spec, width: 128 });
  await assert.rejects(motion({ ...args, inputSnapshotId: (await f.input([changed, f.pose])).inputSnapshotId }), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('real motion shots and final assembly preserve IDs, independent operations and explicit selection', async (t) => {
  const motion = handler(); const f = await motionFixture(t);
  const pose2 = await f.store.propose({ resourceId: 'pose2', kind: 'character-pose', owned: { bytes: syntheticPng(20, 220), mediaType: 'image/png' } }); await f.select(pose2);
  const project = await f.project({ ...f.spec, shots: [...f.spec.shots, { ...f.spec.shots[0], layers: [{ ...f.spec.shots[0].layers[0], revisionId: pose2.revisionId, dx: -16, x: 32 }] }] });
  const args = { root: f.root, op: 'render', inputSnapshotId: (await f.input([project, f.pose, pose2])).inputSnapshotId, idempotencyKey: 'movie', actor: 'user' };
  const result = await motion(args); assert.equal(result.status, 'submitted'); assert.equal(result.shots.length, 2);
  assert.equal(result.operationIds.length, 2);
  assert.deepEqual(await motion(args), result);
  for (const id of result.resultRevisionIds) assert.equal(await f.store.readSourceSelection((await f.store.readRevision(id)).resourceId), null);
  const before = await f.input([project]);
  await assert.rejects(motion({ ...args, op: 'assemble', inputSnapshotId: before.inputSnapshotId, idempotencyKey: 'assemble' }), { code: 'MOTION_INPUT_INVALID' });
  for (const operationId of result.operationIds) {
    const output = await get(f.root, 'results', operationId);
    const receiptId = await recordReview(f.root, { operationId, outputHashes: output.outputs.map((o) => o.contentHash), findings: [], reviewer: 'host' });
    await decidePublication(f.root, { operationId, receiptId, action: 'approve', actor: 'user', expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint });
    for (const id of output.resultRevisionIds) await f.select(await f.store.readRevision(id));
  }
  const shots = await Promise.all(result.shots.map((s) => f.store.readRevision(s.revisionId)));
  const compiled = await motion({ ...args, op: 'compile', inputSnapshotId: (await f.input([project, f.pose, pose2, ...shots])).inputSnapshotId, idempotencyKey: 'compile' });
  const timeline = await f.store.readRevision(compiled.timelineRevisionId); await f.select(timeline);
  const assemblyInput = await f.input([timeline, ...await Promise.all(result.shots.map((s) => f.store.readRevision(s.revisionId)))]);
  const final = await motion({ ...args, op: 'assemble', inputSnapshotId: assemblyInput.inputSnapshotId, idempotencyKey: 'assemble' });
  assert.equal(final.status, 'submitted'); const video = await f.store.readRevision(final.resultRevisionIds[0]); assert.equal(video.resourceId, 'film'); assert.equal(video.mediaType, 'video/mp4');
  const path = join(f.root, 'check.mp4'); await writeFile(path, await f.store.readContent(video.revisionId));
  const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path])).stdout);
  assert.equal(probe.streams[0].width, 64); assert.ok(Math.abs(Number(probe.format.duration) - 2) < 0.2);
  const frames = (await exec('ffmpeg', ['-v', 'error', '-i', path, '-f', 'framemd5', '-'])).stdout.split('\n').filter((s) => /^0,/.test(s));
  assert.ok(new Set(frames.map((s) => s.split(',').at(-1).trim())).size > 2, 'actual rendered positions must change');
  const graph = await queryResourceGraph(f.root, { resourceId: 'film', direction: 'upstream' });
  assert.ok(graph.nodes.some((n) => n.revisionId === f.pose.revisionId)); assert.ok(graph.nodes.some((n) => n.revisionId === timeline.revisionId));
  assert.ok(graph.edges.some((e) => e.kind === 'input' && e.source === 'revision:' + shots[0].revisionId && e.target === 'operation:' + compiled.operationIds[0]), 'compiled timeline pins the actual shot, not only its name in JSON');
  const shotInputs = graph.edges.filter((e) => e.kind === 'input' && e.target === 'operation:' + result.shots[0].operationId);
  assert.ok(shotInputs.some((e) => e.source === 'revision:' + f.pose.revisionId));
  assert.ok(!shotInputs.some((e) => e.source === 'revision:' + pose2.revisionId), 'unused pose is not claimed as a shot input');
});
