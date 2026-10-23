import { sha256, canonicalJson } from '../util/hash.js';
import { withWorkspaceStateTransaction } from '../publications/state.js';
import { verifyInput } from '../resources/input-snapshots.js';
import { createResourceStore } from '../resources/revisions.js';
import { copy, fail, get, put } from './objects.js';
import { normalizeTrace } from './trace.js';
import { checkAuthority } from './authority.js';
import { assertOperationContract, readProductionRequest } from './production-request.js';
import { assertNewOperationInputClosure } from '../resources/input-closure.js';
import { assertReadinessForRequest } from '../readiness/verify.js';
import { assertConnectionForRequest } from '../access/verify.js';
export async function startOperation(root, input) {
  input = copy(input);
  if (!input || typeof input.idempotencyKey !== 'string' || !input.idempotencyKey.length || input.idempotencyKey.length > 256 || Object.keys(input).some((k) => !['inputSnapshotId', 'idempotencyKey', 'actor', 'grantId', 'operationContractVersion', 'requestRevisionId'].includes(k)) || (input.operationContractVersion !== undefined && input.operationContractVersion !== 2) || (input.operationContractVersion === 2 ? typeof input.requestRevisionId !== 'string' : input.requestRevisionId !== undefined)) fail('OPERATION_INVALID', 'invalid operation request');
  const operationId = sha256(canonicalJson({ idempotencyKey: input.idempotencyKey }));
  const requestId = sha256(canonicalJson(input));
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    const old = await get(root, 'requests', operationId, true);
    if (old) { if (old.requestId !== requestId) fail('IDEMPOTENCY_CONFLICT', 'key already binds a different request'); return { operationId, requestId }; }
    const { manifest } = await verifyInput(root, input.inputSnapshotId);
    await assertNewOperationInputClosure(root, manifest);
    if (input.operationContractVersion === 2) {
      await assertReadinessForRequest(root, manifest, input.requestRevisionId);
      await assertConnectionForRequest(root, manifest, input.requestRevisionId);
      await readProductionRequest(root, input, manifest);
    }
    else for (const resource of manifest.resources) if ((await createResourceStore(root).readRevision(resource.revisionId)).kind === 'generation-request') fail('OPERATION_CONTRACT_MISMATCH', 'generation requests require operation contract v2');
    checkAuthority(manifest, state, input.actor, input.grantId, 'create-candidate');
    await put(root, 'requests', { ...input, operationId, requestId }, operationId);
    return { operationId, requestId };
  });
}
export async function readOperation(root, operationId) {
  const request = await get(root, 'requests', operationId);
  if (request.operationId !== operationId || sha256(canonicalJson({ idempotencyKey: request.idempotencyKey })) !== operationId) fail('OPERATION_INTEGRITY_FAILURE', 'operation identity differs');
  const { operationId: _operation, requestId, ...input } = request;
  if (sha256(canonicalJson(input)) !== requestId) fail('OPERATION_INTEGRITY_FAILURE', 'request identity differs');
  return request;
}
export async function outputBindings(root, resultRevisionIds) {
  if (!Array.isArray(resultRevisionIds) || !resultRevisionIds.length || new Set(resultRevisionIds).size !== resultRevisionIds.length) fail('RESULT_INVALID', 'unique nonempty result revisions required');
  const store = createResourceStore(root); const outputs = [];
  for (const revisionId of resultRevisionIds) {
    const r = await store.readRevision(revisionId);
    if (r.storageStatus !== 'owned_snapshot') fail('RESULT_INVALID', 'owned result required');
    outputs.push({ revisionId, resourceId: r.resourceId, contentHash: r.contentHash, mediaType: r.mediaType });
  }
  if (new Set(outputs.map((r) => r.resourceId)).size !== outputs.length) fail('RESULT_INVALID', 'one revision per output resource required');
  return outputs;
}
export async function submitResult(root, input) {
  input = copy(input);
  if (!input || Object.keys(input).some((k) => !['operationId', 'requestId', 'inputSnapshotId', 'resultRevisionIds', 'reportedTrace'].includes(k))) fail('RESULT_INVALID', 'unsupported submission fields');
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    const request = await readOperation(root, input.operationId);
    assertOperationContract(request, 1);
    if (input.requestId !== request.requestId || input.inputSnapshotId !== request.inputSnapshotId) fail('REQUEST_MISMATCH', 'result must bind exact request and input');
    if (state.publications.some((p) => p.operationId === input.operationId)) fail('LATE_RESULT', 'operation already finalized');
    const { manifest } = await verifyInput(root, request.inputSnapshotId);
    checkAuthority(manifest, state, request.actor, request.grantId, 'create-candidate');
    const outputs = await outputBindings(root, input.resultRevisionIds);
    const candidate = { operationId: request.operationId, requestId: request.requestId, inputSnapshotId: request.inputSnapshotId, resultRevisionIds: input.resultRevisionIds, outputs, trace: normalizeTrace(input.reportedTrace) };
    const old = await get(root, 'results', input.operationId, true);
    if (old && canonicalJson(old) !== canonicalJson(candidate)) fail('LATE_RESULT', 'operation already has a different submitted result');
    await put(root, 'results', candidate, input.operationId); return candidate;
  });
}
