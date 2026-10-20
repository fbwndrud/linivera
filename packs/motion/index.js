import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { restrictInput } from '../../core/resources/input-snapshots.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { verifyInput } from '../../core/resources/input-snapshots.js';
import { FolioError } from '../../core/errors.js';
import { motionOperation } from '../../core/motion/operation.js';
import { motionInput, planMotion } from './plan.js';
export { planMotion };
const renderer = 'folio.ffmpeg.cutout.v1';
function childKey(key, stage) { return 'folio.motion.v1:' + sha256(canonicalJson({ key, stage })); }
function operationArgs(input, stage, snapshot = input.inputSnapshotId) {
  return { inputSnapshotId: snapshot, idempotencyKey: childKey(input.idempotencyKey, stage), actor: input.actor,
    ...(input.grantId === undefined ? {} : { grantId: input.grantId }) };
}
export async function renderMotion(root, input, adapter) {
  const planned = await planMotion(root, input); if (planned.status !== 'ready') return planned;
  const { plan, specRevisionId } = planned; const store = createResourceStore(root); const shots = []; const results = [];
  for (const [index, shot] of plan.shots.entries()) {
    const refs = [...new Set([specRevisionId, ...shot.layers.map((l) => l.revisionId)])];
    const subset = await restrictInput(root, input.inputSnapshotId, refs);
    const ordinal = String(index + 1).padStart(2, '0');
    const result = await motionOperation(root, operationArgs(input, 'shot-' + ordinal, subset.inputSnapshotId), {
      resourceId: plan.outputResourceId + '-shot-' + ordinal, kind: 'motion-shot', schemaRef: 'folio.motion.v1.shot:' + specRevisionId + ':' + ordinal,
    }, async () => adapter.renderShot({ ...plan, ...shot, layers: await Promise.all(shot.layers.map(async (l) => ({ ...l, bytes: await store.readContent(l.revisionId) }))) }));
    results.push(result); shots.push({ revisionId: result.resultRevisionIds[0], durationSeconds: shot.durationSeconds, operationId: result.operationId });
  }
  return { status: 'submitted', operationIds: results.map((r) => r.operationId), resultRevisionIds: results.flatMap((r) => r.resultRevisionIds), shots, creativeReview: 'not-performed' };
}
export async function compileMotion(root, input) {
  const planned = await planMotion(root, input); if (planned.status !== 'ready') return planned;
  const { plan, specRevisionId } = planned; const store = createResourceStore(root);
  const { manifest } = await verifyInput(root, input.inputSnapshotId);
  const resources = await Promise.all(manifest.revisionIds.map((id) => store.readRevision(id))); const shots = [];
  for (const [index, shot] of plan.shots.entries()) {
    const ordinal = String(index + 1).padStart(2, '0');
    const selected = resources.find((r) => r.resourceId === plan.outputResourceId + '-shot-' + ordinal);
    if (!selected || selected.kind !== 'motion-shot' || selected.storageStatus !== 'owned_snapshot' || selected.mediaType !== 'video/mp4'
      || selected.schemaRef !== 'folio.motion.v1.shot:' + specRevisionId + ':' + ordinal) throw new FolioError('MOTION_INPUT_MISSING', 'compile requires the selected shot revisions made from this project');
    shots.push({ revisionId: selected.revisionId, durationSeconds: shot.durationSeconds });
  }
  const timeline = { version: 1, outputResourceId: plan.outputResourceId, width: plan.width, height: plan.height, fps: plan.fps,
    shots: shots.map(({ revisionId, durationSeconds }) => ({ revisionId, durationSeconds })), audio: plan.audio, renderer };
  const subset = await restrictInput(root, input.inputSnapshotId, [specRevisionId, ...shots.map((s) => s.revisionId)]);
  const result = await motionOperation(root, operationArgs(input, 'timeline', subset.inputSnapshotId), {
    resourceId: plan.outputResourceId + '-timeline', kind: 'motion-timeline', schemaRef: 'folio.motion.v1.timeline:' + specRevisionId,
  }, async () => ({ bytes: canonicalJson(timeline), technical: { compiled: true, shotCount: shots.length } }));
  return { status: 'submitted', operationIds: [result.operationId], resultRevisionIds: result.resultRevisionIds,
    timelineRevisionId: result.resultRevisionIds[0], shots, creativeReview: 'not-performed' };
}
export async function assembleMotion(root, input, adapter) {
  const planned = await motionInput(root, input.inputSnapshotId, 'motion-timeline'); if (planned.status !== 'ready') return planned;
  const { plan, specRevisionId } = planned; const store = createResourceStore(root);
  const result = await motionOperation(root, operationArgs(input, 'assemble'), {
    resourceId: plan.outputResourceId, kind: 'motion-video', schemaRef: 'folio.motion.v1.video:' + specRevisionId,
  }, async () => adapter.assemble({ ...plan, shots: await Promise.all(plan.shots.map(async (s) => ({ ...s, bytes: await store.readContent(s.revisionId) }))),
    audio: await Promise.all(plan.audio.filter((a) => a.revisionId).map(async (a) => ({ ...a, bytes: await store.readContent(a.revisionId) }))) }));
  return { status: 'submitted', operationIds: [result.operationId], resultRevisionIds: result.resultRevisionIds, creativeReview: 'not-performed', technical: result.trace.reported.technical };
}
