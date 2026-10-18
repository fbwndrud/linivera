/** 자료 인용 길이 한도(주장 인용·등장 위치 인용과 같다). */
export const MAX_SOURCE_QUOTE = 500;
const nfc = (text) => text.normalize('NFC');

/**
 * 자료 인용이 그 자료에 정말 있는가(N2 설계 §1 "엔진이 양쪽을 대조한다").
 * - 글 파일(.txt/.md) 자료: 원본 글에 그대로 있어야 한다.
 * - 그 밖(PDF 등 글을 읽지 않는 자료): 설명서 spans 의 인용 하나와 같아야 한다(앞뒤 공백만 무시한다. 일부만 인용하면 안 된다).
 * NFC 로 견준다. 다듬은 길이 2 미만이거나 500자를 넘는 인용은 근거가 아니다.
 * @param {{ text?: string|null, spans?: any[] } | undefined} source
 * @param {unknown} quote
 * @returns {{ ok: true } | { ok: false, code: 'CLAIM_SOURCE_UNKNOWN'|'CLAIM_SOURCE_QUOTE_INVALID'|'CLAIM_SOURCE_QUOTE_NOT_FOUND' }}
 */
export function checkSourceQuote(source, quote) {
  if (!source) return { ok: false, code: 'CLAIM_SOURCE_UNKNOWN' };
  if (typeof quote !== 'string' || quote.trim().length < 2 || quote.length > MAX_SOURCE_QUOTE || /[\uD800-\uDFFF]/u.test(quote)) return { ok: false, code: 'CLAIM_SOURCE_QUOTE_INVALID' };
  const wanted = nfc(quote);
  const found = typeof source.text === 'string'
    ? nfc(source.text).includes(wanted)
    : (Array.isArray(source.spans) ? source.spans : []).some((span) => typeof span?.quote === 'string' && nfc(span.quote).trim() === wanted.trim());
  return found ? { ok: true } : { ok: false, code: 'CLAIM_SOURCE_QUOTE_NOT_FOUND' };
}
