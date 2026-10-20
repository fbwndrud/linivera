const text = { type: 'string' };
const integer = { type: 'integer', minimum: 0 };
const object = { type: 'object' };
const array = { type: 'array', items: object };
const strings = { type: 'array', items: text };
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const shape = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const choice = (...anyOf) => ({ anyOf });
const status = (...values) => ({ type: 'string', enum: values });

const modelRequests = { type: 'array', minItems: 1, items: shape({ requestId: text, stepId: text, purpose: text, payload: object }) };
const run = choice(
  shape({ status: status('idle') }),
  shape({ status: status('needs_model'), runId: text, nodeId: text, requests: modelRequests }),
  shape({ status: status('needs_user'), runId: text, nodeId: text, question: object }),
  shape({ status: status('done', 'waiting_children', 'skipped'), runId: text, nodeId: text }),
);
// 그림 실행의 nodeId는 null일 수 있다. 노드가 없어도 설명서와 그림을 만들 수 있다.
const imageRun = choice(
  shape({ status: status('needs_model'), runId: text, nodeId: nullable(text), requests: modelRequests }),
  shape({ status: status('needs_user'), runId: text, nodeId: nullable(text), question: object }),
  shape({ status: status('done', 'skipped'), runId: text, assetId: text }),
);
const accepted = { textHash: text, accepted: integer, seq: integer };
const renamed = shape({ applied: { const: true }, files: strings, recommit: strings, occurrences: integer, warnings: array });
const format = status('web', 'epub');

/** 동적인 노드·검사·질문 상세는 확장을 허용하고, 안정적인 바깥 계약을 선언한다. */
const RESULTS = {
  folio_assets: choice(shape({ asset: object }), shape({ assets: array, summary: object })),
  folio_tracking: choice(shape({ plan: nullable(object) }), shape({ proposalId: text, proposalDigest: text }), shape({ type: text, entries: array })),
  folio_resources: choice(shape({ revisionId: text }), shape({ revision: object }), shape({ selectionRevision: text })),
  folio_inputs: shape({ inputSnapshotId: text, manifest: object }),
  folio_policy: nullable(shape({ grantId: text, revoked: { type: 'boolean' } })),
  folio_operations: choice(shape({ operationId: text }), text),
  folio_resource_query: choice(shape({ generationId: text }), shape({ entries: array, freshness: text }), shape({ nodes: array, edges: array, checkpoint: object, truncated: { type: 'boolean' } })),
  folio_embeddings: choice(shape({ generationId: text }), shape({ results: array, freshness: text })),
  folio_init: shape({ created: { type: 'boolean' }, root: text, config: object }, ['created', 'root']),
  folio_status: shape({ ledger: object, next: nullable(object), activeRun: nullable(object), pending: nullable(run),
    waiting: strings, stale: array, recheck: array, flagged: array, drift: array, warnings: array }),
  folio_run: run, folio_resume: run, folio_decide: run,
  folio_structure: shape({ op: status('add', 'move', 'wrap'), outline: array }),
  folio_find: choice(shape({ node: object }), shape({ entity: object }),
    shape({ entityId: text, usages: array }), shape({ entityId: text, events: array }),
    shape({ surface: object, candidates: array }), shape({ planDigest: text, changes: array, candidates: array, files: array }), shape({ scope: text })),
  folio_view: shape({ url: text, reused: { type: 'boolean' }, built: { type: 'boolean' }, idleMinutes: integer }),
  folio_occurrences: choice(shape({ surface: object, ...accepted }), renamed),
  folio_sources: choice(shape({ source: object }), shape({ sources: array, evidence: nullable(object) }), shape({ nodeId: text, ...accepted })),
  folio_config: shape({ title: text, levels: array, packs: strings, pipelines: object, checkSets: array,
    recommended: array, checks: array, stages: object, options: object, features: object }),
  folio_image: choice(imageRun, shape({ runId: text, assetId: text, state: text, outcome: nullable(imageRun) }), { type: 'null' }),
  folio_import_vibelore: shape({ root: text, importId: text, status: status('imported'), imported: object, warnings: array }),
  folio_export: choice(
    shape({ status: status('exported'), output: text, format, variant: text, files: integer, warnings: array }),
    shape({ format, variant: text, language: text, layout: nullable(object), warnings: array, nodes: integer, assets: integer, files: integer, bytes: integer }),
  ),
};
const error = shape({ code: text, message: text, details: {} });

/** MCP structuredContent는 항상 객체다. 기존 텍스트 응답은 감싸지 않고 호환성을 지킨다. */
export function outputSchema(name) {
  return {
    type: 'object', description: '구조화 응답. 성공은 result, 실패는 error. 기존 text 응답은 종전처럼 성공 결과 자체 또는 {error}.',
    oneOf: [
      { ...shape({ result: RESULTS[name] }), additionalProperties: false },
      { ...shape({ error }), additionalProperties: false },
    ],
  };
}
