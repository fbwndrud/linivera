import { canonicalJson } from '../util/hash.js';
import { withWorkspaceStateTransaction, sameCheckpoint } from '../publications/state.js';
import { checkAuthority } from './authority.js';
import { readGroup } from './output-groups.js';
import { copy, fail, get, put } from './objects.js';
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
export async function recordGroupReview(root, input) {
  input = copy(input);
  if (!input || Object.keys(input).some((key) => !['operationId', 'groupId', 'outputHashes', 'findings', 'reviewer'].includes(key))) fail('REVIEW_INVALID', 'unsupported group review fields');
  return withWorkspaceStateTransaction(root, async () => {
    const { group } = await readGroup(root, input.operationId, input.groupId);
    if (!['host', 'user'].includes(input.reviewer) || !equal(input.outputHashes, group.outputs.map((output) => output.contentHash))) fail('REVIEW_MISMATCH', 'review must bind every group output hash');
    if (!Array.isArray(input.findings) || input.findings.some((finding) => !finding || !['hard', 'soft', 'info'].includes(finding.severity) || typeof finding.message !== 'string')) fail('REVIEW_INVALID', 'typed group findings required');
    return put(root, 'group-receipts', { version: 2, operationId: group.operationId, requestId: group.requestId, inputSnapshotId: group.inputSnapshotId, groupId: group.groupId, groupHash: group.groupHash,
      outputs: group.outputs, findings: input.findings, reviewer: input.reviewer, selfReview: true, observation: 'host-reported' });
  });
}
export async function groupPublicationEvidence(root, publication) {
  const { request, group, manifest } = await readGroup(root, publication.operationId, publication.groupId);
  const receipt = await get(root, 'group-receipts', publication.receiptId);
  const intent = await get(root, 'group-intents', publication.intentId);
  const decision = await get(root, 'group-decisions', publication.decisionId);
  if (publication.version !== 2 || !['approve', 'reject'].includes(publication.action) || publication.selfReview !== true || receipt.selfReview !== true
    || [publication, receipt, intent].some((record) => record.groupId !== group.groupId || record.groupHash !== group.groupHash || record.operationId !== request.operationId || record.requestId !== request.requestId || record.inputSnapshotId !== request.inputSnapshotId || !equal(record.outputs, group.outputs))
    || decision.operationId !== request.operationId || decision.groupId !== group.groupId || decision.receiptId !== publication.receiptId || decision.action !== publication.action || decision.actor !== publication.actor || intent.receiptId !== publication.receiptId
    || !equal(intent.expectedCheckpoint, decision.expectedCheckpoint) || decision.expectedCheckpoint.seq !== publication.checkpoint.seq - 1
    || !Array.isArray(receipt.findings) || receipt.findings.some((finding) => !['hard', 'soft', 'info'].includes(finding.severity)) || (publication.action === 'approve' && receipt.findings.some((finding) => finding.severity === 'hard'))) fail('PUBLICATION_INTEGRITY_FAILURE', 'group publication bindings differ');
  return { request, group, manifest, receipt, outputs: group.outputs, expectedCheckpoint: decision.expectedCheckpoint };
}
export async function decideGroupPublication(root, input, hooks = {}) {
  input = copy(input);
  if (!input || Object.keys(input).some((key) => !['operationId', 'groupId', 'receiptId', 'expectedCheckpoint', 'action', 'actor', 'grantId'].includes(key)) || !['approve', 'reject'].includes(input.action)) fail('PUBLICATION_INVALID', 'explicit group decision required');
  return withWorkspaceStateTransaction(root, async ({ state, append }) => {
    const { request, group, manifest } = await readGroup(root, input.operationId, input.groupId);
    if (state.publications.some((publication) => publication.operationId === input.operationId)) fail('OPERATION_CONTRACT_MISMATCH', 'legacy publication cannot coexist with groups');
    const previous = state.groupPublications.find((publication) => publication.operationId === input.operationId && publication.groupId === input.groupId);
    if (previous) {
      if (!equal(await get(root, 'group-decisions', previous.decisionId), input)) fail('PUBLICATION_CONFLICT', 'group already has another decision');
      await groupPublicationEvidence(root, previous); return previous;
    }
    if (!sameCheckpoint(input.expectedCheckpoint, state.checkpoint)) fail('WORKSPACE_CHECKPOINT_CONFLICT', 'workspace changed before group publication');
    const receipt = await get(root, 'group-receipts', input.receiptId);
    if (receipt.groupId !== group.groupId || receipt.groupHash !== group.groupHash || receipt.operationId !== request.operationId || receipt.requestId !== request.requestId || receipt.inputSnapshotId !== request.inputSnapshotId || !equal(receipt.outputs, group.outputs) || receipt.selfReview !== true) fail('REVIEW_MISMATCH', 'receipt belongs to a different group');
    if (input.action === 'approve' && receipt.findings.some((finding) => finding.severity === 'hard')) fail('APPROVE_BLOCKED_BY_HARD', 'hard finding prevents group approval');
    checkAuthority(manifest, state, input.actor, input.grantId, 'publish');
    const binding = { operationId: request.operationId, requestId: request.requestId, inputSnapshotId: request.inputSnapshotId, groupId: group.groupId, groupHash: group.groupHash, outputs: group.outputs };
    const intentId = await put(root, 'group-intents', { ...binding, expectedCheckpoint: input.expectedCheckpoint, receiptId: input.receiptId });
    const decisionId = await put(root, 'group-decisions', input);
    if (hooks.beforeMarker) await hooks.beforeMarker();
    checkAuthority(manifest, state, input.actor, input.grantId, 'publish');
    const payload = { version: 2, ...binding, receiptId: input.receiptId, intentId, decisionId, action: input.action, actor: input.actor, selfReview: true };
    const checkpoint = await append({ kind: 'result-group-publication', payload, expectedCheckpoint: input.expectedCheckpoint });
    if (hooks.afterMarker) await hooks.afterMarker();
    return { ...payload, checkpoint };
  });
}
