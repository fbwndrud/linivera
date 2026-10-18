import { assertWritingContext, assertContextRefs } from '../work/context.js';
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { updateNode } from '../store/tree.js';
import { publishedEvents } from '../ledger/event-visibility.js';
import { validateReceipt } from '../ledger/receipts.js';
import { assertAppliedChecks, assertOrderMatches, assertStructureMatches, assertStructurePresent, assertBlocksResolved, assertDecisionsMatch, assertPipelineMatch, receiptVerdictFindings } from './commit-locks.js';
import { assertAssetIntegrity } from '../assets/records.js';
import { assertTrackingCommit, appendTrackingBatch } from '../tracking/commit.js';
import { commitTarget } from './commit-target.js';
import { gatherScope } from '../scope/scope.js';
import { MAIN, variantOf } from '../variants/model.js';
import { assertOriginalCurrent, assertVariantRefs } from '../variants/locks.js';
import { writeVariantText } from '../store/variants.js';

const EVENT_FIELDS = ['eventId', 'entityId', 'kind', 'data', 'quote'];

/** 사건에서 신뢰할 수 있는 필드만 남긴다. type/nodeId/receiptId 등은 항상 커밋이 정한다. */
function allowedEventFields(event) {
  const out = {};
  for (const field of EVENT_FIELDS) if (field in event) out[field] = event[field];
  return out;
}

/** 기록장의 영수증 기록(기록장 필드를 뺀 본문)이 이 영수증과 같은가. */
function sameReceiptBody(stored, receipt) {
  const { type: _t, seq: _s, at: _a, prev: _p, hash: _h, ...body } = stored;
  return canonicalJson(body) === canonicalJson(receipt);
}

function assertLocks({ pipeline, receipt, text, variants }) {
  if (typeof text !== 'string') throw new FolioError('LOCK_HASH_MISMATCH', 'the text to commit must be a string');
  if (!receipt) throw new FolioError('LOCK_NO_RECEIPT', 'a commit needs a check receipt');
  const problems = validateReceipt(receipt, { variants });
  if (problems.length) throw new FolioError('LOCK_RECEIPT_INVALID', problems.map((p) => p.code).join(', '), { problems });
  assertPipelineMatch({ pipeline, receipt });
  if (receipt.draftHash !== sha256(text)) throw new FolioError('LOCK_HASH_MISMATCH', 'the text to commit is not the text that was checked');
  const hard = receiptVerdictFindings(receipt).filter((f) => f.severity === 'hard');
  if (receipt.hard !== 0 || hard.length) throw new FolioError('LOCK_HARD_VIOLATION', 'hard conflicts block the commit', { findings: hard });
  assertBlocksResolved(receipt);
  assertAppliedChecks(receipt);
}

async function appendNodeEvents(ledger, receipt, receiptRecords) {
  const records = await ledger.readAll();
  if (!records.some((r) => r.type === 'retraction' && r.receiptId === receipt.receiptId)) {
    const prior = publishedEvents({ eventRecords: records, receiptRecords, legacyMode: true }).filter((e) => e.nodeId === receipt.nodeId && e.receiptId !== receipt.receiptId).map((e) => e.eventId);
    if (prior.length) await ledger.append({ type: 'retraction', receiptId: receipt.receiptId, nodeId: receipt.nodeId, supersedes: prior });
  }
  for (const event of receipt.events) {
    if (!records.some((r) => r.eventId === event.eventId)) {
      await ledger.append({ ...allowedEventFields(event), type: 'event', receiptId: receipt.receiptId, nodeId: receipt.nodeId });
    }
  }
}

