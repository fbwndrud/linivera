import { reanchor } from '../occurrences/anchor.js';
import { latestByNode } from './records.js';
import { verifySourceLink } from './binding.js';

/**
 * 기록된 근거 연결이 지금 본문·자료에서 어떤지. 파일이 정본이고 이 결과는 매번 새로 계산한다.
 * - 주장 위치: 노드가 없으면 stale(NODE_MISSING), 아니면 M4 다시 찾기(reanchor)로 located/relocated/stale. 짐작하지 않는다.
 * - 연결마다 verified: 당시 자료 revision·원본 hash·인용이 현재와 일치하는가. 옛 버전 미상은 확인된 근거가 아니다.
 * @param {{ tree: { nodes: Map<string, any> }, sources: Map<string, any> }} work
 * @param {any[]} records
 */
export function evidenceStates(work, records) {
  const out = [];
  for (const record of latestByNode(records).values()) {
    const node = work.tree.nodes.get(record.nodeId);
    for (const claim of record.claims) {
      const at = node ? reanchor(node.body, claim) : { status: 'stale', start: null, reason: 'NODE_MISSING' };
      const sources = claim.sources.map((link) => {
        const checked = verifySourceLink(work.sources.get(link.sourceId), link);
        return { ...link, verified: checked.ok, ...(checked.ok ? {} : { reason: checked.code }) };
      });
      out.push({ nodeId: record.nodeId, quote: claim.quote, before: claim.before, after: claim.after, sources, origin: record.origin, seq: record.seq, ...(claim.basis !== undefined ? { basis: claim.basis } : {}), ...(claim.perspectiveId !== undefined ? { perspectiveId: claim.perspectiveId } : {}), ...at });
    }
  }
  return out;
}

/** 본문을 다시 찾지 못했거나 자료 근거가 무효인 주장(재연결 필요). */
export const staleEvidence = (states) => states.filter((s) => s.status === 'stale' || s.sources.some((l) => !l.verified))
  .map((s) => ({ nodeId: s.nodeId, quote: s.quote, reason: s.reason ?? s.sources.find((l) => !l.verified)?.reason }));
