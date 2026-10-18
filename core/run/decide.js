import { FolioError } from '../errors.js';
import { blockingFindings } from './steps/common.js';
import { sameFinding } from './commit-locks.js';
import { approvalRecord, overrideRecord } from '../ledger/decisions.js';

/** 사용자가 이유를 달아 넘긴 지적을 쌓는다(같은 checkId+code+quote 는 한 번만). 새로 쌓은 것을 돌려준다. */
function addOverrides(run, findings, reason) {
  run.overridden = run.overridden ?? [];
  const added = [];
  for (const finding of findings) {
    if (finding.severity === 'hard' || run.overridden.some((o) => sameFinding(o, finding))) continue;
    const override = { ...finding, overrideReason: reason, source: 'user' };
    run.overridden.push(override);
    added.push(override);
  }
  return added;
}

/** 이 결정이 남길 decisions 기록(approval/override). 러너가 실행 파일 저장 전에 기록장에 넣는다. */
const base = (run, stepId) => ({ runId: run.runId, nodeId: run.nodeId, stepId, draftHash: run.draftHash });

function approveBlocked(run, steps, question, why, feedback, now, records) {
  const hard = [...(question.blocking ?? []), ...blockingFindings(run)].some((f) => f?.severity === 'hard');
  // canApprove: false 와 blocking 의 severity: 'hard' 가 이미 다시 커밋 중 파일이 또 바뀐 질문(RECOMMIT_TEXT_CHANGED)의 승인도 막는다.
  if (!question.canApprove || hard) throw new FolioError('APPROVE_BLOCKED_BY_HARD', 'hard conflicts cannot be approved; revise or skip');
  if (!why) throw new FolioError('OVERRIDE_REASON_REQUIRED', 'overriding a block needs a reason');
  for (const override of addOverrides(run, question.blocking ?? [], why)) records.push(overrideRecord({ ...base(run, question.stepId), override }));
  records.push(approvalRecord({ ...base(run, question.stepId), action: 'approve', feedback, reason: why }));
  const index = steps.findIndex((s) => s.id === question.stepId);
  // 커밋·재검사 기록 단계에서 넘긴 지적은 그 단계를 다시 돌며 반영된다.
  if (steps[index]?.kind === 'commit' || steps[index]?.kind === 'recheck') { run.cursor = index; return; }
  run.results[question.stepId] = { status: 'overridden', reason: why, source: 'user' };
  run.cursor = index + 1;
  const gate = steps.slice(run.cursor).find((s) => s.kind === 'gate');
  if (gate) {
    run.approval = { stepId: gate.id, draftHash: run.draftHash, at: now(), feedback };
    records.push(approvalRecord({ ...base(run, gate.id), action: 'approve', feedback, reason: why }));
  }
}

/**
 * 사람의 결정을 실행에 반영한다. outcome: skip 이면 결과(skipped), 아니면 null(이어서 실행).
 * records: 받아들인 결정의 decisions 기록 — 실행 파일을 저장하기 전에 기록장에 넣어야 한다.
 * hard 는 어떤 경우에도 승인할 수 없고, block 을 넘기려면 이유가 필요하다.
 */
export function applyDecision(run, steps, { action, feedback = '', reason = '' }, now) {
  // 어긋난 실행을 버릴 때는 사람에게 낸 질문이 없을 수 있다(active·awaiting_model). 그때 기록의 단계는 낸 요청의 단계(없으면 null).
  const question = run.pending?.question ?? { stepId: run.pending?.requests?.[0]?.stepId ?? null };
  const why = String(reason || feedback).trim();
  const records = [];
  const decided = () => approvalRecord({ ...base(run, question.stepId), action, feedback, reason });
  if (action === 'approve') {
    if (question.kind === 'blocked' || question.kind === 'flagged') approveBlocked(run, steps, question, why, feedback, now, records);
    else {
      run.approval = { stepId: question.stepId, draftHash: run.draftHash, at: now(), feedback };
      records.push(decided());
    }
  } else if (action === 'request_revision') {
    if (!String(feedback).trim()) throw new FolioError('FEEDBACK_REQUIRED', 'a revision request needs feedback');
    // 다시 커밋 중 파일이 바뀐 질문은 건너뛰기만 받는다. 고쳐 쓰기로 넘어가면 계획·초안 단계가 비어 실행이 멈춘다.
    if (question.code === 'ASSET_SCOPE_MISMATCH') throw new FolioError('REVISION_UNAVAILABLE', 'skip this run, correct the asset scope or reference, and run again');
    if (question.code === 'RECOMMIT_TEXT_CHANGED') throw new FolioError('REVISION_UNAVAILABLE', 'the file changed during this recommit run; skip it and run recommit again');
    // 보통 실행 중 노드 파일이 손으로 바뀐 질문도 건너뛰기만 받는다 — 고쳐 써도 커밋이 그 파일을 덮게 된다(C0).
    if (question.code === 'NODE_TEXT_CHANGED') throw new FolioError('REVISION_UNAVAILABLE', 'the node file was edited during this run; skip it and run the node again');
    // 판본의 원본이 실행 도중 바뀐 질문도 건너뛰기만 받는다 — 옛 원본에 맞춘 판본을 고쳐 쓸 까닭이 없다(N6).
    if (question.code === 'VARIANT_ORIGINAL_CHANGED') throw new FolioError('REVISION_UNAVAILABLE', 'the original changed during this variant run; skip it and run the variant again');
    const revise = steps.find((s) => s.loop);
    if (!revise) throw new FolioError('REVISION_UNAVAILABLE', 'this pipeline has no revise step');
    records.push(decided());
    run.userRevision = String(feedback).trim();
    run.cursor = steps.indexOf(revise);
    run.approval = null;
  } else if (action === 'skip') {
    if (!String(reason).trim()) throw new FolioError('SKIP_REASON_REQUIRED', 'skipping needs a reason');
    records.push(decided());
    run.state = 'abandoned';
    run.pending = null;
    run.issued = {};
    run.inbox = {};
    run.history.push({ at: now(), event: 'skipped', reason: String(reason).trim() });
    return { outcome: { status: 'skipped', runId: run.runId, nodeId: run.nodeId, reason: String(reason).trim() }, records };
  } else {
    throw new FolioError('ACTION_INVALID', String(action));
  }
  run.pending = null;
  run.state = 'active';
  return { outcome: null, records };
}
