import { queryResources } from '../../core/query/resources.js';
import { queryResourceGraph } from '../../core/query/resource-graph.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { ID, CHECKPOINT, definition, argsFor, rule } from './resource-schema.js';
import { collectContext } from '../../core/context/collect.js';
import { buildGraphIndex } from '../../core/query/graph-index.js';
export const resourceQueryDefinition = definition('folio_resource_query', '공통 자원 조회. graph는 정확 판본 관계와 페이지 경계/누락을, context는 예산 있는 지식 묶음 후보를 반환한다. indexGraph는 파생 탐색 색인을 만든다. graph generationId를 명시하면 반환 관계·파일을 재검증하는 부분 조회이며 전체 내용·재검토 범위는 unknown이다. 기본 graph는 전체 검증을 유지한다. preview/index는 사용자 선택이나 품질 승인을 만들지 않는다.', ['query', 'refresh', 'graph', 'context', 'indexGraph'], {
  resourceId: ID, checkpoint: CHECKPOINT,
  selector: { type: 'object', additionalProperties: false, required: ['type'], properties: { type: { type: 'string', enum: ['current', 'atRevision', 'atCheckpoint'] }, revisionId: ID, checkpoint: CHECKPOINT } },
  freshness: { type: 'string', enum: ['requireCurrent', 'allowStale'] },
  direction: { type: 'string', enum: ['upstream', 'downstream', 'both'] }, depth: { type: 'integer', minimum: 0, maximum: 100 },
  limit: { type: 'integer', minimum: 1, maximum: 5000 },
  cursor: ID, generationId: ID, boundaryLimit: { type: 'integer', minimum: 0, maximum: 5000 }, edgeLimit: { type: 'integer', minimum: 1, maximum: 10000 },
  scopeId: ID, purpose: ID, pathId: ID, timeLabel: ID, contextRevisionId: ID,
  revisionIds: { type: 'array', maxItems: 4096, items: ID },
  budget: { type: 'object', additionalProperties: false, required: ['maxTextBytes', 'maxItems', 'maxManifestBytes'], properties: {
    maxTextBytes: { type: 'integer', minimum: 0, maximum: 8388608 }, maxItems: { type: 'integer', minimum: 0, maximum: 4096 },
    maxManifestBytes: { type: 'integer', minimum: 256, maximum: 8388608 },
  } },
});
export async function resourceQueryTool(root, input) {
  const { op, values } = argsFor(input, { query: rule([], ['resourceId', 'selector', 'freshness']), refresh: rule([], ['checkpoint']), graph: rule([], ['resourceId', 'direction', 'depth', 'limit', 'cursor', 'generationId', 'boundaryLimit', 'edgeLimit']), indexGraph: rule([]),
    context: rule(['scopeId', 'purpose', 'budget'], ['contextRevisionId', 'pathId', 'timeLabel', 'revisionIds']) });
  if (op === 'context') return collectContext(root, values);
  if (op === 'indexGraph') return buildGraphIndex(root);
  if (op === 'graph') return queryResourceGraph(root, values);
  return op === 'query' ? queryResources(root, values) : buildMetadataProjection(root, values);
}
