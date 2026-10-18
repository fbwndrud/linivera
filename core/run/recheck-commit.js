import { assertWritingContext, assertContextRefs } from '../work/context.js';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { pipelineDigest } from '../pipeline/define.js';
import { lastCommits } from '../ledger/receipts.js';
import { RECHECK_TYPE, recheckOfRun, validateRecheck } from '../ledger/recheck.js';
import { assertAppliedChecks, assertOrderMatches, assertBlocksResolved, assertDecisionsMatch, receiptVerdictFindings } from './commit-locks.js';
import { gatherScope } from '../scope/scope.js';
import { assertAssetIntegrity } from '../assets/records.js';

/** 재검사 기록의 단계는 지금 파이프라인의 검사 단계와 정확히 같아야 한다(빠지거나 덧붙이면 안 된다). */
function assertCheckSteps(pipeline, record) {
  if (pipelineDigest(pipeline.steps, pipeline.packDigest ?? null) !== pipeline.digest || record.pipelineDigest !== pipeline.digest) {
    throw new FolioError('LOCK_PIPELINE_MISMATCH', 'the recheck was made under a different pipeline');
  }
  const expected = pipeline.steps.filter((s) => s.kind === 'check').map((s) => s.id);
  const got = record.steps.map((s) => s.id);
  if (expected.join('\u0000') !== got.join('\u0000')) throw new FolioError('LOCK_STEP_MISSING', 'the recheck did not run every check step exactly once', { expected, got });
}

/**
 * 재검사 결과를 receipts 기록장에 남기는 유일한 함수. 원고는 건드리지 않는다. 잠금은 설정으로 끌 수 없다:
 * 형식(영수증과 같은 규칙) · 검사 단계 일치 · 지금 커밋된 원고(마지막 commit 의 hash = 파일 본문 hash) ·
 * 한 실행에 한 번 · hard 개수 일치 · (hard 가 없으면) block 은 사용자가 이유와 함께 넘긴 것 · appliedChecks 일치 ·
 * decisions 기록장 대조(검사 결과·범위·넘김). hard 지적은 막지 않고 기록한다 — 그 노드는 flagged 로 보고된다.
 * @param {{ work: import('../store/work.js').Work, ledgers: { receipts: object, decisions: object }, pipeline: { steps: object[], digest: string, packDigest?: string|null }, record: object }} options
 */
export async function recordRecheck({ work, ledgers, pipeline, record }) {
  const problems = validateRecheck(record);
  if (problems.length) throw new FolioError('LOCK_RECEIPT_INVALID', problems.map((p) => p.code).join(', '), { problems });
  assertCheckSteps(pipeline, record);
  const records = await ledgers.receipts.readAll();
  const commit = lastCommits(records).get(record.nodeId);
  if (!commit || commit.committedHash !== record.committedHash || commit.receiptId !== record.receiptId) {
    throw new FolioError('LOCK_RECHECK_STALE', `${record.nodeId} is not committed with this text any more`, { nodeId: record.nodeId });
  }
  const node = work.tree.nodes.get(record.nodeId);
  if (!node || sha256(node.body) !== record.committedHash) throw new FolioError('LOCK_HASH_MISMATCH', 'the file no longer holds the committed text');
  assertAssetIntegrity([...gatherScope({ work, events: [], nodeId: node.id, draftText: node.body }).assets,
    ...(record.refs ?? []).filter((r) => r.kind === 'asset').map((r) => work.assets.get(r.id)).filter(Boolean)]);
  assertOrderMatches(work, record);
  const same = recheckOfRun(records, record.runId);
  if (same) {
    if (same.recheckId === record.recheckId) return { recheckId: same.recheckId, alreadyRecorded: true };
    throw new FolioError('LOCK_RUN_ALREADY_COMMITTED', `${record.runId} already recorded ${same.recheckId}`, { runId: record.runId, recheckId: same.recheckId });
  }
  assertWritingContext(work, record.nodeId);
  assertContextRefs(work, record.refs);
  const receiptLike = { ...record, draftHash: record.committedHash };
  if (record.steps.some((s) => (s.checks ?? []).some((c) => c.status === 'error'))) {
    throw new FolioError('LOCK_RECEIPT_INVALID', 'a recheck with errored checks is not complete', { problems: [{ code: 'RECHECK_INCOMPLETE' }] });
  }
  const hard = receiptVerdictFindings(receiptLike).filter((f) => f.severity === 'hard');
  if (record.hard !== hard.length) {
    throw new FolioError('LOCK_RECEIPT_INVALID', 'hard does not count the hard findings', { problems: [{ code: 'HARD_COUNT_MISMATCH' }] });
  }
  if (hard.length === 0) assertBlocksResolved(receiptLike);
  assertAppliedChecks(receiptLike);
  assertDecisionsMatch({
    records: ledgers.decisions ? await ledgers.decisions.readAll() : null,
    pipeline: { steps: pipeline.steps.filter((s) => s.kind === 'check') }, receipt: receiptLike,
  });
  await ledgers.receipts.append({ ...record, type: RECHECK_TYPE });
  return { recheckId: record.recheckId };
}
