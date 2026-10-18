import { canonicalJson } from '../util/hash.js';
import { HASH, invalid } from './schema.js';

/** 검토에 쓴 설정 파일 버전. 현재 내용으로 과거 검토를 재작성하지 않는다. */
export const entityRefsFor = (brief, entities) => [...(brief.entities ?? [])].sort().map((id) => ({ id, rev: entities.get(id)?.rev ?? null }));

export function validateEntityRefs(refs, brief) {
  if (refs === undefined) return; // 옛 기록은 읽되 현재 승인에는 별도 버전 확인이 필요하다.
  if (!Array.isArray(refs) || refs.some((r) => !r || typeof r.id !== 'string' || !HASH.test(r.rev))
    || canonicalJson(refs.map((r) => r.id)) !== canonicalJson([...(brief.entities ?? [])].sort())) throw invalid('invalid review entity refs');
}

export function reviewContextChanged(review, current) {
  if (!review) return false;
  if (review.entityRefs === undefined) return current.length > 0;
  return canonicalJson(review.entityRefs) !== canonicalJson(current);
}
