import { abandonLegacyCommitIntents, hasRecordedReasonedSkip } from './legacy-commit-intents.js';
import { restorePreparedCommit } from './prepared-commit.js';
import { readCommitIntent } from './commit-intents.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { commitTarget } from './commit-target.js';
import { randomUUID } from 'node:crypto';
import { FolioError } from '../errors.js';

import { createRunStore, OPEN_STATES } from './run-store.js';
import { pickNext } from './next.js';
import { generateStep } from './steps/generate.js';
import { reviseStep } from './steps/revise.js';
import { checkStep } from './steps/check.js';
import { gateStep } from './steps/gate.js';
import { commitStep, staleReceipt, recordedReceipt } from './steps/commit-step.js';
import { awaitUser, outcomeFromPending, recordDecisions, receiptRecorded } from './steps/common.js';
import { dropPending, outOfSync, syncPipeline } from './sync.js';
import { pipelineFor, runMismatch } from './level-pipeline.js';
import { applyDecision } from './decide.js';
import { withWorkLock } from './work-lock.js';
import { assertChildrenDone, parkForChildren } from './children-guard.js';
import { recheckStep } from './steps/recheck-step.js';
import { RECHECK_MODE, isRecheck, newRecheckRun, pickNextRecheck, recheckSteps } from './recheck-plan.js';
import { RECOMMIT_MODE, assertRecommitNeeded, newRecommitRun } from './recommit-plan.js';
import { commitLocked, nodeTextChanged, textChangedQuestion, writesNodeBody } from './text-guard.js';
import { recheckOfRun } from '../ledger/recheck.js';
import { createTrackingBackfillDriver, isTrackingBackfill } from './tracking-backfill-run.js';
import { trackingCandidateFor } from '../tracking/extract.js';
import { MAIN, isVariantRun } from '../variants/model.js';
import { assertVariantDeclaration, assertVariantRequest, assertVariantStartable, newVariantRun, originalChanged, originalChangedQuestion, pickNextVariant, variantLocked } from './variant-plan.js';
import { assertRunFeatures, runFeatureOff } from './run-gates.js';
import { loadRunContext, openRunLedgers } from './run-context.js';
import { newRun, sameRequest } from './run-start.js';

