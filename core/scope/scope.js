import { contextRefs } from '../work/context.js';
import { FolioError } from '../errors.js';
import { ancestorsOf } from '../store/tree.js';
import { assetRefsInBody } from '../store/assets.js';
import { eventsBefore } from '../ledger/events.js';
import { scanReferences } from '../index/scan.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { PROMISE_KIND } from '../promise.js';
import { branchScope } from '../branching/scope.js';
import { buildBranchGraph, graphView } from '../branching/graph.js';
import { assetAllowsNode } from '../assets/scope.js';
import { linkedScope } from './linked.js';

const uniqueSorted = (ids) => [...new Set(ids)].sort();

/**
 * 엔티티 설정의 선수 개념 id(data.prerequisites 의 문자열). 코어는 뜻을 모른다 — 범위를 넓히는 데만 쓴다.
 * 작품의 팩이 pack.yaml scopeFields 에 prerequisites 를 적었을 때만 읽는다(N4, core/scope/fields.js).
 * packs/knowledge/checkers/definitions.js 의 같은 이름 함수와 "어떤 id 를 센다"는 기준이 같아야 한다
 * (코어는 팩을 import 할 수 없어 따로 둔 것뿐이다 — 하나를 고치면 다른 쪽도 맞춘다).
 */
const prerequisitesOf = (entity) => (Array.isArray(entity?.data?.prerequisites) ? entity.data.prerequisites.filter((id) => typeof id === 'string') : []);

const eventKey = (e) => [e.eventId, e.kind, e.data ?? null];

/**
 * 엔티티 파일 + 이 노드보다 앞선 그 엔티티의 사건. 뒤쪽 방향 전파의 기준값이다.
 * 순서 없는(none) 노드는 연결된 노드의 그 엔티티 사건(linkedScope)도 넣는다 — 있을 때만 키를 더해, 연결 사건이 없는 노드의 값은 N4 전과 같다.
 * 연결 사건은 eventId 차례로 넣는다. none 노드의 읽는 순서 번호는 폴더 배치일 뿐이라, 폴더 순서만 바꿔도 stale 이 되지 않게 한다.
 */
export function entityRevAt({ work, events, entityId, nodeId, receiptRecords = [], branching = undefined }) {
  const before = eventsBefore({ events, positions: work.positions, nodeId });
  const relevant = before.events.filter((e) => e.entityId === entityId).map(eventKey);
  const linked = linkedScope({ work, events, nodeId }).events.filter((e) => e.entityId === entityId).map(eventKey)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const branch = branching ?? branchScope({ work, events, receiptRecords, nodeId });
  const paths = branch.applicable ? branch.paths.map((p) => [p.pathId, p.complete, p.events.filter((e) => e.entityId === entityId).map(eventKey)]) : null;
  return sha256(canonicalJson({ ...(paths ? { paths } : {}), file: work.entities.get(entityId)?.rev ?? null, events: relevant, ...(linked.length ? { linked } : {}) }));
}

/**
 * 앞쪽 방향: 이 노드에 나온 엔티티가 나온 모든 곳을 모은다(가지·층 무관).
 * 트리 이웃이 아니라 엔티티가 기준이다(계획서 §10).
 * @param {{ work: object, events: object[], nodeId: string, draftText?: string, extracted?: object|null,
 *   marks?: { surface: { kind: string, id: string }, entityId: string }[]|null,
 *   claims?: Array<{ quote: string, sources: Array<{ sourceId: string, quote: string }> }>, scopeFields?: readonly string[], receiptRecords?: object[] }} input
 *   marks: occurrenceScope 기능이 켜졌을 때 liveMarks(...) 결과. 범위를 더하기만 한다(null이면 기능 꺼짐).
 *   claims: 이 원고의 주장(core/evidence/scope.js claimsFor). 연결한 자료를 범위(sources·refs)에 더하고 검사 ctx 로 그대로 간다.
 *   scopeFields: 팩이 켠 범위 필드(레지스트리 scopeFields, N4). 빈 목록(기본)이면 선수 개념을 읽지 않는다.
 */
