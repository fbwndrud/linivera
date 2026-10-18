import { FolioError } from '../errors.js';
import { lastCommits } from '../ledger/receipts.js';
import { MAIN, variantOf } from './model.js';

/** 판본 영수증이 가리키는 원본과 용어 범위는 판본·원본 메타데이터와 일치해야 한다. */
export function assertVariantRefs(receipt) {
  if (variantOf(receipt) === MAIN) return;
  const [original, terms] = receipt.refs ?? [];
  const context = (receipt.refs ?? []).slice(2);
  if (context.some((ref) => !['lore', 'interview'].includes(ref.kind)) || new Set(context.map((ref) => ref.kind)).size !== context.length || original?.kind !== 'original' || original.id !== receipt.nodeId
    || original.rev !== receipt.original?.committedHash || terms?.kind !== 'terms' || terms.id !== receipt.variant) {
    throw new FolioError('LOCK_RECEIPT_INVALID', 'variant refs do not match the variant and original',
      { problems: [{ code: 'VARIANT_REFS_MISMATCH' }] });
  }
}

/**
 * 영수증의 판본과 파이프라인의 판본이 같아야 한다(main 파이프라인은 variant 가 없다 = main). 설정으로 끌 수 없다.
 * 판본 파이프라인 digest 가 판본 id 를 품으므로 보통은 digest 에서 먼저 걸리지만, 판본을 명시해 한 번 더 막는다.
 */
export function assertPipelineVariant({ pipeline, receipt }) {
  if (variantOf(receipt) !== (pipeline?.variant ?? MAIN)) {
    throw new FolioError('LOCK_PIPELINE_MISMATCH', 'the receipt was issued for a different variant', { variant: String(variantOf(receipt)).slice(0, 60) });
  }
}

/**
 * 판본 커밋은 그 판본을 검사할 때 본 원본 커밋(receipt.original)이 지금도 원본의 마지막 커밋일 때만 된다(LOCK_ORIGINAL_CHANGED).
 * 기록장만 본다(원본 파일의 손수정은 원본의 drift 다). main 영수증은 해당 없음.
 * @param {any[]} receiptRecords
 * @param {any} receipt
 */
export function assertOriginalCurrent(receiptRecords, receipt) {
  if (variantOf(receipt) === MAIN) return;
  const commit = lastCommits(receiptRecords).get(receipt.nodeId);
  if (!commit || commit.receiptId !== receipt.original?.receiptId || commit.committedHash !== receipt.original?.committedHash) {
    throw new FolioError('LOCK_ORIGINAL_CHANGED', `${receipt.nodeId}: the original changed after this variant was checked`, {
      nodeId: receipt.nodeId, variant: receipt.variant,
    });
  }
}
