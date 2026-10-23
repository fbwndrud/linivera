import { invalid, projection } from './common.js';

function seconds(h, m, s, ms) {
  if (+m > 59 || +s > 59) invalid('subtitle minute or second out of range');
  return +h * 3600 + +m * 60 + +s + +ms / 1000;
}
export function subRip(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { invalid('SRT requires UTF-8 text'); }
  const p = projection('srt');
  const blocks = text.replaceAll('\r\n', '\n').trim().split(/\n[\t ]*\n/);
  if (!text.trim() || blocks.length > 4096) invalid('SRT requires 1 to 4096 cues');
  for (const [index, block] of blocks.entries()) {
    const [label, timing, ...lines] = block.split('\n');
    const time = timing?.match(/^(\d{2,6}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2,6}):(\d{2}):(\d{2}),(\d{3})$/);
    if (!/^\d+$/.test(label) || !time || !lines.join('\n').trim()) invalid('SRT cue requires label, exact timestamp range and text');
    const start = seconds(...time.slice(1, 5)); const end = seconds(...time.slice(5, 9));
    if (end < start) invalid('subtitle end precedes its start');
    p.unit(`/cues/${index}`, 'subtitle-cue', { nativeId: label, start, end, timeUnit: 'seconds', text: lines.join('\n') });
  }
  p.ref('media', '/cues/0', 'media', 'Explicit media for these cue times', false);
  p.unknown('Cue timestamps are reported timing; audio alignment, styling and editing tracks are not inferred.');
  return p.finish();
}
