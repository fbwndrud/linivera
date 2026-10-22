import { invalid, object } from './common.js';
import { text } from './record-values.js';
import { reportedText, responseProjection } from './provider-response.js';

/** Existing /v1/query/video_generation contract; file_id is an opaque string, never a URL. */
export function minimaxVideoQuery(value) {
  if (!object(value) || !object(value.base_resp) || !Number.isSafeInteger(value.base_resp.status_code)) invalid('MiniMax base_resp status code required');
  const p = responseProjection('minimax-video-query', 'minimax', '/v1/query/video_generation'); const code = value.base_resp.status_code;
  if (code !== 0) {
    p.unit('/', 'provider-response', { provider: 'minimax', code });
    p.unit('/base_resp', 'provider-error', { code, message: value.base_resp.status_msg == null ? null : reportedText(value.base_resp.status_msg) }); p.link('/', '/base_resp', 'response-error');
    return p.finish();
  }
  const taskId = reportedText(text(value.task_id, 512));
  if (!['Preparing', 'Queueing', 'Processing', 'Success', 'Fail'].includes(value.status)) invalid('known MiniMax video query status required');
  p.unit('/', 'provider-response', { provider: 'minimax', taskId, status: value.status, code });
  if (value.status === 'Success') {
    let remoteId = null;
    if (value.file_id == null || value.file_id === '') p.unknown('Success response is missing /file_id; retain and bind the actual video explicitly.');
    else remoteId = reportedText(text(value.file_id, 512));
    p.unit('/file_id', 'provider-output', { remoteId, modality: 'video', representation: 'file-id' }); p.link('/', '/file_id', 'response-output');
    p.ref('/file_id', '/file_id', 'video', 'MiniMax file ID at /file_id; bind the retained video, not a URL');
  } else if (value.file_id !== undefined) p.unknown('File ID outside Success was retained in the source but not interpreted as a completed video.');
  return p.finish();
}
