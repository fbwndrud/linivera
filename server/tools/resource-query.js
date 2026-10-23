import { queryResources } from '../../core/query/resources.js';
import { queryResourceGraph } from '../../core/query/resource-graph.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { ID, CHECKPOINT, definition, argsFor, rule } from './resource-schema.js';
import { collectContext } from '../../core/context/collect.js';
import { buildGraphIndex } from '../../core/query/graph-index.js';
import { listCapabilitySpecs, getCapabilitySpec } from '../../packs/production/capabilities.js';
import { compareCapabilityReadiness, retainCapabilityReadiness } from '../../core/readiness/compare.js';
import { ACCESS_QUERY_FIELDS, ACCESS_QUERY_ARGUMENTS, accessQueryTool } from './access-query.js';
export const resourceQueryDefinition = definition('folio_resource_query', '공통 자원 조회. capabilities/specification/readiness는 기능별 입력 대조, accessSpecifications/accessSpecification/connectionReadiness는 경로별 설치·인증·권한·plan·credits의 독립 대조다. retainConnectionCheck는 비밀값 없는 호스트 점검, retainConnectionReadiness는 과거 보고를 보관한다. validateConnection은 고정 Input의 실제 요청을 실행 직전 재검증한다. context는 필수 맥락 묶음이다. 부분 조회는 전체 미보유를 증명하지 않으며 발견·보관·접근 점검은 선택이나 승인을 대체하지 않는다.', ['query', 'refresh', 'graph', 'context', 'indexGraph', 'capabilities', 'specification', 'readiness', 'retainReadiness', ...Object.keys(ACCESS_QUERY_ARGUMENTS)], {
  ...ACCESS_QUERY_FIELDS,
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
    readiness: rule(readinessFields, ['pathId']), retainReadiness: rule(['resourceId', ...readinessFields], ['pathId']), ...ACCESS_QUERY_ARGUMENTS });
  if (Object.hasOwn(ACCESS_QUERY_ARGUMENTS, op)) return accessQueryTool(root, op, values);
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
