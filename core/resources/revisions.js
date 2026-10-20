import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { withWorkLock } from '../run/work-lock.js';
import { readWorkspaceState, withWorkspaceStateTransaction } from '../publications/state.js';
import { assertResourceId, assertRevisionId, validateProposal } from './schema.js';
import { readObject, readOwnedContent, resourceObjectPath, writeImmutable } from './files.js';

export function createResourceStore(root) {
  async function readRevision(revisionId) {
    assertRevisionId(revisionId);
    const bytes = await readObject(root, resourceObjectPath(root, revisionId, 'revisions'));
    let envelope;
    try { envelope = JSON.parse(bytes.toString('utf8')); } catch { throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'invalid revision JSON'); }
    if (sha256(canonicalJson(envelope)) !== revisionId || envelope.version !== 1) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'revision envelope hash differs');
    if (envelope.storageStatus === 'owned_snapshot') await readOwnedContent(root, envelope);
    return { ...envelope, revisionId };
  }
  async function readContent(revisionId) {
    const envelope = await readRevision(revisionId);
    if (envelope.storageStatus !== 'owned_snapshot') throw new FolioError('RESOURCE_CONTENT_UNAVAILABLE', 'external bytes have not been observed');
    return readOwnedContent(root, envelope);
  }
  async function propose(input) {
    validateProposal(input);
    input = { ...input, parents: [...(input.parents ?? [])], ...(input.owned ? { owned: { ...input.owned, bytes: Buffer.from(input.owned.bytes) } } : { external: { ...input.external } }) };
    return withWorkLock(root, () => proposeResourceLocked(root, input));
  }
  async function readSourceSelection(resourceId) {
    assertResourceId(resourceId);
    const selection = (await readWorkspaceState(root)).sourceSelections[resourceId] ?? null;
    if (selection?.revisionId) {
      const revision = await readRevision(selection.revisionId);
      if (revision.resourceId !== resourceId) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'selection references a different resource');
    }
    return selection;
  }
  async function decideSource({ revisionId, expectedSelectionRevision, action }) {
    action = action && typeof action === 'object' && !Array.isArray(action) ? { ...action } : null;
    if (!action || action.actor !== 'user' || !['select', 'deselect'].includes(action.type) || Object.keys(action).some((key) => !['type', 'actor', 'reason'].includes(key)) || (action.reason !== undefined && (typeof action.reason !== 'string' || action.reason.length > 8192)) || (action.type === 'deselect' && !action.reason?.trim())) throw new FolioError('SOURCE_DECISION_INVALID', 'explicit caller-attested user action is required; deselect needs a reason');
    return withWorkspaceStateTransaction(root, async ({ state, append }) => {
      const revision = await readRevision(revisionId);
      const previous = state.sourceSelections[revision.resourceId];
      if (expectedSelectionRevision !== (previous?.selectionRevision ?? null)) throw new FolioError('SOURCE_SELECTION_CONFLICT', 'selection marker has changed');
      if (action.type === 'deselect' && previous?.revisionId !== revisionId) throw new FolioError('SOURCE_SELECTION_CONFLICT', 'deselect must name the currently selected revision');
      const payload = { resourceId: revision.resourceId, revisionId: action.type === 'select' ? revisionId : null, inputRefs: [{ resourceId: revision.resourceId, revisionId, contentHash: revision.contentHash, storageStatus: revision.storageStatus }], expectedSelectionRevision, action };
      const checkpoint = await append({ kind: 'source-selection', payload, expectedCheckpoint: state.checkpoint });
      return { ...payload, selectionRevision: checkpoint.hash, checkpoint };
    });
  }
  return Object.freeze({ propose, readRevision, readContent, decideSource, readSourceSelection });
}

/** Internal write seam: caller must already hold the workspace lock. */
export async function proposeResourceLocked(root, input) {
  validateProposal(input);
  const store = createResourceStore(root);
  for (const parentId of input.parents ?? []) {
    const parent = await store.readRevision(parentId);
    if (parent.resourceId !== input.resourceId) throw new FolioError('RESOURCE_PARENT_INVALID', 'parent belongs to another resource');
  }
  const envelope = { version: 1, resourceId: input.resourceId, kind: input.kind, parents: input.parents ?? [], ...(input.schemaRef === undefined ? {} : { schemaRef: input.schemaRef }) };
  if (input.owned) {
    const bytes = Buffer.from(input.owned.bytes);
    Object.assign(envelope, { storageStatus: 'owned_snapshot', contentHash: sha256(bytes), byteLength: bytes.length, mediaType: input.owned.mediaType });
    await writeImmutable(root, resourceObjectPath(root, sha256(bytes), 'content'), bytes);
  } else Object.assign(envelope, { storageStatus: 'external_unobserved', contentHash: null, external: input.external });
  const revisionId = sha256(canonicalJson(envelope));
  await writeImmutable(root, resourceObjectPath(root, revisionId, 'revisions'), canonicalJson(envelope));
  return { ...envelope, revisionId };
}
