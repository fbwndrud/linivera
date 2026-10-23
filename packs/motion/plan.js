import { FolioError } from '../../core/errors.js';
import { verifyInput } from '../../core/resources/input-snapshots.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { validateProject, validateTimeline } from './schema.js';
export async function motionInput(root, inputSnapshotId, kind) {
  const { manifest } = await verifyInput(root, inputSnapshotId); const store = createResourceStore(root);
  const resources = await Promise.all(manifest.revisionIds.map((id) => store.readRevision(id)));
  const projects = resources.filter((r) => r.kind === kind);
  if (projects.length !== 1 || projects[0].storageStatus !== 'owned_snapshot' || projects[0].mediaType !== 'application/json') throw new FolioError('MOTION_INPUT_INVALID', `exactly one selected owned JSON ${kind} required`);
  const project = projects[0]; const bytes = await store.readContent(project.revisionId);
  const plan = (kind === 'motion-project' ? validateProject : validateTimeline)(JSON.parse(bytes.toString('utf8')));
  const missing = [];
  const requireRevision = (id, mediaTypes) => {
    const ref = resources.find((r) => r.revisionId === id);
    if (!ref) throw new FolioError('MOTION_INPUT_MISSING', `revision is not pinned in this input: ${id}`);
    if (ref.storageStatus !== 'owned_snapshot' || !mediaTypes.includes(ref.mediaType)) throw new FolioError('MOTION_INPUT_INVALID', 'motion inputs must be observed supported media');
  };
  for (const shot of plan.shots) {
    if (kind === 'motion-project') for (const layer of shot.layers) requireRevision(layer.revisionId, ['image/png', 'image/jpeg', 'image/webp']);
    else requireRevision(shot.revisionId, ['video/mp4']);
  }
  for (const track of plan.audio) {
    if (track.revisionId === null) { if (track.required) missing.push({ role: track.role, reason: 'required-audio-missing' }); }
    else requireRevision(track.revisionId, ['audio/wav', 'audio/mpeg']);
  }
  return { status: missing.length ? 'needs_assets' : 'ready', specRevisionId: project.revisionId, plan, missing };
}
export const planMotion = (root, { inputSnapshotId }) => motionInput(root, inputSnapshotId, 'motion-project');
