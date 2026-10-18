import { fencedRanges, maskRanges } from '../util/fences.js';

/** 긴 이름부터 찾되 같은 표면의 후보 ID는 한 번에 모은다. 모호한 이름을 임의 ID로 확정하지 않는다. */
export function scanReferences(text, entities) {
  const terms = new Map();
  for (const entity of entities) {
    for (const term of [entity.name, ...(entity.aliases ?? [])]) {
      if (!term) continue;
      if (!terms.has(term)) terms.set(term, new Set());
      terms.get(term).add(entity.id);
    }
  }
  const ordered = [...terms].sort(([a], [b]) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  let masked = maskRanges(String(text), fencedRanges(text));
  const matches = [];
  const counts = new Map();
  for (const [quote, ids] of ordered) {
    const entityIds = [...ids].sort();
    let start = masked.indexOf(quote);
    while (start !== -1) {
      matches.push({ quote, start, entityIds });
      if (entityIds.length === 1) counts.set(entityIds[0], (counts.get(entityIds[0]) ?? 0) + 1);
      masked = masked.slice(0, start) + '\u0000'.repeat(quote.length) + masked.slice(start + quote.length);
      start = masked.indexOf(quote, start + quote.length);
    }
  }
  return { counts, matches, ambiguities: matches.filter((m) => m.entityIds.length > 1) };
}

/** 확실한 이름·별칭만 센다. 코드 블록과 긴 별칭에 포함된 짧은 이름은 제외한다. */
export const scanMentions = (text, entities) => scanReferences(text, entities).counts;