export function gatherScope({ work, events, nodeId, draftText = '', extracted = null, marks = null, claims = [], scopeFields = [], receiptRecords = [] }) {
  const node = work.tree.nodes.get(nodeId);
  if (!node) throw new FolioError('NODE_NOT_FOUND', nodeId);
  const known = (id) => work.entities.has(id);
  const appearances = uniqueSorted([...node.entities, ...(extracted?.appearances ?? [])].filter(known));
  const scan = scanReferences(draftText, work.entities.values());
  const scanned = scan.matches.flatMap((m) => m.entityIds);
  const fromEvents = (extracted?.events ?? []).map((e) => e.entityId);
  const nodeText = node.body;
  // occurrenceScope(M4): 기록된 등장 위치는 범위를 더하기만 한다. 이 노드의 기록은 지금 원고가 파일 본문과 같을 때만(재검사·다시 커밋) 쓴다.
  const markedHere = (marks ?? []).filter((m) => m.surface.kind === 'node' && m.surface.id === nodeId && draftText === nodeText).map((m) => m.entityId);
  const entityIds = uniqueSorted([...appearances, ...scanned, ...(extracted?.mentions ?? []), ...fromEvents, ...markedHere].filter(known));
  // 선수 개념(N1): 이 원고의 사건이 가리키는 엔티티의 선수 개념을 한 단계만 더한다. 등장(entityIds)으로 치지 않고,
  // 앞 사건(priorEvents)과 참고 버전(refs)에만 넣는다 — 선수 개념의 정의가 앞에서 바뀌면 이 노드도 다시 확인 필요가 된다.
  const prerequisiteIds = scopeFields.includes('prerequisites')
    ? uniqueSorted(fromEvents.filter(known).flatMap((id) => prerequisitesOf(work.entities.get(id)))).filter((id) => known(id) && !entityIds.includes(id))
    : [];
  const scopedIds = uniqueSorted([...entityIds, ...prerequisiteIds]);
  const before = eventsBefore({ events, positions: work.positions, nodeId });
  // 약속(M5 promiseScope): 이 노드에 안 나온 약속도 앞 사건만 싣는다(휴면 판정). entityIds·refs 는 넓히지 않는다 — 떡밥이 움직여도 다른 노드가 다시 확인 필요가 되지 않는다.
  const inScope = new Set(scopedIds);
  if (work.config?.features?.promiseScope) for (const e of work.entities.values()) if (e.kind === PROMISE_KIND) inScope.add(e.id);
  const priorEvents = before.events.filter((e) => inScope.has(e.entityId));
  // 순서 없는 노드(N4): 연결된 노드의 사건. priorEvents 와 따로 둔다 — 앞뒤 판정(ordered)과 core.promise-order 는 이것을 보지 않는다.
  const linked = linkedScope({ work, events, nodeId });
  const linkedEvents = linked.events.filter((e) => inScope.has(e.entityId));
  const ancestors = ancestorsOf(work.tree, nodeId);
  const ancestorIds = new Set(ancestors.map((a) => a.id));
  const upperPlans = ancestors.filter((a) => a.body.trim())
    .map((a) => ({ nodeId: a.id, level: a.level, rev: sha256(a.body), text: a.body }));
  const upperMentions = [...work.tree.nodes.values()]
    .filter((n) => n.kind === 'branch' && n.id !== nodeId && !ancestorIds.has(n.id) && n.body.trim())
    .map((n) => {
      const marked = (marks ?? []).filter((m) => m.surface.kind === 'node' && m.surface.id === n.id).map((m) => m.entityId);
      const found = new Set([...scanReferences(n.body, work.entities.values()).matches.flatMap((m) => m.entityIds), ...marked]);
      return { nodeId: n.id, entityIds: [...found].filter((id) => entityIds.includes(id)).sort() };
    })
    .filter((m) => m.entityIds.length > 0);
  const assetIds = new Set([...node.assets, ...assetRefsInBody(draftText)]);
  for (const id of assetIds) {
    const asset = work.assets.get(id);
    if (asset && !assetAllowsNode(asset, nodeId)) throw new FolioError('ASSET_SCOPE_MISMATCH', id, { nodeId, assetId: id });
  }
  const assets = [...work.assets.values()].filter((a) => assetAllowsNode(a, nodeId)).filter((a) => assetIds.has(a.id) || (a.nodeIds ?? []).includes(nodeId) || a.entities.some((id) => entityIds.includes(id))
    || (marks ?? []).some((m) => m.surface.kind === 'asset' && m.surface.id === a.id && entityIds.includes(m.entityId)));
  // 자료(N2 결정 7): 이 노드 앞머리 sources, 윗노드 앞머리 sources(가까운 것부터), 이 원고의 주장이 연결한 자료. 알려진 것만, 한 번씩.
  const listed = (n) => (Array.isArray(n.data.sources) ? n.data.sources.filter((id) => typeof id === 'string') : []);
  const sourceIds = [...new Set([...listed(node), ...ancestors.flatMap(listed), ...claims.flatMap((c) => c.sources.map((l) => l.sourceId))])];
  const sources = sourceIds.filter((id) => work.sources.has(id)).map((id) => work.sources.get(id));
  const branching = branchScope({ work, events, receiptRecords, nodeId });
  const branchGraph = work.config.features.branching && node.kind === 'branch' && work.positions.get(nodeId)?.unorderedBy === 'branching'
    ? graphView(buildBranchGraph(work)) : null;
  const refs = [
    ...(branching.applicable ? [{ kind: 'branching', id: nodeId, rev: branching.rev }, { kind: 'branch-graph', id: nodeId, rev: branching.graph.rev }] : []),
    ...(branchGraph ? [{ kind: 'branch-graph', id: nodeId, rev: branchGraph.rev }] : []),
    ...upperPlans.map((p) => ({ kind: 'node', id: p.nodeId, rev: p.rev })),
    ...scopedIds.map((id) => ({ kind: 'entity', id, rev: entityRevAt({ work, events, entityId: id, nodeId, receiptRecords, branching }) })),
    ...assets.map((a) => ({ kind: 'asset', id: a.id, rev: a.rev })),
    ...sources.map((s) => ({ kind: 'source', id: s.id, rev: s.rev })),
    ...contextRefs(work),
  ];
  const parent = upperPlans.find((p) => p.nodeId === node.parentId);
  return {
    nodeId, ordered: before.applicable, unorderedBy: work.positions.get(nodeId)?.unorderedBy ?? null,
    appearances, ambiguousReferences: scan.ambiguities, entityIds, prerequisiteIds, priorEvents, linkedNodeIds: [...linked.nodeIds], linkedEvents, upperPlans,
    ...(branching.applicable ? { branching: { ...branching, paths: branching.paths.map((p) => ({ ...p, events: p.events.filter((e) => inScope.has(e.entityId)) })) } } : {}),
    ...(branchGraph ? { branchGraph } : {}),
    parentPlan: parent?.text ?? null, upperMentions, assets, sources, claims, refs,
  };
}
