import { MAX_QUOTE, resolveQuote } from '../occurrences/anchor.js';
import { MAX_CLAIMS, MAX_LINKS } from './records.js';
import { bindSource, verifySourceLink } from './binding.js';
import { checkSourceQuote } from './source-quote.js';

import { isPlainObject } from '../util/plain.js';
const clip = (value) => String(value).slice(0, 100);

/**
 * 주장 목록을 본문·자료와 대조한다(N2 설계 §1·§2). 하나라도 틀리면 호출자가 전부 거부한다(errors 가 비어야 쓴다).
 * - 주장 인용: 다듬은 길이 2 이상, 500자 이하. 본문(코드 블록 밖)의 한 곳으로 정해져야 한다(M4 resolveQuote — 여럿이면 before/after 로 좁힌다).
 * - 같은 위치에서 시작하는 주장이 둘이면 CLAIM_DUPLICATE.
 * - 연결(sources): 20개까지. 자료가 있어야 하고 자료 인용이 그 자료에 있어야 한다(checkSourceQuote). 같은 연결은 한 번만 남기고 당시 자료 버전을 고정한다. 이미 버전이 있는 연결은 재고정하지 않는다.
 * - 근거 없는 주장(sources: [])도 받는다 — 그것을 알리는 것이 sources.claim-supported 검사다.
 * - 앞뒤 문맥은 엔진이 본문에서 다시 자른 것으로 바꾼다(호스트가 준 문맥을 그대로 저장하지 않는다).
 * @param {{ sources: Map<string, any>, entities?: Map<string, any> }} work
 * @param {string} text
 * @param {unknown} claims
 */
export function validateClaims(work, text, claims, { requireBound = false } = {}) {
  if (!Array.isArray(claims) || claims.length > MAX_CLAIMS) return { claims: [], errors: [{ index: null, code: 'CLAIMS_SHAPE_INVALID' }] };
  const errors = [];
  const accepted = [];
  const starts = new Set();
  for (let index = 0; index < claims.length; index += 1) {
    const claim = claims[index];
    if (!isPlainObject(claim) || !Array.isArray(claim.sources) || claim.sources.length > MAX_LINKS) { errors.push({ index, code: 'CLAIM_INVALID' }); continue; }
    if ((claim.basis !== undefined && !['explicit', 'attributed', 'inferred'].includes(claim.basis))
      || (claim.basis === 'attributed' && typeof claim.perspectiveId !== 'string')
      || (claim.perspectiveId !== undefined && !work.entities?.has(claim.perspectiveId))) { errors.push({ index, code: 'CLAIM_PERSPECTIVE_INVALID' }); continue; }
    if (typeof claim.quote !== 'string' || claim.quote.trim().length < 2 || claim.quote.length > MAX_QUOTE) { errors.push({ index, code: 'CLAIM_QUOTE_INVALID' }); continue; }
    const found = resolveQuote(text, { quote: claim.quote, before: claim.before, after: claim.after });
    if (found.ok === false) {
      errors.push({ index, code: found.code.replace(/^OCCURRENCE_/, 'CLAIM_'), ...(found.count !== undefined ? { count: found.count } : {}) });
      continue;
    }
    if (starts.has(found.start)) { errors.push({ index, code: 'CLAIM_DUPLICATE' }); continue; }
    const links = [];
    let refused = null;
    for (let at = 0; at < claim.sources.length && !refused; at += 1) {
      const link = claim.sources[at];
      const sourceId = isPlainObject(link) ? link.sourceId : undefined;
      const known = typeof sourceId === 'string' && work.sources.has(sourceId);
      const source = known ? work.sources.get(sourceId) : undefined;
      const bound = isPlainObject(link) && ['sourceRev', 'sourceHash', 'span'].some((key) => Object.hasOwn(link, key));
      const checked = bound || requireBound ? verifySourceLink(source, link) : checkSourceQuote(source, link?.quote);
      if (checked.ok === false) refused = { index, link: at, code: checked.code, ...(sourceId !== undefined ? { sourceId: clip(sourceId) } : {}) };
      else if (!links.some((l) => l.sourceId === sourceId && l.quote === link.quote)) links.push(bound ? { sourceId, quote: link.quote, sourceRev: link.sourceRev, sourceHash: link.sourceHash, span: link.span } : bindSource(source, link.quote));
    }
    if (refused) { errors.push(refused); continue; }
    starts.add(found.start);
    accepted.push({ quote: claim.quote, before: found.before, after: found.after, sources: links,
      ...(claim.basis !== undefined ? { basis: claim.basis } : {}), ...(claim.perspectiveId !== undefined ? { perspectiveId: claim.perspectiveId } : {}) });
  }
  return { claims: accepted, errors };
}
