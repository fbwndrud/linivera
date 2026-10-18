import { contextPayload, contextRefs } from '../work/context.js';
import { FolioError } from '../errors.js';
import { variantLabel, variantOf } from './model.js';
import { originalOf, variantTextOf } from './original.js';

/** 판본 종류별 원고 요청 안내(호스트가 모델에 줄 글). 코어가 정한다 — 첫 팩의 프롬프트(소설 초안 등)는 판본 요청에 입히지 않는다. */
const INSTRUCTIONS = Object.freeze({
  translation: '원본(original)을 lang 언어로 옮긴다. 문단 순서와 문단 수를 지키고, 내용을 빼거나 더하지 않는다. terms 의 대응을 따른다. 블록 표시({#id}, [[block:id]], [^id], [[source:id]])와 숫자는 그대로 둔다. current 가 있으면 그 판본 글을 원본에 맞게 고친다. 판본 본문만 답한다.',
  revision: '원본(original)을 개정판으로 고쳐 쓴다. 사실과 블록 표시({#id}, [[block:id]], [^id], [[source:id]])는 지키고, 바꾼 이유가 없는 내용은 빼지 않는다. current 가 있으면 그것에서 시작한다. 개정판 본문만 답한다.',
  summary: '원본(original)을 줄여 쓴다. 원본에 없는 사실·숫자를 더하지 않는다. terms 의 대응을 따른다. current 가 있으면 그것에서 시작한다. 요약 본문만 답한다.',
});

const specOf = (ctx, run) => {
  const variant = variantOf(run);
  const specs = ctx.work.config.variantSpecs ?? {};
  const spec = typeof variant === 'string' && Object.hasOwn(specs, variant) ? specs[variant] : undefined;
  if (!spec) {
    const label = variantLabel(variant);
    throw new FolioError('VARIANT_UNKNOWN', `variant ${label} is not declared in work.yaml`, { variant: label });
  }
  return spec;
};

/** 원본 본문. 원본이 커밋 그대로가 아니면 짐작하지 않는다(러너가 그 전에 VARIANT_ORIGINAL_CHANGED 로 멈춘다). */
function originalText(ctx, run) {
  const found = originalOf(ctx, run.nodeId);
  if (found.error) throw new FolioError(found.error, `${run.nodeId}: the original is not its committed text`, { nodeId: run.nodeId });
  return found;
}

/**
 * 판본 실행의 범위. 앞 사건·엔티티·윗계획은 모으지 않는다(판본은 원본의 사실을 바꾸지 않는다).
 * 참고 버전(refs)은 원본 커밋 원고(original)와 이 판본의 용어 대응표(terms, 없으면 rev null) — 둘 중 하나가 바뀌면 판본이 "다시 확인 필요"다.
 * 검사 ctx 에는 original(원본 글)·variant(선언)·terms(대응 쌍)·current(지금 판본 파일 글)가 더 간다.
 */
export function variantScope(ctx, run) {
  const spec = specOf(ctx, run);
  const found = originalText(ctx, run);
  const position = ctx.work.positions.get(run.nodeId);
  const terms = ctx.work.variants?.get(spec.id)?.terms ?? { rev: null, pairs: [] };
  return {
    nodeId: run.nodeId, ordered: Boolean(position?.ordered), unorderedBy: position?.unorderedBy ?? null,
    ambiguousReferences: [], appearances: [], entityIds: [], prerequisiteIds: [], priorEvents: [], linkedNodeIds: [], linkedEvents: [], upperPlans: [],
    parentPlan: null, upperMentions: [], assets: [], sources: [], claims: [],
    refs: [{ kind: 'original', id: run.nodeId, rev: found.original.committedHash }, { kind: 'terms', id: spec.id, rev: terms.rev }, ...contextRefs(ctx.work)],
    original: found.text, variant: { id: spec.id, kind: spec.kind, lang: spec.lang }, terms: terms.pairs,
    current: variantTextOf(ctx.work, spec.id, run.nodeId)?.body ?? null,
  };
}

/**
 * 판본 실행의 모델 요청 재료. 원본 글·판본 선언·용어 대응표·지금 판본 글을 싣는다.
 * @param {any} ctx
 * @param {any} run
 * @param {any} step
 * @param {any} [scope] variantScope 결과
 */
export function variantPayload(ctx, run, step, scope = variantScope(ctx, run)) {
  const node = ctx.work.tree.nodes.get(run.nodeId);
  return {
    ...contextPayload(ctx.work),
    step: step.id, produces: step.produces ?? null, prompt: step.prompt ?? null, mode: run.mode,
    node: { id: node.id, level: node.level, kind: node.kind, role: node.role, title: node.title, brief: node.data.brief ?? null },
    variant: scope.variant, original: scope.original, terms: scope.terms, current: scope.current,
    draft: run.outputs.draft ?? null,
    ...(step.kind === 'generate' ? { instructions: INSTRUCTIONS[scope.variant.kind] } : {}),
  };
}
