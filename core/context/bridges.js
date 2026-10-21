import { FolioError } from '../errors.js';
import { readTree } from '../store/tree.js';
import { readTracking, readHistoricalTracking } from '../tracking/records.js';
import { readEntities } from '../store/entities.js';
import { sha256 } from '../util/hash.js';
import { createResourceStore } from '../resources/revisions.js';
import { recordObject, contextText } from '../resources/context-records.js';

function invalid(message) { throw new FolioError('CONTEXT_BRIDGE_INVALID', message); }
export async function verifyRetainedNodeBridge(root, value) {
  recordObject(value, ['nodeId', 'bodyHash', 'revisionId', 'start', 'end', 'quote']);
  contextText(value.nodeId, 'nodeId');
  const store = createResourceStore(root); const source = await store.readRevision(value.revisionId);
  if (source.storageStatus !== 'owned_snapshot' || source.mediaType !== 'text/plain' || source.contentHash !== value.bodyHash) invalid('node bridge must bind exact retained body hash and revision');
  const body = (await store.readContent(source.revisionId)).toString('utf8');
  if (value.start !== undefined || value.end !== undefined || value.quote !== undefined) {
    if (!Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || value.start < 0 || value.end < value.start || value.end > body.length
      || typeof value.quote !== 'string' || body.slice(value.start, value.end) !== value.quote) invalid('node quote differs from exact retained body range');
  }
  return { nodeId: value.nodeId, revisionId: value.revisionId, bodyHash: value.bodyHash };
}
export async function verifyNodeBridge(root, value) {
  const retained = await verifyRetainedNodeBridge(root, value);
  const tree = await readTree(root);
  if (tree.errors.length) invalid('manuscript tree is invalid');
  const node = tree.nodes.get(value.nodeId);
  return { ...retained,
    status: node && sha256(node.body) === value.bodyHash ? 'verified' : 'unknown',
    ...(node && sha256(node.body) === value.bodyHash ? {} : { reason: 'current manuscript changed or node is unavailable' }) };
}
/** Read existing tracking only when its evidence names this exact current node body. */
export async function trackingBridge(root, state) {
  const result = { observations: [], unknown: [] };
  if (state.nodeRef) {
    const bridge = await verifyNodeBridge(root, state.nodeRef);
    if (bridge.status !== 'verified') { result.unknown.push({ role: state.role, reason: bridge.reason }); return result; }
  }
  if (state.subjectRef) {
    recordObject(state.subjectRef, ['subjectId', 'revisionId']); contextText(state.subjectRef.subjectId, 'subjectId');
    const tracking = await readTracking(root); const legacy = await readEntities(root);
    if (!tracking.subjects.some((subject) => subject.id === state.subjectRef.subjectId) && !legacy.entities.has(state.subjectRef.subjectId)) result.unknown.push({ role: state.role, reason: 'tracking subject is unavailable' });
    if (!state.nodeRef) result.unknown.push({ role: state.role, reason: 'tracking evidence needs an exact node/body/revision bridge' });
    else {
      const source = (await createResourceStore(root).readContent(state.nodeRef.revisionId)).toString('utf8');
      const relevant = tracking.observations.filter((entry) => entry.subjectId === state.subjectRef.subjectId && entry.evidence.nodeId === state.nodeRef.nodeId);
      result.observations = relevant.filter((entry) => entry.evidence.textHash === state.nodeRef.bodyHash && source.includes(entry.evidence.quote));
      if (result.observations.length !== relevant.length) result.unknown.push({ role: state.role, reason: 'tracking observations refer to another manuscript body' });
    }
  }
  return result;
}

/** Stored packages cite immutable accepted batch evidence, not today's active projection. */
export async function historicalTrackingEvidence(root, state) {
  if (!state.subjectRef || !state.nodeRef) return [];
  await verifyRetainedNodeBridge(root, state.nodeRef);
  const source = (await createResourceStore(root).readContent(state.nodeRef.revisionId)).toString('utf8');
  const tracking = await readHistoricalTracking(root);
  return tracking.batches.filter((batch) => batch.nodeId === state.nodeRef.nodeId && batch.committedHash === state.nodeRef.bodyHash)
    .flatMap((batch) => batch.observations.filter((entry) => entry.subjectId === state.subjectRef.subjectId
      && entry.evidence.nodeId === state.nodeRef.nodeId && entry.evidence.textHash === state.nodeRef.bodyHash && source.includes(entry.evidence.quote))
      .map((entry) => ({ ...entry, receiptId: batch.receiptId, runId: batch.runId, batchDigest: batch.batchDigest })));
}
