import { startOperation, submitResult, outputBindings, readOperation } from '../operations/requests.js';
import { get } from '../operations/objects.js';
import { createResourceStore } from '../resources/revisions.js';
import { listResourceRevisions } from '../resources/catalog.js';
import { canonicalJson } from '../util/hash.js';
import { FolioError } from '../errors.js';
import { withWorkspaceStateTransaction } from '../publications/state.js';
import { verifyInput } from '../resources/input-snapshots.js';
import { checkAuthority } from '../operations/authority.js';

/** Rendering is supplied by the pack adapter; authority and output binding stay common. */
export async function motionOperation(root, input, output, execute) {
  const request = await startOperation(root, input);
  const previous = await get(root, 'results', request.operationId, true);
  if (previous) {
    const bound = await readOperation(root, request.operationId);
    const bindings = await outputBindings(root, previous.resultRevisionIds);
    if (previous.requestId !== bound.requestId || previous.inputSnapshotId !== input.inputSnapshotId || canonicalJson(bindings) !== canonicalJson(previous.outputs)) throw new FolioError('OPERATION_INTEGRITY_FAILURE', 'motion result bindings differ');
    const revision = bindings.length === 1 ? await createResourceStore(root).readRevision(bindings[0].revisionId) : null;
    if (previous.operationId !== request.operationId || !revision || revision.resourceId !== output.resourceId || revision.kind !== output.kind || revision.schemaRef !== output.schemaRef
      || revision.mediaType !== (output.kind === 'motion-timeline' ? 'application/json' : 'video/mp4')
      || previous.trace?.reported?.renderer !== 'folio.ffmpeg.cutout.v1' || previous.trace?.reported?.creativeReview !== 'not-performed') throw new FolioError('MOTION_RESULT_MISMATCH', 'submitted result does not match this motion output contract');
    return previous;
  }
  // Existing pending requests are resumable, but do not retain revoked execution authority.
  await withWorkspaceStateTransaction(root, async ({ state }) => {
    const { manifest } = await verifyInput(root, input.inputSnapshotId);
    checkAuthority(manifest, state, input.actor, input.grantId, 'create-candidate');
  });
  const existing = (await listResourceRevisions(root)).filter((r) => r.resourceId === output.resourceId);
  if (existing.some((r) => r.kind !== output.kind || !r.schemaRef?.startsWith('folio.motion.v1.'))) throw new FolioError('RESOURCE_ID_CONFLICT', 'motion output ID already belongs to an unrelated resource');
  const { bytes, technical } = await execute();
  const revision = await createResourceStore(root).propose({ ...output, owned: { bytes, mediaType: output.kind === 'motion-timeline' ? 'application/json' : 'video/mp4' } });
  return submitResult(root, { ...request, inputSnapshotId: input.inputSnapshotId, resultRevisionIds: [revision.revisionId], reportedTrace: {
    renderer: 'folio.ffmpeg.cutout.v1', technical, creativeReview: 'not-performed', cost: 'local-compute' } });
}
