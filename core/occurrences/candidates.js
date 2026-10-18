import { scanReferences } from '../index/scan.js';
import { CONTEXT_CHARS } from './anchor.js';
import { surfaceFields } from './surfaces.js';
import { occurrenceStates } from './state.js';

/**
 * 제출을 돕는 후보(설계 §15의 mention-scan): 표면의 이름·별칭 정확 일치. 긴 말부터 가려서 두 번 세지 않는다.
 * 후보일 뿐 기록이 아니다 — 대명사·호칭은 호스트가 직접 찾아 낸다. 이미 같은 자리에 기록된 등장이 있으면 recorded.
 */
export function candidatesFor(work, records, surface) {
  const fields = surfaceFields(work, surface.kind, surface.id);
  if (!fields) return [];
  const recorded = occurrenceStates(work, records)
    .filter((s) => s.status !== 'stale' && s.surface.kind === surface.kind && s.surface.id === surface.id);
  const out = [];
  for (const [field, text] of fields) {
    for (const { quote, start, entityIds } of scanReferences(text, work.entities.values()).matches) {
      for (const entityId of entityIds) out.push({
        entityId, field, quote, start,
        before: text.slice(Math.max(0, start - CONTEXT_CHARS), start), after: text.slice(start + quote.length, start + quote.length + CONTEXT_CHARS),
        ...(entityIds.length > 1 ? { ambiguous: true, candidateIds: entityIds } : {}),
        recorded: recorded.some((s) => s.surface.field === field && s.entityId === entityId && s.start <= start && start < s.start + s.quote.length),
      });
    }
  }
  return out.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : a.start - b.start));
}
