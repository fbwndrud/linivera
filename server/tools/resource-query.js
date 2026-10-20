import { queryResources } from '../../core/query/resources.js';
import { queryResourceGraph } from '../../core/query/resource-graph.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { ID, CHECKPOINT, definition, argsFor, rule } from './resource-schema.js';
export const resourceQueryDefinition = definition('folio_resource_query', '공통 자원 조회. query는 선택 source와 승인 output, refresh는 metadata 갱신. graph는 후보/거절을 포함한 정확 판본→작업→결과 및 수정 관계를 조회한다. resourceId/direction/depth/limit으로 범위를 제한하며 truncated를 확인한다. inputRefs와 reviewRequired는 전이 변경 영향을 포함한다. 그래프는 제공/제출된 판본의 관계이며 모델의 실제 지각이나 품질 인증이 아니다.', ['query', 'refresh', 'graph'], {
  resourceId: ID, checkpoint: CHECKPOINT,
  selector: { type: 'object', additionalProperties: false, required: ['type'], properties: { type: { type: 'string', enum: ['current', 'atRevision', 'atCheckpoint'] }, revisionId: ID, checkpoint: CHECKPOINT } },
  freshness: { type: 'string', enum: ['requireCurrent', 'allowStale'] },
  direction: { type: 'string', enum: ['upstream', 'downstream', 'both'] }, depth: { type: 'integer', minimum: 0, maximum: 100 },
  limit: { type: 'integer', minimum: 1, maximum: 5000 },
});
export async function resourceQueryTool(root, input) {
  const { op, values } = argsFor(input, { query: rule([], ['resourceId', 'selector', 'freshness']), refresh: rule([], ['checkpoint']), graph: rule([], ['resourceId', 'direction', 'depth', 'limit']) });
  if (op === 'graph') return queryResourceGraph(root, values);
  return op === 'query' ? queryResources(root, values) : buildMetadataProjection(root, values);
}
