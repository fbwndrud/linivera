import { queryResources } from '../../core/query/resources.js';
import { queryResourceGraph } from '../../core/query/resource-graph.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { ID, CHECKPOINT, definition, argsFor, rule } from './resource-schema.js';
import { collectContext } from '../../core/context/collect.js';
import { buildGraphIndex } from '../../core/query/graph-index.js';
import { listCapabilitySpecs, getCapabilitySpec } from '../../packs/production/capabilities.js';
import { compareCapabilityReadiness, retainCapabilityReadiness } from '../../core/readiness/compare.js';
export const resourceQueryDefinition = definition('folio_resource_query', '공통 자원 조회. capabilities/specification은 기능 명세와 근거, readiness는 정확 판본의 요구 입력과 보유 후보·불일치·미확인·검색 범위를 반환한다. retainReadiness는 대조 보고를 보관한다. context는 예산 있는 맥락 묶음과 필수 역할 충족을 반환한다. indexGraph와 generationId graph는 부분 탐색이며 전체 재검토 범위는 unknown이다. 후보 발견·보관은 선택이나 승인이 아니다.', ['query', 'refresh', 'graph', 'context', 'indexGraph', 'capabilities', 'specification', 'readiness', 'retainReadiness'], {
  resourceId: ID, checkpoint: CHECKPOINT,
  selector: { type: 'object', additionalProperties: false, required: ['type'], properties: { type: { type: 'string', enum: ['current', 'atRevision', 'atCheckpoint'] }, revisionId: ID, checkpoint: CHECKPOINT } },
  freshness: { type: 'string', enum: ['requireCurrent', 'allowStale'] },
  direction: { type: 'string', enum: ['upstream', 'downstream', 'both'] }, depth: { type: 'integer', minimum: 0, maximum: 100 },
  limit: { type: 'integer', minimum: 1, maximum: 5000 },
  cursor: ID, generationId: ID, boundaryLimit: { type: 'integer', minimum: 0, maximum: 5000 }, edgeLimit: { type: 'integer', minimum: 1, maximum: 10000 },
  scopeId: ID, purpose: ID, pathId: ID, timeLabel: ID, contextRevisionId: ID,
  capabilityId: ID, specificationRevisionId: ID, requestRevisionId: ID,
  candidateRevisionIds: { type: 'array', maxItems: 256, items: ID },
  profileRevisionId: ID, pipelineRevisionId: ID, policyRevisionId: ID,
  search: { type: 'object', additionalProperties: false, required: ['completeness', 'reason'], properties: {
    completeness: { type: 'string', enum: ['complete', 'partial'] }, reason: ID,
  } },
  revisionIds: { type: 'array', maxItems: 4096, items: ID },
  budget: { type: 'object', additionalProperties: false, required: ['maxTextBytes', 'maxItems', 'maxManifestBytes'], properties: {
    maxTextBytes: { type: 'integer', minimum: 0, maximum: 8388608 }, maxItems: { type: 'integer', minimum: 0, maximum: 4096 },
    maxManifestBytes: { type: 'integer', minimum: 256, maximum: 8388608 },
  } },
});
export async function resourceQueryTool(root, input) {
  const { op, values } = argsFor(input, { query: rule([], ['resourceId', 'selector', 'freshness']), refresh: rule([], ['checkpoint']), graph: rule([], ['resourceId', 'direction', 'depth', 'limit', 'cursor', 'generationId', 'boundaryLimit', 'edgeLimit']), indexGraph: rule([]),
    context: rule(['scopeId', 'purpose', 'budget'], ['contextRevisionId', 'pathId', 'timeLabel', 'revisionIds']),
    capabilities: rule([]), specification: rule(['capabilityId']),
    readiness: rule(readinessFields, ['pathId']), retainReadiness: rule(['resourceId', ...readinessFields], ['pathId']) });
  if (op === 'capabilities') return { specifications: listCapabilitySpecs() };
  if (op === 'specification') return getCapabilitySpec(values.capabilityId);
  if (op === 'readiness') return compareCapabilityReadiness(root, values);
  if (op === 'retainReadiness') return retainCapabilityReadiness(root, values);
  if (op === 'context') return collectContext(root, values);
  if (op === 'indexGraph') return buildGraphIndex(root);
  if (op === 'graph') return queryResourceGraph(root, values);
  return op === 'query' ? queryResources(root, values) : buildMetadataProjection(root, values);
}
const readinessFields = ['specificationRevisionId', 'requestRevisionId', 'candidateRevisionIds', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId', 'scopeId', 'search'];
