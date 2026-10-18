import { FolioError } from '../../errors.js';
import { sha256 } from '../../util/hash.js';
import { validateItems } from '../../occurrences/validate.js';
import { validateClaims } from '../../evidence/validate.js';
import { parseJsonAnswer } from '../answers.js';
import { packRequest, rawPackPayload } from '../payload.js';
import { awaitUser, skip, requestModel, takeAnswer, retryOrGiveUp, MAX_ANSWER_TRIES } from './common.js';
import { childrenStep } from './children.js';
import { extractTracking, trackingEffective } from '../../tracking/extract.js';
import { virtualTrackingWork } from '../../tracking/candidates.js';
import { isRecheck } from '../recheck-plan.js';
import { isRecommit, recommitTextChangedQuestion } from '../recommit-plan.js';

export const MAX_EXTRACT_TRIES = MAX_ANSWER_TRIES;

/** 원고가 바뀌면 이전 원고에 준 사용자 결정(넘김)과 재요청 횟수는 더 이상 유효하지 않다. */
export function setDraft(run, text) {
  const hash = sha256(text);
  if (hash !== run.draftHash) { run.overridden = []; run.retries = {}; delete run.outputs.tracking; }
  run.outputs.draft = text;
  run.draftHash = hash;
}

/**
 * wantOccurrences 는 이 요청이 등장 위치를 물었는지(기능 켜짐 + 보통 실행)다 — 재검사는 항상 false.
 * wantClaims 는 주장(N2 claims)을 물었는지다(evidenceInExtract + 보통 실행 + sources 팩 있음). 묻지 않았으면 답에 섞여 와도 읽지 않는다.
 */
function parseEvents(answer, work, draft, wantOccurrences, wantClaims, run, wantTracking) {
  let data;
  try { data = parseJsonAnswer(answer); } catch { return { error: 'EVENTS_JSON_INVALID' }; }
  if (!data || (data.events !== undefined && !Array.isArray(data.events))) return { error: 'EVENTS_SHAPE_INVALID' };
  let candidate = null;
  if (wantTracking) {
    try { candidate = extractTracking(work, run, data); work = virtualTrackingWork(work, candidate); }
    catch (error) { return { error: error.code ?? 'TRACKING_INPUT_INVALID' }; }
  }
  const events = [];
  for (const event of data.events ?? []) {
    if (!work.entities.has(event?.entityId) || typeof event?.kind !== 'string' || !event.kind) return { error: `EVENT_INVALID:${event?.entityId ?? '?'}` };
    if (event.quote !== undefined && (typeof event.quote !== 'string' || !draft.includes(event.quote))) return { error: `EVENT_QUOTE_NOT_IN_DRAFT:${event.entityId}` };
    events.push({ entityId: event.entityId, kind: event.kind, ...(event.data !== undefined ? { data: event.data } : {}), ...(event.quote ? { quote: event.quote } : {}) });
  }
  const ids = (list) => (Array.isArray(list) ? list.filter((id) => work.entities.has(id)) : []);
  const value = { events, appearances: ids(data.appearances), mentions: ids(data.mentions), occurrences: [], submittedOccurrences: false };
  // 등장 위치(M4): 요청이 물었을 때만(기능 켜짐 + 보통 실행) 답의 occurrences 를 원고와 대조한다.
  // 재검사(wantOccurrences=false)는 답에 occurrences 가 섞여 있어도 읽지 않는다(Ruling B3-3) — 옛 호스트·공격 모두 같은 취급.
  if (wantOccurrences && data.occurrences !== undefined) {
    const checked = validateItems(work, draft, data.occurrences);
    if (checked.errors.length) {
      const first = checked.errors[0];
      return { error: `${first.code}:${first.index ?? '-'}` };
    }
    value.occurrences = checked.items;
    value.submittedOccurrences = true;
    const add = (list, kind) => [...new Set([...list, ...checked.items.filter((i) => i.kind === kind).map((i) => i.entityId)])];
    value.appearances = add(value.appearances, 'appearance');
    value.mentions = add(value.mentions, 'mention');
  }
  // 근거 연결(N2): 주장 하나라도 원고·자료와 안 맞으면 답 전체를 다시 묻는다(등장 위치와 같은 규칙). 주장이 없으면 키도 없다.
  if (wantClaims && data.claims !== undefined) {
    const checked = validateClaims(work, draft, data.claims);
    if (checked.errors.length) {
      const first = checked.errors[0];
      return { error: `${first.code}:${first.index ?? '-'}` };
    }
    Object.assign(value, { claims: checked.claims, submittedClaims: true });
  }
  return { value, candidate };
}

