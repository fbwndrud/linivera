import { FolioError } from '../errors.js';
import { canonicalJson } from '../util/hash.js';

/** 모델 요청·검사·영수증이 같은 불변 정본/프로필을 참조한다. */
export function contextRefs(work) {
  return [
    ...(work.lore ? [{ kind: 'lore', id: 'world', rev: work.lore.contextRev, revision: work.lore.revision }] : []),
    ...(work.interview ? [{ kind: 'interview', id: 'profile', rev: work.interview.revision, revision: work.interview.revision }] : []),
  ];
}

/** 확인된 해석만 모델에 제공하며 원문 답의 미확인 상태를 숨기지 않는다. */
export function contextPayload(work) {
  return { ...(work.lore ? { lore: work.lore } : {}),
    ...(work.interview ? { interview: { revision: work.interview.revision, confirmed: Object.fromEntries(Object.entries(work.interview.profile).filter(([, a]) => a.confirmed).map(([field, a]) => [field, a.value])), pending: work.interview.pending } } : {}) };
}

/** 기능 토글이나 팩의 검사 설정과 무관한 정본 확정 조건. */
export function contextFindings(work, nodeId) {
  const findings = [];
  const finding = (code, message) => findings.push({ checkId: 'core.writing-context', severity: 'hard', code, message });
  if (work.interview?.pending.length) finding('INTERVIEW_CONFIRMATION_REQUIRED', work.interview.pending.join(', '));
  for (const id of work.lore?.staleAdopted ?? []) finding('LORE_ADOPTED_SUPPORT_STALE', id);
  for (const q of work.lore?.questions ?? []) {
    if (q.required && q.effectiveStatus !== 'resolved' && (q.nodeIds.length === 0 || q.nodeIds.includes(nodeId))) finding('LORE_REQUIRED_QUESTION_OPEN', q.id);
  }
  return findings;
}

export function assertWritingContext(work, nodeId) {
  const findings = contextFindings(work, nodeId);
  if (findings.length) throw new FolioError('LOCK_HARD_VIOLATION', 'resolve the required lore/profile decisions before committing', { findings });
}

export function assertContextRefs(work, refs) {
  const had = (refs ?? []).filter((r) => r.kind === 'lore' || r.kind === 'interview');
  if (canonicalJson(had) !== canonicalJson(contextRefs(work))) throw new FolioError('LOCK_CONTEXT_MISMATCH', 'the lore/profile context differs from the checked receipt');
}

export function contextReasons(work, refs) {
  const before = new Map((refs ?? []).filter((r) => r.kind === 'lore' || r.kind === 'interview').map((r) => [r.kind, r]));
  const now = new Map(contextRefs(work).map((r) => [r.kind, r]));
  return [...new Set([...before.keys(), ...now.keys()])].filter((kind) => before.get(kind)?.rev !== now.get(kind)?.rev)
    .map((kind) => ({ kind, id: kind === 'lore' ? 'world' : 'profile', was: before.get(kind)?.rev ?? null, now: now.get(kind)?.rev ?? null }));
}
