import { openLedger } from '../ledger/ledger.js';
import { EVIDENCE_LEDGER } from './records.js';
import { evidenceStates, staleEvidence } from './state.js';

/**
 * 근거 연결 요약: 본문·자료 버전이 무효인 주장(stale)과 전체 수. folio_status 가 정본 자리이고 folio_sources list 도 같은 모양을 쓴다(N2 결정 19).
 * M4 등장 위치(core/status.js occurrencesStatus)와 같은 모양: evidence 기능이 꺼져 있으면 null,
 * 기록장 hash 사슬이 깨졌으면 짐작하지 않고 { ledger: 검증 결과, stale: [], total: 0 }.
 * @param {string} root
 * @param {{ config: { features: Record<string, boolean> }, tree: { nodes: Map<string, any> }, sources: Map<string, any> }} work
 */
export async function evidenceStatus(root, work) {
  if (!work.config.features.evidence) return null;
  const ledger = openLedger(root, EVIDENCE_LEDGER);
  const verified = await ledger.verify();
  if (!verified.ok) return { ledger: verified, stale: [], total: 0 };
  const states = evidenceStates(work, await ledger.readAll());
  return { stale: staleEvidence(states), total: states.length };
}
