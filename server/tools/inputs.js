import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';
import { selectInput, readInputSelection } from '../../core/resources/input-selections.js';
import { ID, ids, CHECKPOINT, definition, argsFor, rule } from './resource-schema.js';
export const inputsDefinition = definition('folio_inputs', '입력과 profile/pipeline/policy의 정확한 선택 판본 및 전체 보관 bytes를 봉인한다. select는 실제 사용자 지시에 따라 작업 범위의 판본을 선택하며 getSelection은 현재 또는 과거 선택을 읽는다. verify는 과거 checkpoint를 검증한다.', ['select', 'getSelection', 'prepare', 'verify'], {
  revisionIds: ids, profileRevisionId: ID, pipelineRevisionId: ID, policyRevisionId: ID, inputSnapshotId: ID, externalMode: { type: 'string', enum: ['reject', 'reference-only'] },
  version: { type: 'integer', enum: [1, 2] }, scopeId: ID, scopeSelectionRevision: ID, bindingKeys: ids,
  checkpoint: CHECKPOINT,
  expectedScopeSelectionRevision: { anyOf: [ID, { type: 'null' }] }, actor: { type: 'string', enum: ['user'] }, reason: ID,
  bindings: { type: 'array', minItems: 1, maxItems: 4096, items: { type: 'object', additionalProperties: false, required: ['bindingKey', 'role', 'resourceId', 'revisionId', 'mode'], properties: { bindingKey: ID, role: ID, resourceId: ID, revisionId: ID, mode: { type: 'string', enum: ['fixed', 'global', 'scoped'] }, sourceScopeId: ID, sourceBindingKey: ID } } },
});
export async function inputsTool(root, input) {
  const { op, values } = argsFor(input, { select: rule(['scopeId', 'expectedScopeSelectionRevision', 'actor', 'reason', 'bindings', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId']), getSelection: rule(['scopeId'], ['checkpoint']), prepare: rule(['profileRevisionId', 'pipelineRevisionId', 'policyRevisionId'], ['revisionIds', 'externalMode', 'version', 'scopeId', 'scopeSelectionRevision', 'bindingKeys']), verify: rule(['inputSnapshotId']) });
  if (op === 'select') return selectInput(root, values);
  if (op === 'getSelection') return readInputSelection(root, values.scopeId, values.checkpoint ? { checkpoint: values.checkpoint } : {});
  return op === 'prepare' ? prepareInput(root, values) : verifyInput(root, values.inputSnapshotId);
}
