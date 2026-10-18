import { MAIN, variantOf } from '../variants/model.js';
import { validateReceipt } from '../ledger/receipts.js';

/** 본문 hash·노드·실제 영수증·확정 기록이 한 쌍이어야 원고 근거가 된다. */
export function nodeReceiptValid(records, nodeId, hash, receiptId) {
  const receipt = records.find((r) => r.type === 'receipt' && variantOf(r) === MAIN && r.receiptId === receiptId && r.nodeId === nodeId && r.draftHash === hash);
  const commit = records.find((r) => r.type === 'commit' && variantOf(r) === MAIN && r.receiptId === receiptId && r.nodeId === nodeId && r.committedHash === hash);
  if (!receipt || !commit || receipt.seq >= commit.seq) return false;
  const { type: _t, seq: _s, at: _a, prev: _p, hash: _h, ...body } = receipt;
  if (validateReceipt(body).length || body.hard !== 0) return false;
  return !body.steps.some((s) => (s.checks ?? []).some((c) => c.status === 'error' || (c.findings ?? []).some((f) => f.severity === 'hard')));
}
