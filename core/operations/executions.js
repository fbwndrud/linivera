import { openLedger } from '../ledger/ledger.js';
import { withWorkspaceStateTransaction, sameCheckpoint } from '../publications/state.js';
import { assertResourceId } from '../resources/schema.js';
import { readOperation } from './requests.js';
import { readProductionRequest } from './production-request.js';
import { checkAuthority } from './authority.js';
import { copy, fail } from './objects.js';
import { validateExecutionEvent } from './executions/schema.js';
import { bindArtifacts } from './executions/bindings.js';
import { replayExecution } from './executions/replay.js';
import { listGroups } from './output-groups.js';
const headOf = (records) => records.length ? { seq: records.at(-1).seq, hash: records.at(-1).hash } : null;
export async function readExecution(root, operationId, executionHead = undefined) {
  const request = await readOperation(root, operationId);
  const { value, manifest } = await readProductionRequest(root, request);
  const ledger = openLedger(root, 'execution-' + operationId.slice(7));
  const all = await ledger.readAll(); let records = all;
  if (executionHead !== undefined) {
    if (executionHead === null) records = [];
    else if (!Number.isSafeInteger(executionHead.seq) || executionHead.seq < 1 || all[executionHead.seq - 1]?.hash !== executionHead.hash) fail('EXECUTION_HEAD_INVALID', 'execution prefix is not in verified history');
    else records = all.slice(0, executionHead.seq);
  }
  const executions = await replayExecution(root, { ...request, value }, records);
  return { request, manifest, value, ledger, records, executions, executionHead: headOf(records) };
}
export async function recordExecution(root, input) {
  input = copy(input);
  if (!input || Object.keys(input).some((key) => !['operationId', 'executionId', 'expectedExecutionHead', 'event'].includes(key)) || !Object.hasOwn(input, 'expectedExecutionHead')) fail('EXECUTION_INVALID', 'exact execution head required');
  assertResourceId(input.executionId); validateExecutionEvent(input.event);
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    const context = await readExecution(root, input.operationId);
    if (context.executionHead === null ? input.expectedExecutionHead !== null : !sameCheckpoint(context.executionHead, input.expectedExecutionHead)) fail('EXECUTION_HEAD_CONFLICT', 'execution observations changed');
    checkAuthority(context.manifest, state, context.request.actor, context.request.grantId, 'create-candidate');
    const event = { ...input.event, observation: 'host-reported' };
    if (event.artifacts) event.artifacts = await bindArtifacts(root, event.artifacts);
    const payload = { operationId: input.operationId, executionId: input.executionId, event };
    await replayExecution(root, { ...context.request, value: context.value }, [...context.records, { type: 'execution-event', payload, seq: (context.executionHead?.seq ?? 0) + 1, hash: 'pending' }]);
    const record = await context.ledger.append({ type: 'execution-event', payload });
    return { operationId: input.operationId, executionId: input.executionId, executionHead: { seq: record.seq, hash: record.hash }, observation: 'host-reported' };
  });
}
export async function inspectExecution(root, input) {
  if (!input || Object.keys(input).some((key) => !['operationId', 'executionId', 'executionHead', 'cursor', 'limit'].includes(key))) fail('EXECUTION_INVALID', 'unsupported inspection fields');
  return withWorkspaceStateTransaction(root, async () => {
    const context = await readExecution(root, input.operationId, input.executionHead);
    const cursor = input.cursor ?? 0; const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) fail('EXECUTION_INVALID', 'bounded execution pagination required');
    const records = context.records.filter((record) => !input.executionId || record.payload.executionId === input.executionId);
    const submittedGroups = (await listGroups(root, input.operationId)).filter((group) => (!input.executionId || group.executionId === input.executionId) && context.executionHead && group.executionHead.seq <= context.executionHead.seq);
    return { operationId: input.operationId, requestRevisionId: context.request.requestRevisionId, inputSnapshotId: context.request.inputSnapshotId, executionHead: context.executionHead, executions: context.executions.filter((execution) => !input.executionId || execution.executionId === input.executionId), submittedGroups, events: records.slice(cursor, cursor + limit), nextCursor: cursor + limit < records.length ? cursor + limit : null };
  });
}
