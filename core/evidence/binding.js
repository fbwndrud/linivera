import { checkSourceQuote } from './source-quote.js';

/** 같은 인용이 여러 번 나오거나 NFC 동등 일치만 있으면 정확한 원문 위치를 주장하지 않는다. */
function quoteSpan(source, quote) {
  if (typeof source.text !== 'string') {
    const spans = (source.spans ?? []).filter((s) => typeof s?.quote === 'string' && s.quote.normalize('NFC').trim() === quote.normalize('NFC').trim());
    return spans.length === 1 ? { kind: 'declared', id: spans[0].id } : null;
  }
  const start = source.text.indexOf(quote);
  return start !== -1 && source.text.indexOf(quote, start + 1) === -1 ? { kind: 'text', start, end: start + quote.length } : null;
}

/** 자료/설명서 revision과 실제 원본 바이트 hash를 함께 고정한다. */
export const bindSource = (source, quote) => ({ sourceId: source.id, quote, sourceRev: source.rev, sourceHash: source.contentHash, span: quoteSpan(source, quote) });

/** 저장된 버전만 검사한다. 새 자료로 과거 근거를 재고정하지 않는다. */
export function verifySourceLink(source, link) {
  if (!source) return { ok: false, code: 'CLAIM_SOURCE_UNKNOWN' };
  if (typeof link.sourceRev !== 'string' || typeof link.sourceHash !== 'string') return { ok: false, code: 'SOURCE_VERSION_UNKNOWN' };
  if (link.sourceRev !== source.rev || link.sourceHash !== source.contentHash) return { ok: false, code: 'SOURCE_REV_CHANGED' };
  const quote = checkSourceQuote(source, link.quote);
  if (!quote.ok) return quote;
  const span = link.span;
  if (span !== null) {
    if (span?.kind === 'text') {
      if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start
        || typeof source.text !== 'string' || source.text.slice(span.start, span.end) !== link.quote) return { ok: false, code: 'SOURCE_SPAN_INVALID' };
    } else if (span?.kind === 'declared') {
      if (!(source.spans ?? []).some((s) => s.id === span.id && typeof s.quote === 'string' && s.quote.normalize('NFC').trim() === link.quote.normalize('NFC').trim())) return { ok: false, code: 'SOURCE_SPAN_INVALID' };
    } else return { ok: false, code: 'SOURCE_SPAN_INVALID' };
  }
  return { ok: true };
}