export async function generateStep({ ctx, run, step, env }) {
  const done = run.results[step.id]?.status;
  if (done === 'passed' || done === 'skipped') { run.cursor += 1; return null; }
  if (step.mode === 'off') return skip(run, step);
  if (step.produces === 'children') return childrenStep({ ctx, run, step, env });
  // 다시 커밋(M4): 원고(가지는 계획)는 모델에 묻지 않고 실행이 잡아 둔 파일 본문(outputs.draft)을 그대로 쓴다. 수정 루프(loop)는 보통대로 모델에 묻는다.
  // 조용히 새 본문으로 바꿔 채우지 않는다: 지금 파일 본문을 다시 읽어 outputs.draft 와 다르면(그 사이 또 손을 댐) 여기서 멈춘다(승인 불가, 건너뛰기만).
  if (isRecommit(run) && !step.loop && (step.produces === 'plan' || step.produces === 'draft')) {
    const node = ctx.work.tree.nodes.get(run.nodeId);
    if (!node || node.body !== (run.outputs.draft ?? '')) return awaitUser(run, recommitTextChangedQuestion(run, step));
    run.results[step.id] = { status: 'passed', source: 'file' };
    run.cursor += 1;
    return null;
  }
  // 재검사는 검사만 다시 돈다 — 등장 위치를 새로 묻지도, 답에 섞여 와도 읽지도 않는다(Ruling B3-3).
  const asks = step.produces === 'events' && !isRecheck(run) && run.mode !== 'tracking-backfill';
  if (asks && (trackingEffective(ctx.work) || run.outputs.tracking)) { delete run.outputs.tracking; delete run.outputs.events; }
  const wantOccurrences = asks && Boolean(ctx.work.config.features.occurrencesInExtract);
  // 근거 연결(N2): evidenceInExtract(부모 evidence 가 꺼지면 저절로 꺼짐)가 켜지고, 이 작품이 sources 팩을 쓸 때만
  // 보통 실행의 추출 요청이 주장을 묻는다 — sources 팩이 없으면(예: 소설) 주장을 볼 검사가 없으니 묻지 않는다.
  const wantClaims = asks && Boolean(ctx.work.config.features.evidenceInExtract) && ctx.work.config.packs.includes('sources');
  const sourceVersions = wantClaims ? [...ctx.work.sources.values()].map(({ id, rev, contentHash }) => ({ id, rev, contentHash })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : null;
  const wanted = step.produces === 'events' ? { occurrences: { wanted: wantOccurrences }, evidence: { wanted: wantClaims }, ...(sourceVersions ? { sourceVersions } : {}) } : {};
  const request = (extra) => requestModel(run, env, [{ stepId: step.id, purpose: 'generate', produces: step.produces, ...packRequest(ctx, run, step, { ...wanted, ...extra }) }]);
  const entry = takeAnswer(run, step.id, rawPackPayload(ctx, run, step, wanted));
  if (entry === undefined) return request();
  const text = typeof entry.answer === 'string' ? entry.answer : JSON.stringify(entry.answer);
  if (step.produces === 'plan') {
    run.outputs.plan = text;
    if (run.nodeKind === 'branch') setDraft(run, text);
  } else if (step.produces === 'draft') {
    setDraft(run, text);
  } else if (step.produces === 'events') {
    const parsed = parseEvents(entry.answer, ctx.work, run.outputs.draft ?? '', wantOccurrences, wantClaims, run, (asks || run.mode === 'tracking-backfill') && trackingEffective(ctx.work));
    if (!parsed.error && run.mode === 'tracking-backfill' && [...ctx.work.tracking.plan.criteria, ...(parsed.candidate?.criteria ?? [])].some((c) => (c.appliesTo === 'all' || c.appliesTo.includes(run.nodeId)) && !parsed.candidate?.checked.includes(c.id))) parsed.error = 'TRACKING_CHECKED_MISSING';
    if (parsed.error) return retryOrGiveUp(run, step, parsed.error, request, 'EXTRACT_FAILED');
    if (run.retries) delete run.retries[step.id];
    run.outputs.events = { ...parsed.value, draftHash: run.draftHash };
    if (parsed.candidate) run.outputs.tracking = parsed.candidate;
    else delete run.outputs.tracking;
  } else {
    throw new FolioError('STEP_PRODUCES_UNKNOWN', `${step.id}: ${step.produces}`);
  }
  run.results[step.id] = { status: 'passed' };
  run.cursor += 1;
  return null;
}
