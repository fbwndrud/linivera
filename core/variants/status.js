import { contextReasons } from '../work/context.js';
import { sha256 } from '../util/hash.js';
import { lastCommits, receiptsById } from '../ledger/receipts.js';
import { preorder } from '../store/tree.js';
import { currentRev } from '../scope/stale.js';
import { checkReasons } from '../scope/stale-checks.js';
import { doneNodes } from '../run/done.js';
import { MAIN } from './model.js';
import { variantTextOf } from './original.js';

/**
 * 판본 하나의 상태: 그 판본 커밋만 본다(lastCommits(records, id)). 원본 상태(stale·drift)와 섞지 않는다.
 * - stale: 커밋 때 본 원본 원고·용어 대응표(refs)가 지금과 다르거나, 그 뒤 판본 검사가 켜지거나 바뀜. 표시만 하고 고치지 않는다 — 판본을 다시 돌린다.
 * - drift: 판본 파일이 커밋 원고와 다름(HAND_EDITED), 파일이 없어짐(VARIANT_FILE_MISSING), 노드가 트리에 없음(NODE_MISSING).
 * - missing: 원본은 끝났는데(doneNodes) 이 판본 커밋이 없는 잎(읽는 순서).
 */
function oneVariant({ work, receiptRecords, events, applied, done, variant }) {
  const commits = lastCommits(receiptRecords, variant);
  const receipts = receiptsById(receiptRecords);
  const stale = [];
  const drift = [];
  for (const [nodeId, commit] of commits) {
    if (!work.tree.nodes.has(nodeId)) { drift.push({ nodeId, code: 'NODE_MISSING' }); continue; }
    const text = variantTextOf(work, variant, nodeId);
    if (!text) drift.push({ nodeId, code: 'VARIANT_FILE_MISSING' });
    else if (sha256(text.body) !== commit.committedHash) drift.push({ nodeId, code: 'HAND_EDITED', path: text.path, expected: commit.committedHash, actual: sha256(text.body) });
    const receipt = receipts.get(commit.receiptId);
    if (!receipt) continue;
    const reasons = contextReasons(work, receipt.refs);
    for (const ref of receipt.refs ?? []) {
      if (['lore', 'interview'].includes(ref.kind)) continue;
      const now = currentRev({ work, events, ref, nodeId });
      if (now !== ref.rev) reasons.push({ ...ref, was: ref.rev, now });
    }
    reasons.push(...checkReasons({ applied: applied?.variants?.[variant] ?? null, had: receipt.appliedChecks }));
    if (reasons.length) stale.push({ nodeId, reasons });
  }
  const missing = preorder(work.tree).filter((id) => work.tree.nodes.get(id).kind === 'leaf' && done.has(id) && !commits.has(id));
  return { committed: commits.size, stale, drift, missing };
}

/**
 * folio_status 의 variants(N6): 선언된 판본마다 { committed, stale, drift, missing }. variants 기능이 꺼졌거나 판본이 없으면 null.
 * @param {{ work: any, receiptRecords: any[], events: any[], applied: any }} input
 */
export function variantsStatus({ work, receiptRecords, events, applied }) {
  const ids = work.config.variants.filter((id) => id !== MAIN);
  if (!work.config.features.variants || ids.length === 0) return null;
  const done = doneNodes(work, receiptRecords);
  return Object.fromEntries(ids.map((variant) => [variant, oneVariant({ work, receiptRecords, events, applied, done, variant })]));
}
