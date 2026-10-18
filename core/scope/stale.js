import { contextReasons } from '../work/context.js';
import { branchScope } from '../branching/scope.js';
import { buildBranchGraph } from '../branching/graph.js';
import { sha256 } from '../util/hash.js';
import { lastCommits, receiptsById } from '../ledger/receipts.js';
import { entityRevAt } from './scope.js';
import { checkReasons, featureReason, latestRecheck, orderReason, structureReason } from './stale-checks.js';
import { isTrackingRef, trackingStale } from '../tracking/stale.js';
import { managedAssetReasons } from '../assets/stale.js';

/**
 * 참고 버전의 지금 값. original(판본이 본 원본 원고, N6)은 노드 본문 hash 로, terms 는 그 판본 용어 대응표의 rev(없으면 null)로 본다.
 * 모르는 종류는 null 이다.
 */
export function currentRev({ work, events, ref, nodeId, receiptRecords = [] }) {
  switch (ref.kind) {
    case 'node':
    case 'original': { const node = work.tree.nodes.get(ref.id); return node && node.body.trim() ? sha256(node.body) : null; }
    case 'terms': return work.variants?.get(ref.id)?.terms.rev ?? null;
    case 'branching': return branchScope({ work, events, receiptRecords, nodeId: ref.id }).rev ?? null;
    case 'branch-graph': return work.config.features.branching ? buildBranchGraph(work).rev : null;
    case 'entity': return work.entities.has(ref.id) ? entityRevAt({ work, events, entityId: ref.id, nodeId, receiptRecords }) : null;
    case 'asset': return work.assets.get(ref.id)?.rev ?? null;
    case 'source': return work.sources.get(ref.id)?.rev ?? null;
    case 'lore': return work.lore?.contextRev ?? null;
    case 'interview': return work.interview?.revision ?? null;
    default: return null;
  }
}

/**
 * 뒤쪽 방향: 커밋 때 참고한 버전이 지금과 다르면 "다시 확인 필요". 표시만 하고 고치지 않는다.
 * applied({ leaf, branch, byLevel? }: 지금 켜진 검사와 digest)를 주면, 커밋(또는 그 뒤 재검사) 때 적용하지 않은 검사도 이유로 든다.
 * 앞뒤 판정 여부(order)가 커밋(또는 재검사) 때와 달라져도 이유로 든다.
 */
function hasBranchingContext(record) {
  return (record?.refs ?? []).some((ref) => ['branching', 'branch-graph'].includes(ref.kind))
    || record?.features?.branching !== undefined
    || record?.order?.unorderedBy === 'branching' || record?.order?.mode === 'branching'
    || record?.branching?.applicable === true;
}

export function findStale({ work, receiptRecords, events, applied = null, marks = null }) {
  const receipts = receiptsById(receiptRecords);
  const stale = [];
  for (const [nodeId, commit] of lastCommits(receiptRecords)) {
    const receipt = receipts.get(commit.receiptId);
    if (!receipt || !work.tree.nodes.has(nodeId)) continue;
    const reasons = [];
    const recheck = latestRecheck(receiptRecords, commit);
    const branchingBaseline = hasBranchingContext(receipt) || hasBranchingContext(recheck);
    const refs = branchingBaseline ? (recheck?.refs ?? receipt.refs) : receipt.refs;
    for (const ref of refs ?? []) {
      if (isTrackingRef(ref) || ['lore', 'interview'].includes(ref.kind)) continue;
      if (ref.kind === 'asset' && work.assets.get(ref.id)?.managed) continue;
      const now = currentRev({ work, events, ref, nodeId, receiptRecords });
      if (now !== ref.rev) reasons.push({ ...ref, was: ref.rev, now });
    }
    reasons.push(...contextReasons(work, recheck?.refs ?? receipt.refs));
    const node = work.tree.nodes.get(nodeId);
    if (work.tracking) reasons.push(...trackingStale(work, receiptRecords, node));
    reasons.push(...managedAssetReasons({ work, events, node, receipt, recheck, marks }));
    const appliedNow = applied ? (applied.byLevel?.[node.level] ?? applied[node.kind]) : null;
    if (appliedNow) reasons.push(...checkReasons({ applied: appliedNow, had: recheck?.appliedChecks ?? receipt.appliedChecks }));
    const order = orderReason({ work, nodeId, had: recheck?.order ?? receipt.order });
    if (order) reasons.push(order);
    const feature = featureReason({ work, nodeId, had: recheck?.features ?? receipt.features });
    if (feature) reasons.push(feature);
    // 구조(자식 목록)는 재검사 기록이 아니라 커밋 영수증과 견준다 — 재검사로는 풀리지 않는다.
    const structure = structureReason({ work, nodeId, had: receipt.structure });
    if (structure) reasons.push(structure);
    // 옛 영수증: 무엇을 적용했는지·어떤 순서였는지 모른다. 되채우기를 권할 수 있게 알린다.
    const missing = [['appliedChecks', recheck?.appliedChecks ?? receipt.appliedChecks], ['order', recheck?.order ?? receipt.order]]
      .filter(([, value]) => value === undefined).map(([field]) => field);
    if (applied && missing.length) reasons.push({ kind: 'unknown', id: nodeId, missing });
    if (reasons.length) stale.push({ nodeId, reasons });
  }
  return stale.sort((a, b) => work.positions.get(a.nodeId).ordinal - work.positions.get(b.nodeId).ordinal);
}
