import { contextPayload } from '../work/context.js';
import { levelIndex } from '../work/config.js';
import { gatherScope } from '../scope/scope.js';
import { claimsFor } from '../evidence/scope.js';
import { assetView } from '../assets/records.js';
import { trackingEffective, trackingWorkFor } from '../tracking/extract.js';
import { trackingEntityIds, trackingPayload, trackingRefs } from '../tracking/payload.js';
import { isVariantRun } from '../variants/model.js';
import { variantPayload, variantScope } from '../variants/payload.js';

/**
 * 이 실행의 범위. 주장(N2 claims)은 추출 답, 또는 원고가 파일 본문과 같을 때 근거 기록장에서 온다(core/evidence/scope.js).
 * 판본 실행(N6)은 원본 커밋 원고와 용어 대응표만 본다(core/variants/payload.js).
 */
export function scopeFor(ctx, run) {
  if (isVariantRun(run)) return variantScope(ctx, run);
  const draftText = run.outputs.draft ?? '';
  const extracted = run.outputs.events ?? null;
  const work = trackingWorkFor(ctx.work, run);
  const gather = (input) => gatherScope({
    work, events: ctx.events, receiptRecords: ctx.receiptRecords ?? [], nodeId: run.nodeId, draftText,
    extracted: input, marks: ctx.marks ?? null,
    claims: claimsFor({ work: ctx.work, records: ctx.evidenceRecords ?? null, nodeId: run.nodeId, draft: draftText, extracted }),
    scopeFields: ctx.registry?.scopeFields ?? [],
  });
  let scope = gather(extracted);
  for (;;) {
    const ids = trackingEntityIds(work, work.tree.nodes.get(run.nodeId), scope.entityIds);
    if (ids.every((id) => scope.entityIds.includes(id))) break;
    scope = gather({ ...extracted, mentions: [...scope.entityIds, ...ids] });
  }
  scope.refs.push(...trackingRefs(ctx.work, run, work.tree.nodes.get(run.nodeId), scope.entityIds));
  return scope;
}

/** 요청에 싣는 자료 설명(N2 §4). 원본 글은 싣지 않는다 — 호스트가 필요하면 folio_sources get 으로 읽는다. */
const sourceView = ({ id, title, date, reliability, spans, rev, contentHash }) => ({
  id, title, date, reliability, rev, contentHash, spans: spans.map((span) => ({ id: span?.id ?? null, quote: span?.quote ?? null })),
});

const eventView = ({ eventId, nodeId, entityId, kind, data }) => ({ eventId, nodeId, entityId, kind, data: data ?? null });

/** 호스트에 넘기는 공통 재료. 검토 결과(advisory)는 넣지 않는다 — 참고 의견은 자동 수정 사유가 아니다. */
export function basePayload(ctx, run, step, scope = scopeFor(ctx, run)) {
  if (isVariantRun(run)) return variantPayload(ctx, run, step, scope);
  const work = trackingWorkFor(ctx.work, run);
  const node = work.tree.nodes.get(run.nodeId);
  const index = levelIndex(work.config, node.level);
  const next = work.config.levels[index + 1] ?? null;
  const tracking = run.mode === 'recheck' && step.produces === 'events' ? null : trackingPayload(ctx.work, run, node, scope.entityIds);
  return {
    ...(tracking ? { tracking } : {}),
    ...contextPayload(work),
    ...(run.mode === 'tracking-backfill' ? { feedback: run.userRevision ?? null } : {}),
    step: step.id, produces: step.produces ?? null, prompt: step.prompt ?? null, mode: run.mode,
    node: { id: node.id, level: node.level, kind: node.kind, role: node.role, title: node.title, brief: node.data.brief ?? null, ...(run.mode === 'tracking-backfill' ? { body: node.body } : {}) },
    plan: run.outputs.plan ?? null,
    draft: run.outputs.draft ?? null,
    upperPlans: scope.upperPlans.map(({ nodeId, level, text }) => ({ nodeId, level, text })),
    entities: scope.entityIds.map((id) => {
      const entity = work.entities.get(id);
      return { id, kind: entity.kind, name: entity.name, aliases: entity.aliases, body: entity.body, ...(trackingEffective(ctx.work) ? { data: entity.data } : {}) };
    }),
    ambiguousReferences: scope.ambiguousReferences ?? [],
    priorEvents: scope.priorEvents.map(eventView),
    ...branchPayload(scope),
    // 순서 없는 노드(N4)의 연결된 노드 사건. 있을 때만 싣는다 — 없는 노드의 요청(과 그 digest)은 N4 전과 같다.
    ...(scope.linkedEvents.length ? { linkedEvents: scope.linkedEvents.map(eventView) } : {}),
    sources: work.config.features.sources ? scope.sources.map(sourceView) : [],
    assets: scope.assets.map(assetView),
    children: node.children.map((id) => {
      const child = work.tree.nodes.get(id);
      return { id, title: child.title, status: child.status, body: child.body };
    }),
    childLevel: next ? { name: next.name, leaf: next.leaf, range: work.config.levels[index].children } : null,
  };
}

/** 팩 prompt() 를 입히기 전 재료. 요청 digest(답을 요청에 묶는 값)는 이것으로 만든다 — prompt() 가 재요청 사유를 글에 넣어도 흔들리지 않는다. */
export const rawPackPayload = (ctx, run, step, extra = {}) => ({ ...basePayload(ctx, run, step), ...extra });

/** 호스트에 보낼 모양: 첫 팩의 prompt() 를 입힌다. 판본 실행은 입히지 않는다(코어 안내 instructions 를 이미 싣는다). */
const dressPayload = (ctx, run, step, raw) => (!isVariantRun(run) && ctx.registry.primary.prompt ? ctx.registry.primary.prompt(step, raw) : raw);

/**
 * 모델 요청 한 건의 재료. payload 는 호스트에 보낼 것(팩 prompt() 를 입힘), digestPayload 는 digest 재료(입히기 전).
 * requestModel 에 그대로 펼쳐 넘긴다. digestPayload 는 호스트에 보내지 않는다.
 */
export function packRequest(ctx, run, step, extra = {}) {
  const raw = rawPackPayload(ctx, run, step, extra);
  return { payload: dressPayload(ctx, run, step, raw), digestPayload: raw };
}

/** 분기 전용 자료는 판본 범위에 없으므로 있을 때만 공개한다. */
function branchPayload(scope) {
  return {
    ...(scope.branching?.applicable ? { branching: { ...scope.branching, paths: scope.branching.paths.map((p) => ({ ...p, events: p.events.map(eventView) })) } } : {}),
    ...(scope.branchGraph ? { branchGraph: scope.branchGraph } : {}),
  };
}
