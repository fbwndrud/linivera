import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { withWorkLock } from '../run/work-lock.js';
import { assertFeature } from '../work/features.js';
import { openLedger } from '../ledger/ledger.js';
import { EVIDENCE_LEDGER } from '../evidence/records.js';
import { evidenceStates } from '../evidence/state.js';
import { evidenceStatus } from '../evidence/status.js';

/** get 이 돌려주는 글 자료 글의 한도(글자). 넘으면 잘라서 truncated: true. */
export const MAX_TEXT_CHARS = 200000;
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * evidence 가 켜졌을 때만 근거 상태를 계산한다(기록장은 작업 잠금 안에서 읽는다).
 * hash 사슬이 깨졌으면 짐작하지 않고(list·status 와 같은 규칙, 결정 19) states 대신 검증 결과를 돌려준다.
 * @returns {Promise<{ states: any[]|null, ledger: { ok: boolean, line?: number, error?: string }|null }>}
 */
async function statesOf(root, work) {
  if (!work.config.features.evidence) return { states: null, ledger: null };
  const ledger = openLedger(root, EVIDENCE_LEDGER);
  const verified = await ledger.verify();
  if (!verified.ok) return { states: null, ledger: verified };
  return { states: evidenceStates(work, await ledger.readAll()), ledger: null };
}

/**
 * folio_sources list: 자료 목록(설명 요약)과 근거 연결 요약 — folio_status 의 evidence 와 같은 값(evidenceStatus). evidence 가 꺼지면 evidence: null.
 * @param {string} root
 */
export async function listSources(root) {
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    assertFeature(work.config, 'sources');
    return {
      sources: [...work.sources.values()].sort(byId).map((s) => ({
        id: s.id, title: s.title, file: s.file, date: s.date, reliability: s.reliability, spans: s.spans.length, text: s.text !== null,
      })),
      evidence: await evidenceStatus(root, work),
    };
  });
}

/**
 * folio_sources get: 자료 하나(글 자료는 글을 20만 자까지)와 그 자료에 걸린 근거 연결의 지금 상태. evidence 가 꺼지면 links: null.
 * @param {string} root
 * @param {unknown} id
 */
export async function getSource(root, id) {
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    assertFeature(work.config, 'sources');
    const source = typeof id === 'string' ? work.sources.get(id) : undefined;
    if (!source) throw new FolioError('SOURCE_NOT_FOUND', String(id).slice(0, 200));
    const { states, ledger } = await statesOf(root, work);
    const links = states?.filter((s) => s.sources.some((l) => l.sourceId === source.id)).map((s) => ({
      nodeId: s.nodeId, quote: s.quote, status: s.status, ...(s.basis !== undefined ? { basis: s.basis } : {}), ...(s.perspectiveId !== undefined ? { perspectiveId: s.perspectiveId } : {}), reason: /** @type {{ reason?: string }} */ (s).reason ?? null, sources: s.sources.filter((l) => l.sourceId === source.id),
    })) ?? null;
    return {
      source: {
        id: source.id, title: source.title, file: source.file, date: source.date, reliability: source.reliability, spans: source.spans, rev: source.rev, contentHash: source.contentHash,
        text: source.text === null ? null : source.text.slice(0, MAX_TEXT_CHARS), truncated: source.text !== null && source.text.length > MAX_TEXT_CHARS,
      },
      links,
      // 기록장 hash 사슬이 깨졌을 때만 있다(list·status 와 같은 모양, 결정 19) — 짐작한 links 대신 검증 결과를 준다.
      ...(ledger ? { ledger } : {}),
    };
  });
}
