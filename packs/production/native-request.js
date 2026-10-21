import { FolioError } from '../../core/errors.js';

/** Pure projection for supported provider payloads; transport credentials stay outside this value. */
export function providerNativeRequest(request) {
  if (request.provider === 'fal') return { endpoint: request.endpoint, input: structuredClone(request.parameters) };
  if (request.provider !== 'elevenlabs') return null;
  const match = /^\/v1\/text-to-speech\/([A-Za-z0-9_-]+)\/with-timestamps$/.exec(request.endpoint);
  if (!match) throw new FolioError('PRODUCTION_INPUT_BINDING_INVALID', 'supported speech endpoint required');
  const body = structuredClone(request.parameters); const query = {};
  for (const key of ['output_format', 'enable_logging', 'optimize_streaming_latency']) if (key in body) { query[key] = body[key]; delete body[key]; }
  if (request.model !== undefined) {
    if (body.model_id !== undefined && body.model_id !== request.model) throw new FolioError('PRODUCTION_INPUT_BINDING_INVALID', 'model fields disagree');
    body.model_id = request.model;
  }
  return { endpoint: request.endpoint, voiceId: match[1], body, query };
}
