import { reanchor } from '../occurrences/anchor.js';
import { latestByNode } from './records.js';
import { verifySourceLink } from './binding.js';

import { isPlainObject } from '../util/plain.js';
/** @param {unknown} link */
const isLink = (link) => isPlainObject(link) && typeof (/** @type {any} */ (link)).sourceId === 'string' && typeof (/** @type {any} */ (link)).quote === 'string';
/** 모양이 틀린 주장(객체가 아님, sources 가 배열이 아님)은 짐작하지 않고 건너뛴다 — 실행 파일을 믿지 않는다(record-run.js 와 같은 태도). @param {unknown} claim */
const isClaim = (claim) => isPlainObject(claim) && typeof (/** @type {any} */ (claim)).quote === 'string' && Array.isArray((/** @type {any} */ (claim)).sources);

/**
 * 검사가 보는 이 원고의 주장(ctx.claims, N2 §2). 연결은 지금 자료로 다시 확인한 것만 남긴다 — "확인된 근거"만 근거로 센다.
 * - evidence 기능이 꺼져 있으면 없다(기록장도 읽지 않는다 — 러너가 records 를 null 로 준다).
 * - 이 실행의 추출 답이 주장을 냈으면(submittedClaims) 그것.
 * - 아니면 원고가 파일 본문과 같을 때(재검사·다시 커밋) 근거 기록장의 이 노드 최근 기록 가운데 지금 본문에서 다시 찾은 주장.
 * - 그 밖에는 없다: 새로 쓴 원고에 옛 기록의 주장을 대지 않는다.
 * @param {{ work: any, records: any[]|null, nodeId: string, draft: string, extracted: any }} input
 * @returns {Array<{ quote: string, sources: Array<{ sourceId: string, quote: string }> }>}
 */
export function claimsFor({ work, records, nodeId, draft, extracted }) {
  if (!work.config.features.evidence) return [];
  const verified = (claim) => ({
    quote: claim.quote,
    ...(claim.basis !== undefined ? { basis: claim.basis } : {}), ...(claim.perspectiveId !== undefined ? { perspectiveId: claim.perspectiveId } : {}),
    sources: claim.sources.filter(isLink).filter((link) => verifySourceLink(work.sources.get(link.sourceId), link).ok)
      .map(({ sourceId, quote }) => ({ sourceId, quote })),
  });
  if (extracted?.submittedClaims === true) return (Array.isArray(extracted.claims) ? extracted.claims : []).filter(isClaim).map(verified);
  const node = work.tree.nodes.get(nodeId);
  if (!node || draft !== node.body) return [];
  const record = latestByNode(records ?? []).get(nodeId);
  if (!record) return [];
  return record.claims.filter((claim) => reanchor(node.body, claim).status !== 'stale').map(verified);
}
