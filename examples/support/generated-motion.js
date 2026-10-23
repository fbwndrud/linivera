/** Existing motion pack consumes retained revisions without provider-specific knowledge. */
export async function generatedMotion(host, image, audio) {
  const { json, select, input, call, approve } = host;
  const project = await json('project', { version: 1, outputResourceId: 'film', width: 64, height: 64, fps: 8,
    shots: [{ durationSeconds: 1, backgroundColor: '#eeeeee', layers: [{ revisionId: image.revisionId, x: 0, y: 16, width: 16, dx: 32 }] }],
    audio: [{ role: 'voice', revisionId: audio.revisionId, required: true }] }, 'motion-project');
  await select(project);
  const sources = [project, image, audio];
  const args = { inputSnapshotId: (await input(sources)).inputSnapshotId, idempotencyKey: 'generated-motion', actor: 'user' };
  const rendered = await call('folio_motion', { op: 'render', ...args });
  const shot = await approve(rendered.operationIds[0], rendered.resultRevisionIds[0]);
  const compiled = await call('folio_motion', { op: 'compile', ...args, inputSnapshotId: (await input([...sources, shot])).inputSnapshotId, idempotencyKey: 'generated-compile' });
  const timeline = await approve(compiled.operationIds[0], compiled.timelineRevisionId);
  const assembled = await call('folio_motion', { op: 'assemble', ...args, inputSnapshotId: (await input([timeline, shot, audio])).inputSnapshotId, idempotencyKey: 'generated-assemble' });
  const video = await approve(assembled.operationIds[0], assembled.resultRevisionIds[0]);
  return { shot, timeline, video, videoAudio: assembled.technical.audio };
}
