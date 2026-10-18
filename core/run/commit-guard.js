import { assertWritingContext } from '../work/context.js';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { runDeterministicChecks } from '../checks/run-checks.js';
import { userOverrideCovers } from './commit-locks.js';
import { scopeFor } from './payload.js';
import { checkContext } from './steps/check.js';
import { assertAssetIntegrity } from '../assets/records.js';
import { trackingBatchFor } from '../tracking/commit.js';
import { sameTracking } from '../tracking/batch-schema.js';
import { trackingCandidateFor } from '../tracking/extract.js';

/**
 * 커밋 직전 실행 파일 점검(최소한). 원고·hash·추출 사건이 서로 맞는지 보고,
 * 결정론 검사를 지금 원고로 다시 돌려 hard 나 넘기지 않은 block 이 있으면 거부한다.
 *
 * 실행 파일(.folio/runs)의 검사 결과·승인·넘김은 여기서 믿지 않는다. 엔진이 판정한 순간
 * decisions 기록장(해시 사슬, 추가만 됨)에 남긴 기록과 commitNode 가 영수증을 대조한다
 * (commit-locks.js assertDecisionsMatch → LOCK_DECISION_MISMATCH). 실행 파일만 고친 위조·지적 삭제·원고 바꿔치기는 거기서 걸린다.
 */
export function assertCommitReady({ ctx, run, steps, receipt = null }) {
  const text = run.outputs.draft;
  const mismatch = (what) => new FolioError('LOCK_HASH_MISMATCH', `${what} does not match the checked draft`, { runId: run.runId });
  if (typeof text !== 'string' || sha256(text) !== run.draftHash) throw mismatch('the draft in the run file');
  if (run.outputs.events && run.outputs.events.draftHash !== run.draftHash) throw mismatch('the extracted events');
  if (receipt && receipt.draftHash !== run.draftHash) throw mismatch('the receipt');
  const candidate = trackingCandidateFor(ctx.work, run);
  if (receipt) {
    const expected = candidate ? trackingBatchFor({ ...run, trackingBasePlanVersion: ctx.work.tracking.plan.version, trackingBaseTrackingSeq: ctx.work.tracking.records.at(-1)?.seq ?? 0 }, receipt.receiptId) : null;
    if (!sameTracking(receipt.trackingBatch ?? null, expected)) throw new FolioError('LOCK_TRACKING_INTEGRITY', 'receipt does not bind the checked tracking candidate');
    return;
  }
  assertWritingContext(ctx.work, run.nodeId);
  assertAssetIntegrity(scopeFor(ctx, run).assets);
  const checkCtx = checkContext(ctx, run, scopeFor(ctx, run));
  const findings = steps.filter((s) => s.kind === 'check' && s.tier === 'deterministic' && s.mode !== 'off')
    .flatMap((s) => runDeterministicChecks(ctx.checks.filter((c) => c.stage === (s.stage ?? s.id)), checkCtx))
    .flatMap((result) => result.findings);
  const hard = findings.filter((f) => f.severity === 'hard');
  if (hard.length) throw new FolioError('LOCK_HARD_VIOLATION', 'the final re-check found hard conflicts', { findings: hard });
  const block = findings.filter((f) => f.severity === 'block' && !userOverrideCovers(run.overridden, f));
  if (block.length) throw new FolioError('LOCK_BLOCK_UNRESOLVED', 'the final re-check found block findings nobody overrode', { findings: block });
}
