import { array, invalid, object } from './common.js';
import { text } from './record-values.js';
import { reportedText, responseProjection } from './provider-response.js';

/** Runware /v1 imageInference results, not acknowledgements or other modality responses. */
export function runwareImageResponse(value) {
  if (!object(value) || value.data === undefined && value.errors === undefined) invalid('Runware data/errors envelope required');
  const data = array(value.data ?? [], 'Runware data'); const errors = array(value.errors ?? [], 'Runware errors');
  if (!data.length && !errors.length) invalid('nonempty Runware observation required');
  const p = responseProjection('runware-image-response', 'runware', '/v1 imageInference');
  p.unit('/', 'provider-response', { provider: 'runware', endpoint: '/v1', taskType: 'imageInference' }); const images = new Set();
  for (const [i, row] of data.entries()) {
    if (!object(row)) invalid('Runware result object required'); const id = `/data/${i}`;
    if (row.taskType !== 'imageInference') { p.unknown(`Unsupported Runware task type at ${id}`); continue; }
    const taskId = reportedText(row.taskUUID); const remoteId = reportedText(row.imageUUID);
    if (images.has(remoteId)) invalid('duplicate Runware image identity'); images.add(remoteId);
    let key = id + '/@image'; let representation = 'missing';
    if (row.imageURL !== undefined) {
      text(row.imageURL, 8192); let url; try { url = new URL(row.imageURL); } catch { invalid('Runware image URL required'); }
      if (!['http:', 'https:'].includes(url.protocol)) invalid('HTTP image URL required');
      key = id + '/imageURL'; representation = 'url';
    } else if (row.imageBase64Data !== undefined || row.imageDataURI !== undefined) {
      if (typeof (row.imageBase64Data ?? row.imageDataURI) !== 'string') invalid('embedded image string required');
      representation = 'embedded'; p.unknown(`Embedded image at ${id} requires explicit extraction and retained file binding; payload not decoded.`);
    } else p.unknown(`Missing image representation at ${id}`);
    p.unit(id, 'provider-output', { taskId, remoteId, modality: 'image', representation }); p.link('/', id, 'response-output');
    p.ref(key, id, 'image', `Runware image at ${id}`);
  }
  for (const [i, row] of errors.entries()) {
    if (!object(row)) invalid('Runware error object required'); const id = `/errors/${i}`;
    p.unit(id, 'provider-error', { code: reportedText(row.code), message: row.message === undefined ? null : reportedText(row.message),
      taskId: row.taskUUID === undefined ? null : reportedText(row.taskUUID) }); p.link('/', id, 'response-error');
  }
  p.unknown('One response does not establish completion of the requested batch. Other modalities require a separate contract.');
  return p.finish();
}
