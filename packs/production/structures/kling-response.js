import { array, invalid, object } from './common.js';
import { text } from './record-values.js';
import { reportedText, responseProjection } from './provider-response.js';

/** Legacy single /v1/videos/text2video/{task_id}, never a list or latest-model response. */
export function klingVideoQuery(value) {
  if (!object(value) || !Number.isSafeInteger(value.code)) invalid('Kling legacy response code required');
  const p = responseProjection('kling-video-query', 'kling', 'legacy /v1/videos/text2video/{task_id}');
  if (value.code !== 0) {
    p.unit('/', 'provider-response', { provider: 'kling', code: value.code });
    p.unit('/code', 'provider-error', { code: value.code, message: value.message == null ? null : reportedText(value.message) }); p.link('/', '/code', 'response-error'); return p.finish();
  }
  if (!object(value.data)) invalid('Kling single query requires object data'); const data = value.data;
  if (!['submitted', 'processing', 'succeed', 'failed'].includes(data.task_status)) invalid('known Kling legacy task status required');
  p.unit('/', 'provider-response', { provider: 'kling', taskId: reportedText(text(data.task_id, 512)), status: data.task_status, code: value.code });
  if (data.task_status !== 'succeed') {
    if (data.task_result !== undefined) p.unknown('Result outside succeed was not interpreted as a completed video.');
    return p.finish();
  }
  const videos = array(data.task_result?.videos ?? [], 'Kling task videos'); const ids = new Set();
  if (!videos.length) {
    p.ref('/data/task_result/videos/@video', '/', 'video', 'Missing video from successful Kling query'); p.unknown('Successful Kling query has no retained video locator.');
  }
  for (const [i, row] of videos.entries()) {
    if (!object(row)) invalid('Kling video object required'); const id = `/data/task_result/videos/${i}`; const remoteId = reportedText(text(row.id, 512));
    if (ids.has(remoteId)) invalid('duplicate Kling video identity'); ids.add(remoteId);
    p.unit(id, 'provider-output', { remoteId, modality: 'video', duration: row.duration === undefined ? null : reportedText(text(row.duration, 128)) }); p.link('/', id, 'response-output');
    for (const [key, role] of [['url', 'video'], ['watermark_url', 'watermarked-video']]) {
      if (key === 'watermark_url' && row[key] === undefined) continue;
      if (row[key] == null || row[key] === '') p.unknown(`Missing Kling output locator at ${id}/${key}`);
      else {
        text(row[key], 8192); let url; try { url = new URL(row[key]); } catch { invalid('Kling video URL required'); }
        if (!['http:', 'https:'].includes(url.protocol)) invalid('HTTP video URL required');
      }
      p.ref(id + '/' + key, id, role, `Kling ${role} at ${id}/${key}`);
    }
  }
  return p.finish();
}
