import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { validateClaims } from './validate.js';

/**
 * 커밋이 끝난 실행의 추출 주장을 근거 기록장에 남긴다(origin extract). 같은 영수증으로 두 번 쓰지 않는다(커밋 재개 멱등).
 * 실행 파일의 주장은 믿지 않는다: 커밋된 원고(hash = 실행 draftHash)와 지금 자료로 다시 대조해 모두 맞아야 쓴다.
 * origin 'extract' 는 evidenceInExtract 가 켜져 있었다는 뜻이므로 evidence·evidenceInExtract 가 다 켜져 있어야 쓴다(M4 Ruling B3-2 와 같은 규칙).
 * 틀리면 EVIDENCE_INVALID 로 던진다 — 호출자(commitStep)가 잡아 실행 기록(history)에 남긴다. 근거 기록은 잠금 판단에 쓰이지 않으므로 커밋은 막지 않는다.
 * @param {{ ledger: { readAll: () => Promise<any[]>, append: (entry: any) => Promise<any> }, ctx: any, run: any, receiptId: string }} params
 */
export async function recordRunEvidence({ ledger, ctx, run, receiptId }) {
  const events = run.outputs.events;
  const features = ctx.work.config.features;
  if (!features.evidence || !features.evidenceInExtract || events?.submittedClaims !== true) return null;
  const records = await ledger.readAll();
  if (records.some((r) => r.type === 'evidence' && r.receiptId === receiptId)) return null;
  const text = run.outputs.draft;
  if (typeof text !== 'string' || sha256(text) !== run.draftHash) {
    throw new FolioError('EVIDENCE_INVALID', `${run.runId}: committed text no longer matches the run's draftHash`);
  }
  const { claims, errors } = validateClaims(ctx.work, text, events.claims, { requireBound: true });
  if (errors.length) throw new FolioError('EVIDENCE_INVALID', `${run.runId}: claims failed re-validation against the committed text`, { errors: errors.slice(0, 50) });
  return ledger.append({ type: 'evidence', nodeId: run.nodeId, textHash: run.draftHash, claims, origin: 'extract', receiptId });
}
