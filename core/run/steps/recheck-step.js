import { contextFindings } from '../../work/context.js';
import { canonicalJson, sha256 } from '../../util/hash.js';
import { appliedFromEntries } from '../../checks/applied.js';
import { checkStepEntry } from '../../ledger/decisions.js';
import { isBlocking } from '../../ledger/receipts.js';
import { recheckOfRun } from '../../ledger/recheck.js';
import { recordRecheck } from '../recheck-commit.js';
import { nodeOrder, receiptFeatures } from '../../scope/stale-checks.js';
import { scopeFor } from '../payload.js';
import { isLockError } from '../refuse.js';
import { awaitUser, advisoriesOf, invalidateFrom, unresolvedBlocking, MAX_ANSWER_TRIES } from './common.js';

const hardOf = (findings) => findings.filter((f) => f.severity === 'hard');

function flaggedOutcome(run, step, record) {
  const blocking = record.steps.flatMap((s) => (s.checks ?? []).flatMap((c) => c.findings ?? [])).filter(isBlocking);
  const question = { kind: 'flagged', stepId: step.id, draft: run.outputs.draft ?? '', blocking, advisories: record.advisories, canApprove: false };
  run.state = 'flagged';
  run.pending = null;
  run.flagged = question;
  return { status: 'needs_user', runId: run.runId, nodeId: run.nodeId, question };
}

/** 기록장에 남은 재검사 기록으로 실행을 끝낸다(크래시 뒤 재개에도 같은 결과). */
function finish(run, step, record) {
  if (record.hard > 0) return flaggedOutcome(run, step, record);
  run.state = 'done';
  run.pending = null;
  return { status: 'done', runId: run.runId, nodeId: run.nodeId, mode: 'recheck', recheckId: record.recheckId };
}

function buildRecord({ ctx, run, steps, pipeline, refs, newId }) {
  const entries = steps.filter((s) => s.kind === 'check').map((s) => checkStepEntry(s.id, run.results[s.id]));
  const findings = entries.flatMap((e) => (e.checks ?? []).flatMap((c) => c.findings ?? []));
  return {
    recheckId: newId('rchk'), runId: run.runId, nodeId: run.nodeId, variant: run.variant, level: ctx.work.tree.nodes.get(run.nodeId).level,
    receiptId: run.receiptId, committedHash: run.draftHash, pipelineDigest: pipeline.digest, appliedChecks: appliedFromEntries(ctx.checks, pipeline, entries),
    order: nodeOrder(ctx.work, run.nodeId), features: receiptFeatures(ctx.work, run.nodeId),
    steps: entries, refs, hard: hardOf(findings).length, advisories: findings.filter((f) => !isBlocking(f)), overridden: run.overridden ?? [],
  };
}

/**
 * 재검사의 마지막 단계. 원고는 절대 바꾸지 않는다.
 * - 원고가 커밋된 그대로가 아니면(손수정) 실행을 버린다.
 * - 범위(refs)가 검사 뒤에 바뀌었으면 검사부터 다시. error 결과가 남아 있으면 다시 묻는다(incomplete).
 * - hard 지적: 기록하고 flagged 로 끝낸다(승인 불가, 열린 실행으로 남지 않음). block 지적: 사용자가 이유와 함께 넘겨야 기록한다.
 * - 잠금이 기록을 거부하면 검사부터 다시 돌리도록 되돌리고 오류를 알린다.
 */
/**
 * 결과가 error 인 검사가 있으면 재검사는 끝난 것이 아니다. 모델 검사는 세 번까지 다시 묻고,
 * 그래도 안 되면(또는 결정론 검사가 죽으면) 기록하지 않고 사람에게 넘긴다(승인 불가, 건너뛰기만).
 */
function incomplete(run, steps, step) {
  const errored = steps.find((s) => s.kind === 'check' && (run.results[s.id]?.checks ?? []).some((c) => c.status === 'error'));
  if (!errored) return undefined;
  run.retries = run.retries ?? {};
  const tries = (run.retries[errored.id] ?? 0) + 1;
  run.retries[errored.id] = tries;
  if (errored.tier === 'model' && tries < MAX_ANSWER_TRIES) {
    delete run.results[errored.id];
    run.cursor = steps.indexOf(errored);
    return null;
  }
  const failed = (run.results[errored.id].checks ?? []).filter((c) => c.status === 'error');
  return awaitUser(run, {
    kind: 'blocked', code: 'RECHECK_INCOMPLETE', stepId: step.id, draft: run.outputs.draft ?? '', advisories: [], canApprove: false,
    blocking: failed.map((c) => ({ checkId: c.checkId, severity: 'hard', code: 'RECHECK_INCOMPLETE', message: `${c.checkId} gave no result after ${tries} tries` })),
  });
}

export async function recheckStep({ ctx, run, step, steps, pipeline, env }) {
  const existing = recheckOfRun(ctx.receiptRecords, run.runId);
  if (existing) return finish(run, step, existing);
  const node = ctx.work.tree.nodes.get(run.nodeId);
  if (!node || sha256(node.body) !== run.draftHash) {
    run.state = 'abandoned';
    run.pending = null;
    run.history.push({ at: env.now(), event: 'recheck_text_changed' });
    return { status: 'skipped', runId: run.runId, nodeId: run.nodeId, reason: 'RECHECK_TEXT_DRIFTED' };
  }
  const scope = scopeFor(ctx, run);
  const checkSteps = steps.filter((s) => s.kind === 'check');
  if (checkSteps.some((s) => canonicalJson(run.results[s.id]?.refs ?? null) !== canonicalJson(scope.refs))) {
    invalidateFrom(run, steps, 0);
    run.cursor = 0;
    run.history.push({ at: env.now(), event: 'refs_changed' });
    return null;
  }
  const unfinished = incomplete(run, steps, step);
  if (unfinished !== undefined) return unfinished;
  const open = unresolvedBlocking(run);
  if (open.length && !hardOf(open).length) {
    return awaitUser(run, { kind: 'flagged', stepId: step.id, draft: run.outputs.draft ?? '', blocking: open, advisories: advisoriesOf(run), canApprove: true });
  }
  const contextIssues = contextFindings(ctx.work, run.nodeId);
  if (contextIssues.length) return awaitUser(run, { kind: 'blocked', stepId: step.id, draft: run.outputs.draft ?? '', blocking: contextIssues, advisories: [], canApprove: false });
  const record = buildRecord({ ctx, run, steps, pipeline, refs: scope.refs, newId: env.newId });
  try {
    await recordRecheck({ work: ctx.work, ledgers: env.ledgers, pipeline, record });
  } catch (error) {
    if (!isLockError(error)) throw error;
    invalidateFrom(run, steps, 0);
    run.cursor = 0;
    run.state = 'active';
    run.history.push({ at: env.now(), event: 'recheck_refused', code: error.code });
    run.updatedAt = env.now();
    await env.runs.save(run);
    throw error;
  }
  return finish(run, step, record);
}
