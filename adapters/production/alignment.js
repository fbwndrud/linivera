import { invalid } from './common.js';

function characterTiming(value) {
  if (value == null) return null;
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = value;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends) || characters.length !== starts.length || starts.length !== ends.length) invalid('character timing arrays must have equal lengths');
  const segments = characters.map((character, index) => {
    if (typeof character !== 'string' || !Number.isFinite(starts[index]) || !Number.isFinite(ends[index]) || starts[index] < 0 || ends[index] < starts[index] || (index > 0 && starts[index] < starts[index - 1])) invalid('invalid character timing or order');
    return { index, character, start: starts[index], end: ends[index] };
  });
  return { text: characters.join(''), segments };
}

export function normalizeCharacterAlignment(data, { requestText, textRevisionId, audioResourceId }) {
  const original = characterTiming(data.alignment);
  const normalized = characterTiming(data.normalized_alignment);
  return {
    version: 1, alignmentKind: 'character', timebase: { unit: 'seconds', origin: 0 },
    requestText, ...(textRevisionId ? { textRevisionId } : {}), audioResourceId,
    original, normalized, textMatchesRequest: original?.text === requestText,
    normalizationMap: 'unknown',
  };
}