/**
 * 원고를 확정하는 유일한 함수. 잠금 규칙은 여기서 전부 검사하며 설정으로 끌 수 없다.
 * 모든 쓰기는 멱등이라 중간에 죽으면 resume: true 로 다시 불러 끝낸다.
 * 판본(N6): 영수증의 판본은 work.yaml 에 선언된 것이어야 하고, 잠금(hash 일치·영수증·hard·판정 대조)은 판본마다 따로 성립한다.
 * 판본 커밋은 variants/<id>/<노드>.md 만 쓰고 사건 기록장을 건드리지 않는다. 커밋 기록·앞지름(superseded) 판단은 같은 판본끼리만 본다.
 * @param {{ root: string, work: import('../store/work.js').Work, ledgers: { receipts: object, events: object, decisions: object },
 *   pipeline: { steps: object[], digest: string, packDigest?: string|null }, receipt: import('../ledger/receipts.js').Receipt, text: string,
 *   hooks?: { afterCommitIntentWrite?: () => any, afterReceiptWrite?: () => any, afterBodyWrite?: () => any, afterEventsWrite?: () => any, afterTrackingWrite?: () => any, afterCommitWrite?: () => any }, resume?: boolean }} options
 */
export async function commitNode({ root, work, ledgers, pipeline, receipt, text, hooks = {}, resume = false }) {
  assertLocks({ pipeline, receipt, text, variants: work?.config?.variants ?? [MAIN] });
  const variant = variantOf(receipt);
  const receiptRecords = await ledgers.receipts.readAll();
  assertOriginalCurrent(receiptRecords, receipt);
  const commitRecords = receiptRecords.filter((r) => r.type === 'commit');
  const receiptRunId = (id) => receiptRecords.find((r) => r.type === 'receipt' && r.receiptId === id)?.runId;
  // 이미 기록된 실행은 그 영수증 ID 하나만 쓸 수 있다. 기록 전 실행도 아래 판정 기록과 판본·원본 범위가 일치해야 한다.
  const sameRun = commitRecords.find((r) => r.receiptId !== receipt.receiptId && receiptRunId(r.receiptId) === receipt.runId);
  if (sameRun) throw new FolioError('LOCK_RUN_ALREADY_COMMITTED', `${receipt.runId} already committed ${sameRun.receiptId}`, { runId: receipt.runId, receiptId: sameRun.receiptId });
  const recordedBody = receiptRecords.find((r) => r.type === 'receipt' && r.receiptId === receipt.receiptId);
  if (recordedBody && !sameReceiptBody(recordedBody, receipt)) {
    throw new FolioError('LOCK_RECEIPT_MISMATCH', `${receipt.receiptId} differs from the recorded receipt`);
  }
  const pending = receiptRecords.find((r) => r.type === 'receipt' && r.runId === receipt.runId && r.receiptId !== receipt.receiptId);
  if (pending) throw new FolioError('LOCK_RECEIPT_MISMATCH', `${receipt.runId} already has receipt ${pending.receiptId}`,
    { runId: receipt.runId, receiptId: pending.receiptId });
  assertVariantRefs(receipt);
  if (work?.tree?.nodes.has(receipt.nodeId)) {
    const recorded = receiptRecords.some((r) => r.type === 'receipt' && r.receiptId === receipt.receiptId);
    assertOrderMatches(work, receipt);
    assertStructureMatches(work, receipt);
    assertStructurePresent(work, receipt, { recorded });
  }
  // 판정 대조: decisions 기록장이 없으면 대조할 수 없으니 거부한다(끌 수 없음).
  assertDecisionsMatch({ records: ledgers.decisions ? await ledgers.decisions.readAll() : null, pipeline, receipt });
  if (!recordedBody) { assertWritingContext(work, receipt.nodeId); assertContextRefs(work, receipt.refs); }
  const node = work.tree.nodes.get(receipt.nodeId);
  if (!node) throw new FolioError('NODE_NOT_FOUND', receipt.nodeId);
  const assetIds = new Set(receipt.refs.filter((r) => r.kind === 'asset').map((r) => r.id));
  assertAssetIntegrity([...gatherScope({ work, events: [], nodeId: node.id, draftText: text }).assets,
    ...[...work.assets.values()].filter((a) => assetIds.has(a.id))]);

  const variantCommits = commitRecords.filter((r) => variantOf(r) === variant);

  const already = commitRecords.find((r) => r.receiptId === receipt.receiptId);
  // 한 실행은 한 번만 커밋한다. 끝난 실행을 되살려 옛 판정 기록으로 다시 커밋하는 것을 막는다(같은 영수증의 재개는 아래에서 멱등).
  // 이미 커밋된 영수증 id 라면 그 커밋 기록·영수증 기록이 이 영수증과 같은 노드·같은 본문이어야 한다(위조한 id 로 done 을 받지 못하게).
  if (already && (already.nodeId !== receipt.nodeId || variantOf(already) !== variant || !recordedBody || !sameReceiptBody(recordedBody, receipt))) {
    throw new FolioError('LOCK_RECEIPT_MISMATCH', `${receipt.receiptId} was committed for a different receipt`, { nodeId: already.nodeId });
  }
  await assertTrackingCommit({ root, work, receipt, text, recorded: Boolean(recordedBody) });
  if (already) {
    if (resume) return { receiptId: receipt.receiptId, nodeId: node.id, committedHash: receipt.draftHash, alreadyCommitted: true };
    throw new FolioError('LOCK_RECEIPT_CONSUMED', `${receipt.receiptId} was already used`);
  }
  const stored = receiptRecords.find((r) => r.type === 'receipt' && r.receiptId === receipt.receiptId);
  // 이 영수증이 멈춘 자리부터든(resume) 처음부터든, 그 사이 다른 영수증이 이 노드를 앞질러 커밋했다면 더는 쓸 수 없다.
  if (stored) {
    const receiptSeq = (id) => receiptRecords.find((r) => r.type === 'receipt' && r.receiptId === id)?.seq ?? 0;
    const supersededBy = variantCommits.find((r) => r.nodeId === receipt.nodeId && r.receiptId !== receipt.receiptId && receiptSeq(r.receiptId) > stored.seq);
    if (supersededBy) throw new FolioError('LOCK_RECEIPT_SUPERSEDED', `${receipt.receiptId} was superseded by ${supersededBy.receiptId}`, { by: supersededBy.receiptId });
  }
  const eventRecords = await ledgers.events.readAll();
  for (const event of receipt.events) {
    const existing = eventRecords.find((r) => r.type === 'event' && r.eventId === event.eventId);
    if (existing && existing.receiptId !== receipt.receiptId) {
      throw new FolioError('LOCK_RECEIPT_INVALID', `eventId ${event.eventId} is already used by another receipt`, { problems: [{ code: 'EVENT_ID_REUSED', eventId: event.eventId }] });
    }
  }

  await commitTarget({ root, node, receipt, text, recorded: Boolean(stored), prepare: true });
  await hooks.afterCommitIntentWrite?.();
  if (!stored) await ledgers.receipts.append({ ...receipt, type: 'receipt' });
  await hooks.afterReceiptWrite?.();
  const target = await commitTarget({ root, node, receipt, text, recorded: true });
  if (target === 'before') {
    if (variant === MAIN) await updateNode(root, node, { data: { status: 'committed' }, body: text });
    else await writeVariantText(root, variant, node.id, text);
  }
  await hooks.afterBodyWrite?.();
  if (variant === MAIN) await appendNodeEvents(ledgers.events, receipt, receiptRecords);
  await hooks.afterEventsWrite?.();
  if (receipt.trackingBatch) await appendTrackingBatch(root, receipt.trackingBatch);
  await hooks.afterTrackingWrite?.();
  await ledgers.receipts.append({ type: 'commit', receiptId: receipt.receiptId, nodeId: node.id, variant: receipt.variant, committedHash: receipt.draftHash,
    ...(receipt.trackingBatch ? { trackingBatchDigest: receipt.trackingBatch.batchDigest } : {}) });
  await hooks.afterCommitWrite?.();
  return { receiptId: receipt.receiptId, nodeId: node.id, committedHash: receipt.draftHash };
}
