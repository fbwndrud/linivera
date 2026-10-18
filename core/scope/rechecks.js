import { lastCommits } from '../ledger/receipts.js';
import { latestRecheck } from './stale-checks.js';

/**
 * 되채우기(재검사)로 풀 수 있는 이유만 추린다: 켜거나 바뀐 검사, 바뀐 순서, occurrenceScope 토글(feature), 옛 영수증(reason 'unknown').
 * findStale 결과를 받는다(읽는 순서 유지).
 */
export function pendingRechecks(stale) {
  const out = [];
  for (const { nodeId, reasons } of stale) {
    const checks = reasons.filter((r) => r.kind === 'check').map((r) => r.id);
    const order = reasons.find((r) => r.kind === 'order');
    const feature = reasons.find((r) => r.kind === 'feature');
    const tracking = reasons.filter((r) => r.kind.startsWith('tracking_'));
    const contexts = reasons.filter((r) => ['lore', 'interview'].includes(r.kind));
    const unknown = reasons.some((r) => r.kind === 'unknown');
    const branching = reasons.some((r) => ['branching', 'branch-graph'].includes(r.kind));
    if (checks.length || order || feature || unknown || tracking.length || branching || contexts.length) {
      out.push({
        nodeId, checks, ...(contexts.length ? { contexts } : {}), ...(branching ? { reason: 'branching' } : {}),
        ...(tracking.length ? { tracking } : {}),
        ...(order ? { order: { was: order.was, now: order.now } } : {}),
        ...(feature ? { feature: { id: feature.id, was: feature.was, now: feature.now } } : {}),
        ...(unknown ? { reason: 'unknown' } : {}),
      });
    }
  }
  return out;
}

/** 지금 커밋 원고에 대한 가장 최근 재검사가 hard 지적을 낸 노드. 원고는 자동으로 고치지 않는다 — 사람이 다시 쓴다. */
export function flaggedNodes(work, receiptRecords) {
  const out = [];
  for (const [nodeId, commit] of lastCommits(receiptRecords)) {
    const recheck = latestRecheck(receiptRecords, commit);
    if (!recheck || !(recheck.hard > 0) || !work.tree.nodes.has(nodeId)) continue;
    const findings = recheck.steps.flatMap((s) => (s.checks ?? []).flatMap((c) => c.findings ?? [])).filter((f) => f.severity === 'hard');
    out.push({ nodeId, recheckId: recheck.recheckId, findings });
  }
  return out.sort((a, b) => work.positions.get(a.nodeId).ordinal - work.positions.get(b.nodeId).ordinal);
}
