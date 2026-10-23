import { canonicalJson } from '../util/hash.js';
import { withWorkspaceStateTransaction, sameCheckpoint } from '../publications/state.js';
import { verifyInput } from '../resources/input-snapshots.js';
import { copy, fail, get, put } from './objects.js';
import { readOperation, outputBindings } from './requests.js';
import { checkAuthority } from './authority.js';
import { assertOperationContract } from './production-request.js';
async function boundResult(root, operationId) {
  const request = await readOperation(root, operationId);
  assertOperationContract(request, 1);
  const result = await get(root, 'results', operationId);
  if (result.operationId !== operationId || result.requestId !== request.requestId || result.inputSnapshotId !== request.inputSnapshotId || canonicalJson(await outputBindings(root, result.resultRevisionIds)) !== canonicalJson(result.outputs)) fail('RESULT_MISMATCH', 'result bindings differ');
  await verifyInput(root, request.inputSnapshotId);
  return { request, result };
}
export async function recordReview(root, input) {
  input = copy(input);
  if (!input || Object.keys(input).some((k) => !['operationId', 'outputHashes', 'findings', 'reviewer'].includes(k))) fail('REVIEW_INVALID', 'unsupported review fields');
  return withWorkspaceStateTransaction(root, async () => {
    const { request, result } = await boundResult(root, input.operationId);
    if (!['host', 'user'].includes(input.reviewer) || canonicalJson(input.outputHashes) !== canonicalJson(result.outputs.map((r) => r.contentHash))) fail('REVIEW_MISMATCH', 'review must bind every exact output hash');
    if (!Array.isArray(input.findings) || input.findings.some((f) => !f || !['hard', 'soft', 'info'].includes(f.severity) || typeof f.message !== 'string')) fail('REVIEW_INVALID', 'typed findings required');
    return put(root, 'receipts', { version: 1, operationId: request.operationId, requestId: request.requestId, inputSnapshotId: request.inputSnapshotId, resultRevisionIds: result.resultRevisionIds, outputs: result.outputs, findings: input.findings, reviewer: input.reviewer, selfReview: true, observation: 'host-reported' });
  });
}
/** Trusted local caller attests a decision; actor is not authentication. */
export async function decidePublication(root, input, hooks = {}) {
  input = copy(input);
  if (!input || Object.keys(input).some((k) => !['operationId', 'receiptId', 'expectedCheckpoint', 'action', 'actor', 'grantId'].includes(k)) || !['approve', 'reject'].includes(input.action)) fail('PUBLICATION_INVALID', 'explicit approve/reject decision required');
  return withWorkspaceStateTransaction(root, async ({ state, append }) => {
    const previous = state.publications.find((p) => p.operationId === input.operationId);
    if (previous) {
      const decision = await get(root, 'decisions', previous.decisionId);
      if (canonicalJson(decision) !== canonicalJson(input)) fail('PUBLICATION_CONFLICT', 'operation already has another final decision');
      const receipt = await get(root, 'receipts', previous.receiptId);
      const { request, result } = await boundResult(root, input.operationId);
      const intent = await get(root, 'intents', previous.intentId);
      if (intent.operationId !== request.operationId || intent.receiptId !== previous.receiptId || canonicalJson(intent.outputs) !== canonicalJson(result.outputs) || canonicalJson(receipt.outputs) !== canonicalJson(result.outputs) || canonicalJson(previous.outputs) !== canonicalJson(result.outputs) || previous.inputSnapshotId !== request.inputSnapshotId || previous.receiptId !== input.receiptId || previous.action !== input.action || previous.selfReview !== true || receipt.requestId !== previous.requestId) fail('REVIEW_MISMATCH', 'historical receipt differs');
      return previous;
    }
    if (!sameCheckpoint(input.expectedCheckpoint, state.checkpoint)) fail('WORKSPACE_CHECKPOINT_CONFLICT', 'workspace changed before publication');
    const { request, result } = await boundResult(root, input.operationId);
    const receipt = await get(root, 'receipts', input.receiptId);
    if (receipt.operationId !== request.operationId || receipt.requestId !== request.requestId || receipt.inputSnapshotId !== request.inputSnapshotId || canonicalJson(receipt.outputs) !== canonicalJson(result.outputs) || canonicalJson(receipt.resultRevisionIds) !== canonicalJson(result.resultRevisionIds) || receipt.selfReview !== true) fail('REVIEW_MISMATCH', 'receipt is for different request/input/outputs');
    if (input.action === 'approve' && receipt.findings.some((f) => f.severity === 'hard')) fail('APPROVE_BLOCKED_BY_HARD', 'hard finding prevents approval');
    const { manifest } = await verifyInput(root, request.inputSnapshotId);
    checkAuthority(manifest, state, input.actor, input.grantId, 'publish');
    const intentId = await put(root, 'intents', { operationId: request.operationId, requestId: request.requestId, inputSnapshotId: request.inputSnapshotId, outputs: result.outputs, expectedCheckpoint: input.expectedCheckpoint, receiptId: input.receiptId });
    const decisionId = await put(root, 'decisions', input);
    if (hooks.beforeMarker) await hooks.beforeMarker();
    checkAuthority(manifest, state, input.actor, input.grantId, 'publish');
    const payload = { version: 1, operationId: request.operationId, requestId: request.requestId, inputSnapshotId: request.inputSnapshotId, resultRevisionIds: result.resultRevisionIds, outputs: result.outputs, receiptId: input.receiptId, intentId, decisionId, action: input.action, actor: input.actor, selfReview: true, trace: result.trace };
    const checkpoint = await append({ kind: 'result-publication', payload, expectedCheckpoint: input.expectedCheckpoint });
    if (hooks.afterMarker) await hooks.afterMarker();
    return { ...payload, checkpoint };
  });
}