const HANDLERS = { generate: generateStep, check: checkStep, gate: gateStep, commit: commitStep, recheck: recheckStep };
const RUN_MODES = ['normal', RECHECK_MODE, RECOMMIT_MODE, 'tracking-backfill'];
const defaultId = (prefix) => `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

/**
 * 순서를 지키는 실행기. 모델은 부르지 않고 needs_model/needs_user 를 돌려준다.
 * 상태는 .folio/runs 에만 있다. 매 호출 새 객체여도 같은 결과가 나온다.
 */
export function createRunner({ root, packs, now = () => new Date().toISOString(), newId = defaultId, hooks = {} }) {
  const runs = createRunStore(root);
  const ledgers = openRunLedgers(root, now);
  const env = { root, now, newId, hooks, ledgers, runs };
  const context = () => loadRunContext({ root, packs, ledgers });

  const backfill = createTrackingBackfillDriver({ env, context, packs });

  /** 보통 실행은 파이프라인 전체, 재검사 실행은 검사 단계만 돈다. */
  const stepsFor = (current, pipeline) => (isRecheck(current) ? recheckSteps(pipeline) : pipeline.steps);

  const ask = async (run, question) => {
    const outcome = awaitUser(run, question);
    run.updatedAt = now();
    await runs.save(run);
    return outcome;
  };

  async function drive(run) {
    for (;;) {
      const ctx = await context();
      const prepared = await restorePreparedCommit(root, run, ctx.work.tree.nodes.get(run.nodeId)?.path);
      // 다시 커밋(M4)·판본(N6): 열린 실행을 이어가는 길목마다 기능이 켜져 있는지 다시 본다(잠긴 실행만 예외, run-gates.js).
      assertRunFeatures(ctx, run);
      const pipeline = pipelineFor(ctx, run);
      const steps = stepsFor(run, pipeline);
      if (prepared) {
        run.cursor = steps.findIndex((s) => s.kind === 'commit');
        await runs.save(run);
      }
      syncPipeline({ run, ctx, steps, now, finished: isRecheck(run) && Boolean(recheckOfRun(ctx.receiptRecords, run.runId)) });
      if (!(run.state === 'committing' && receiptRecorded(ctx.receiptRecords, run))) trackingCandidateFor(ctx.work, run);
      const step = steps[run.cursor];
      if (!step) throw new FolioError('RUN_CURSOR_INVALID', `${run.runId} cursor ${run.cursor}`);
      // 노드 파일이 실행 도중 손으로 바뀌었으면 본문을 쓰는 단계(커밋·자식)에서 덮지 않는다(승인 불가, 건너뛰기만 — C0, 다시 커밋도 같다).
      // committing 상태는 영수증 기록 전후 모두 immutable intent의 정확한 바이트 검사로 보호한다.
      if (writesNodeBody(step) && run.state !== 'committing' && !commitLocked(ctx, run) && nodeTextChanged(ctx.work, run)) return ask(run, textChangedQuestion(run, step));
      // 판본(N6): 실행이 본 원본이 그 뒤 바뀌었으면(다시 커밋·손수정) 옛 원본에 맞춘 판본을 이어가지 않는다(건너뛰기만).
      if (isVariantRun(run) && !variantLocked(ctx, run) && originalChanged(ctx, run)) return ask(run, originalChangedQuestion(run, step));
      const handler = step.loop ? reviseStep : HANDLERS[step.kind];
      let outcome;
      try {
        outcome = parkForChildren(ctx, run, steps, now)
          ?? await handler({ ctx, run, step, steps, pipeline, env });
      } catch (error) {
        if (error?.code !== 'ASSET_SCOPE_MISMATCH' || (run.state === 'committing' && receiptRecorded(ctx.receiptRecords, run))) throw error;
        outcome = awaitUser(run, {
          kind: 'blocked', code: error.code, stepId: step.id, draft: run.outputs.draft ?? '',
          canApprove: false, advisories: [],
          blocking: [{ checkId: 'asset.scope', code: error.code, severity: 'hard', message: error.message }],
          hint: 'skip this run, correct the reference or asset scope, and run again; the draft is preserved in this run',
        });
      }
      run.updatedAt = now();
      await runs.save(run);
      if (outcome) return outcome;
    }
  }

  const settle = async (outcome) => (outcome.status === 'waiting_children' ? run({ node: 'next' }) : outcome);

  async function startVariant(ctx, node, variant, all) {
    const target = node === 'next' ? pickNextVariant(ctx, variant, all) : ctx.work.tree.nodes.get(node);
    if (!target) {
      if (node === 'next') return { status: 'idle' };
      throw new FolioError('NODE_NOT_FOUND', node);
    }
    assertVariantStartable(ctx, target);
    return drive(newVariantRun(ctx, target, variant, { newId, now }));
  }
  async function startRecheck(ctx, node, all) {
    const target = node === 'next-recheck' ? pickNextRecheck(ctx, all) : ctx.work.tree.nodes.get(node);
    if (!target) {
      if (node === 'next-recheck') return { status: 'idle' };
      throw new FolioError('NODE_NOT_FOUND', node);
    }
    return drive(newRecheckRun(ctx, target, { newId, now }));
  }

  /** node: id | 'next' | 'next-recheck'. mode: 'normal'(기본) | 'recheck'(커밋된 원고를 검사 단계만 다시). variant: 'main'(기본) 또는 선언된 판본(N6). */
  async function run({ node = 'next', mode = 'normal', variant = MAIN } = {}) {
    if (!RUN_MODES.includes(mode) || (node === 'next-recheck' && mode !== RECHECK_MODE) || (['recommit', 'tracking-backfill'].includes(mode) && (node === 'next' || node === 'next-recheck'))) {
      throw new FolioError('RUN_MODE_INVALID', `${mode} for ${node}`);
    }
    const all = (await runs.list()).filter((r) => !r.error);
    const open = all.find((r) => OPEN_STATES.has(r.state));
    const ctx = await context();
    if (open) {
      if (!sameRequest(open, node, mode, variant)) throw new FolioError('RUN_IN_PROGRESS', `${open.runId} for ${open.nodeId} is not finished`, { runId: open.runId });
      if (variant !== MAIN) assertVariantDeclaration(ctx, variant, mode);
      if (isTrackingBackfill(open)) return backfill.drive(open);
      // 기능이 꺼졌으면(잠긴 실행 제외) 무엇도 바꾸지 않고 거부한다 — 옛 질문을 그냥 돌려주지 않는다(그 질문으로 이어가는 것도 기능을 쓰는 것이다).
      assertRunFeatures(ctx, open);
      // 질문을 낸 뒤 설정(단계·검사·순서)이 바뀌었으면 옛 질문은 버리고 새 설정으로 다시 돈다.
      if (outOfSync(open, ctx)) dropPending(open);
      if (!outOfSync(open, ctx) && !(open.state === 'committing' && receiptRecorded(ctx.receiptRecords, open))) trackingCandidateFor(ctx.work, open);
      return outcomeFromPending(open) ?? settle(await drive(open));
    }
    if (variant !== MAIN) {
      assertVariantRequest(ctx, variant, mode);
      return settle(await startVariant(ctx, node, variant, all));
    }
    if (mode === 'tracking-backfill') return backfill.start(ctx, node);
    if (mode === RECHECK_MODE) return startRecheck(ctx, node, all);
    if (mode === RECOMMIT_MODE) {
      const target = ctx.work.tree.nodes.get(node);
      if (!target) throw new FolioError('NODE_NOT_FOUND', node);
      assertRecommitNeeded(ctx, target);
      assertChildrenDone(ctx.work, target, ctx.receiptRecords);
      return settle(await drive(newRecommitRun(ctx, target, { newId, now })));
    }
    const target = node === 'next' ? pickNext(ctx.work, ctx.receiptRecords, all) : ctx.work.tree.nodes.get(node);
    if (!target) {
      if (node === 'next') return { status: 'idle' };
      throw new FolioError('NODE_NOT_FOUND', node);
    }
    const waiting = all.find((r) => r.state === 'waiting_children' && r.nodeId === target.id);
    assertChildrenDone(ctx.work, target, ctx.receiptRecords);
    const current = waiting ?? newRun(ctx, target, { newId, now });
    current.state = 'active';
    return settle(await drive(current));
  }

  async function resume({ runId, answers = {} }) {
    const current = await runs.load(runId);
    if (isTrackingBackfill(current)) return backfill.resume({ runId, answers });
    if (current.state !== 'awaiting_model') throw new FolioError('RUN_NOT_AWAITING_MODEL', runId, { state: current.state });
    const ctx = await context();
    // 기능이 꺼졌으면 답을 받아들이지 않는다(무엇도 저장하지 않고 거부한다). awaiting_model 은 committing 일 수 없으니 잠긴 예외는 없다.
    assertRunFeatures(ctx, current);
    // 질문을 낸 뒤 설정(단계·검사·순서·팩)이 바뀌었으면 답을 받지 않는다. 옛 질문은 버리고 저장한다 — 다음 run 이 새 설정으로 다시 묻는다.
    if (outOfSync(current, ctx)) {
      dropPending(current);
      current.updatedAt = now();
      await runs.save(current);
      throw new FolioError('ANSWER_STALE', `${runId} was asked under settings that have changed`, {
        runId, hint: 'call run (folio_run) again to get the requests for the current settings',
      });
    }
    trackingCandidateFor(ctx.work, current);
    const requests = current.pending.requests;
    const missing = requests.filter((r) => !(r.requestId in answers)).map((r) => r.requestId);
    if (missing.length) throw new FolioError('ANSWERS_INCOMPLETE', missing.join(', '), { missing });
    const unknown = Object.keys(answers).filter((id) => !requests.some((r) => r.requestId === id));
    if (unknown.length) throw new FolioError('ANSWER_UNKNOWN_REQUEST', unknown.join(', '), { unknown });
    current.inbox = {};
    for (const request of requests) current.inbox[request.stepId] = { requestId: request.requestId, purpose: request.purpose, answer: answers[request.requestId] };
    current.pending = null;
    current.state = 'active';
    await runs.save(current);
    return settle(await drive(current));
  }

  async function decide({ runId, action, feedback = '', reason = '' }) {
    const current = await runs.load(runId);
    if (isTrackingBackfill(current)) return backfill.decide({ runId, action, feedback, reason });
    const ctx = await context();
    // 끝낼 수 없는 실행은 skip(단계를 돌지 않고 버리기)만 받는다. 그래야 작품이 멈추지 않는다.
    // - 실행 파일이 노드와 레벨·종류에서 어긋난 실행: 열린 상태(committing 포함) 어디서든.
    // - committing 인데 기록된 영수증이 지금 파이프라인과 어긋난 실행(커밋이 LOCK_PIPELINE_MISMATCH 로 거부됨).
    //   영수증이 아직 맞는 committing 실행은 버리지 않는다 — run 으로 커밋을 끝내야 한다.
    let preparedConflict = false;
    try { await restorePreparedCommit(root, current, ctx.work.tree.nodes.get(current.nodeId)?.path); }
    catch (error) { if (error.code !== 'COMMIT_TARGET_CONFLICT') throw error; preparedConflict = true; }
    const openNow = OPEN_STATES.has(current.state);
    const mismatch = openNow ? runMismatch(ctx, current) : null;
    const stale = !mismatch && current.state === 'committing' ? staleReceipt(ctx, current, pipelineFor(ctx, current)) : null;
    // 다시 커밋이 기능 꺼짐으로 막혔으면(잠긴 실행 제외) skip 만은 어느 열린 상태에서든 받는다 — 그래야 작품이 멈추지 않는다.
    const featureOff = openNow && runFeatureOff(ctx, current);
    let targetConflict = preparedConflict;
    const storedReceipt = recordedReceipt(ctx.receiptRecords, current);
    const intent = current.receipt ? await readCommitIntent(root, current.receipt.receiptId) : null;
    const preparedReceipt = intent?.receiptDigest === sha256(canonicalJson(current.receipt))
      && current.receipt?.runId === current.runId && current.receipt?.nodeId === current.nodeId ? current.receipt : null;
    const targetReceipt = storedReceipt ?? preparedReceipt;
    const foreignReceipt = ctx.receiptRecords.some((r) => r.type === 'receipt' && r.receiptId === current.receipt?.receiptId);
    if (current.state === 'committing' && !storedReceipt && !intent && !foreignReceipt) targetConflict = true;
    if (current.state === 'committing' && targetReceipt && ctx.work.tree.nodes.has(current.nodeId)) {
      try { await commitTarget({ root, node: ctx.work.tree.nodes.get(current.nodeId), receipt: targetReceipt, text: current.outputs.draft, recorded: Boolean(storedReceipt) }); }
      catch (error) { if (error.code !== 'COMMIT_TARGET_CONFLICT') throw error; targetConflict = true; }
    }
    const recordedSkip = action === 'skip' && await hasRecordedReasonedSkip(root, current.runId, current.nodeId, reason, feedback);
    const abandon = action === 'skip' && Boolean(mismatch || stale || featureOff || targetConflict || recordedSkip);
    if (current.state !== 'awaiting_user' && !abandon) throw new FolioError('RUN_NOT_AWAITING_USER', runId, { state: current.state });
    if (mismatch && action !== 'skip') throw mismatch;
    // 기능이 꺼졌으면(잠긴 실행 제외) skip 이 아닌 결정은 무엇도 바꾸지 않고 거부한다(승인 기록도 남기지 않는다).
    if (!abandon) assertRunFeatures(ctx, current);
    // 옛 설정에서 낸 질문에 대한 결정은 적용하지 않는다(기록도 남기지 않는다). 새 설정으로 다시 돈다.
    if (!abandon && outOfSync(current, ctx)) { dropPending(current); return settle(await drive(current)); }
    if (!abandon) trackingCandidateFor(ctx.work, current);
    const steps = abandon ? [] : stepsFor(current, pipelineFor(ctx, current));
    const { outcome: skipped, records } = applyDecision(current, steps, { action, feedback, reason }, now);
    if (!recordedSkip) await recordDecisions(env, records); // 중단된 skip은 실제 기존 결정을 재사용한다. 기록이 캐시보다 먼저다.
    if (skipped) {
      await abandonLegacyCommitIntents(root, { path: ctx.work.tree.nodes.get(current.nodeId)?.path, nodeId: current.nodeId, runId: current.runId, reason, feedback });
      await hooks['afterLegacyIntentAbandonWrite']?.();
    }
    current.updatedAt = now();
    await runs.save(current);
    return skipped ?? settle(await drive(current));
  }

  /** run/resume/decide 는 작품 단위로 한 번에 하나(같은 프로세스 대기열 + .folio/runs/.lock). */
  const serial = (fn) => (args) => withWorkLock(root, () => fn(args));
  return { run: serial(run), resume: serial(resume), decide: serial(decide) };
}
