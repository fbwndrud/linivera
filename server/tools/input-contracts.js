import { RESOURCE_ARGUMENTS } from './resource-contracts.js';
/**
 * 작업 종류마다 필요한 인자와 받을 수 없는 인자를 JSON Schema로 표현한다.
 * @param {string} key
 * @param {Record<string, any>} properties
 * @param {Record<string, { required?: string[], allowed: string[] }>} operations
 * @returns {any[]}
 */
export function operationRules(key, properties, operations) {
  return Object.entries(operations).map(([value, { required = [], allowed }]) => ({
    if: { properties: { [key]: { const: value } }, required: [key] },
    then: {
      required,
      properties: Object.fromEntries(Object.keys(properties).filter((name) => !allowed.includes(name) && name !== key).map((name) => [name, false])),
    },
  }));
}

const when = (key, value, then) => ({ if: { properties: { [key]: { const: value } }, required: [key] }, then });
const nonblank = { type: 'string', minLength: 1, pattern: '\\S' };
const decisions = [
  when('action', 'request_revision', { required: ['feedback'], properties: { feedback: nonblank } }),
  when('action', 'skip', { required: ['reason'], properties: { reason: nonblank } }),
];

export const OPERATION_ARGUMENTS = {
  ...RESOURCE_ARGUMENTS,
  folio_lore: {
    get: { allowed: ['revision', 'proposalId'] }, history: { allowed: [] },
    propose: { required: ['expectedRev', 'snapshot'], allowed: ['expectedRev', 'snapshot'] },
    decide: { required: ['expectedRev', 'proposalId', 'action', 'decision'], allowed: ['expectedRev', 'proposalId', 'action', 'decision'] },
  },
  folio_interview: {
    get: { allowed: ['revision'] }, history: { allowed: [] },
    context: { required: ['expectedRev', 'brief'], allowed: ['expectedRev', 'brief'] },
    answer: { required: ['expectedRev', 'answers'], allowed: ['expectedRev', 'answers'] },
    confirm: { required: ['expectedRev', 'fields', 'confirmation'], allowed: ['expectedRev', 'fields', 'confirmation'] },
  },
  folio_structure: {
    add: { required: ['level', 'id'], allowed: ['level', 'id', 'parentId', 'title', 'brief', 'index'] },
    move: { required: ['nodeId'], allowed: ['nodeId', 'parentId', 'index'] },
    wrap: { required: ['nodeIds', 'level', 'id'], allowed: ['nodeIds', 'level', 'id', 'title'] },
  },
  folio_occurrences: {
    submit: { required: ['surface', 'items'], allowed: ['surface', 'items'] },
    rename: { required: ['entityId', 'newName', 'planDigest'], allowed: ['entityId', 'newName', 'keepOldName', 'include', 'exclude', 'planDigest'] },
  },
  folio_sources: {
    add: { required: ['id'], allowed: ['id', 'title', 'date', 'reliability', 'spans', 'text', 'path'] },
    list: { required: [], allowed: [] }, get: { required: ['id'], allowed: ['id'] },
    link: { required: ['nodeId', 'claims'], allowed: ['nodeId', 'claims'] },
  },
  folio_image: {
    start: { required: ['assetId'], allowed: ['assetId', 'nodeId'] },
    resume: { required: ['runId'], allowed: ['runId', 'answers'] },
    decide: { required: ['runId', 'action'], allowed: ['runId', 'action', 'feedback', 'reason'] },
    pending: { required: [], allowed: [] },
  },
};

/** 상태·파일 내용에 의존하는 조건(예: hard 차단)은 여전히 코어가 검증한다. */
export function inputConditions(name, properties) {
  const rules = OPERATION_ARGUMENTS[name] ? operationRules('op', properties, OPERATION_ARGUMENTS[name]) : [];
  if (name === 'folio_assets') rules.push(when('op', 'put', { oneOf: [{ required: ['path'] }, { required: ['uri'] }] }));
  if (name === 'folio_tracking') rules.push(when('op', 'propose', { oneOf: [{ required: ['plan'] }, { required: ['changes'] }] }));
  if (name === 'folio_resources') rules.push(when('op', 'propose', { oneOf: [{ required: ['owned'] }, { required: ['external'] }] }));
  if (name === 'folio_sources') rules.push(when('op', 'add', { oneOf: [{ required: ['text'] }, { required: ['path'] }] }));
  if (name === 'folio_find') rules.push(when('query', 'rename', { required: ['newName'] }));
  if (name === 'folio_decide') rules.push(...decisions);
  if (name === 'folio_image') rules.push(when('op', 'decide', { allOf: decisions }));
  if (name === 'folio_export') rules.push({
    if: { not: { properties: { op: { const: 'check' } }, required: ['op'] } }, then: { required: ['output'] },
  });
  if (name === 'folio_run') rules.push(
    when('node', 'next-recheck', { required: ['mode'], properties: { mode: { const: 'recheck' } } }),
    when('mode', 'recommit', { required: ['node'], properties: { node: { not: { enum: ['next', 'next-recheck'] } } } }),
    when('mode', 'tracking-backfill', { required: ['node'], properties: { node: { not: { enum: ['next', 'next-recheck'] } } } }),
    when('mode', 'recheck', { required: ['node'] }),
    { if: { properties: { variant: { not: { const: 'main' } } }, required: ['variant'] }, then: { properties: { mode: { const: 'normal' } } } },
  );
  return rules.length ? { allOf: rules } : {};
}
