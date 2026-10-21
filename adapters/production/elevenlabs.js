import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { invalid, requireTransport, prepareRequest, fixedGroups, assertHandle, selectedKeys, resourceIdentity, submissionGate } from './common.js';
import { nativeRecord } from './native-records.js';
import { textBindings } from './input-bindings.js';
import { normalizeCharacterAlignment } from './alignment.js';
import { validateSpeechParameters } from './request-schemas.js';
import { capturedFile, MAX_INLINE_CAPTURE_BYTES } from './file-transfer.js';

export const ELEVENLABS_SCHEMA_SOURCE = 'https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps';
const endpointPattern = /^\/v1\/text-to-speech\/([A-Za-z0-9_-]+)\/with-timestamps$/;

function audioType(format) {
  if (format.startsWith('mp3_')) return 'audio/mpeg';
  if (format.startsWith('wav_')) return 'audio/wav';
  if (format.startsWith('pcm_')) return 'audio/pcm';
  invalid('first adapter supports MP3, WAV and PCM output formats');
}
function audioBytes(base64) {
  if (typeof base64 !== 'string' || !base64.length || base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64)) invalid('speech response requires canonical audio_base64');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.toString('base64') !== base64) invalid('invalid audio encoding');
  return bytes;
}
async function captureAudio(transport, bytes) {
  if (bytes.length <= MAX_INLINE_CAPTURE_BYTES) return capturedFile(bytes);
  if (typeof transport.captureAudio !== 'function') invalid('large speech requires transport.captureAudio to retain a local file');
  const contentHash = sha256(bytes);
  const file = capturedFile(await transport.captureAudio(bytes));
  if (!('path' in file)) invalid('large speech capture must return a local file descriptor');
  if (file.contentHash && file.contentHash !== contentHash) invalid('speech capture hash differs from the synchronous response');
  return { ...file, contentHash };
}

/** @param {{transport?: any, accountAlias?: string}} options */
export function createElevenLabsAdapter({ transport, accountAlias } = {}) {
  requireTransport(transport, ['convertWithTimestamps']);
  if (typeof accountAlias !== 'string' || !accountAlias) invalid('accountAlias required');
  const submitOnce = submissionGate();
  const responses = new Map();
  return Object.freeze({
    async prepare(request, pinnedArtifacts = []) {
      const match = endpointPattern.exec(request?.endpoint ?? '');
      if (!match || !['text-to-speech', 'text-to-speech-with-timestamps'].includes(request.capability) || typeof request.parameters?.text !== 'string' || !request.parameters.text.length) invalid('supported speech-with-timestamps request required');
      validateSpeechParameters(request.parameters);
      fixedGroups(request, 1);
      const body = structuredClone(request.parameters); const query = {};
      for (const key of ['output_format', 'enable_logging', 'optimize_streaming_latency']) if (key in body) { query[key] = body[key]; delete body[key]; }
      if (request.model !== undefined) {
        if (body.model_id !== undefined && body.model_id !== request.model) invalid('model fields disagree');
        body.model_id = request.model;
      }
      audioType(query.output_format ?? 'mp3_44100_128');
      return prepareRequest(request, 'elevenlabs', { endpoint: request.endpoint, voiceId: match[1], body, query }, textBindings(request, pinnedArtifacts, ['text', 'previous_text', 'next_text']));
    },
    async submit(prepared) {
      return submitOnce(prepared, async () => {
        const { voiceId, body, query } = prepared.nativeRequest;
        const response = await transport.convertWithTimestamps(voiceId, body, query);
        const data = response.data ?? response;
        audioBytes(data.audio_base64);
        const jobId = response.requestId ?? response.request_id ?? `local-${randomUUID()}`;
        responses.set(jobId, response);
        return {
          status: 'complete', handle: { provider: 'elevenlabs', accountAlias, endpoint: prepared.request.endpoint,
            jobId, jobIdSource: response.requestId || response.request_id ? 'provider' : 'local-correlation',
            request: prepared.request },
          nativeRecords: [nativeRecord('submit', response)],
        };
      });
    },
    async inspect(handle) {
      assertHandle(handle, 'elevenlabs', accountAlias);
      return { status: responses.has(handle.jobId) ? 'complete' : 'collection-unavailable', nativeStatus: 'synchronous-response', unavailableFields: responses.has(handle.jobId) ? [] : ['synchronousResponse'] };
    },
    async collect(handle, artifactKeys) {
      assertHandle(handle, 'elevenlabs', accountAlias);
      if (!responses.has(handle.jobId)) invalid('synchronous response must be captured before the host session ends');
      const response = responses.get(handle.jobId); const data = response.data ?? response;
      const [groupId] = fixedGroups(handle.request, 1);
      const audioResourceId = resourceIdentity(handle, 'audio');
      const textRevisionId = handle.request.inputBindings.find((binding) => binding.fieldPath === 'text')?.revisionId;
      const timing = normalizeCharacterAlignment(data, { requestText: handle.request.parameters.text, textRevisionId, audioResourceId });
      const format = handle.request.parameters.output_format ?? 'mp3_44100_128';
      const keys = selectedKeys(['audio', ...(timing.original || timing.normalized ? ['alignment'] : [])], artifactKeys);
      /** @type {Array<{artifactKey:string,groupId:string,role:string,resourceId:string,mediaType:string,bytes?:Buffer,path?:string,contentHash?:string,metadata:Record<string,unknown>}>} */
      const all = [];
      if (keys.includes('audio')) all.push({ artifactKey: 'audio', groupId, role: 'audio', resourceId: audioResourceId, mediaType: audioType(format), ...await captureAudio(transport, audioBytes(data.audio_base64)), metadata: { outputFormat: format } });
      if (keys.includes('alignment')) all.push({ artifactKey: 'alignment', groupId, role: 'alignment', resourceId: resourceIdentity(handle, 'alignment'), mediaType: 'application/json', bytes: Buffer.from(canonicalJson(timing)), metadata: { sourceArtifactKey: 'audio', ...(textRevisionId ? { textRevisionId } : {}) } });
      return { status: timing.original ? 'complete' : 'partial', artifacts: all, nativeRecords: [nativeRecord('result', response)], observation: 'host-reported', unavailableFields: ['modelInternalReasoning', 'normalizationMap', ...(handle.jobIdSource === 'local-correlation' ? ['providerJobId'] : []), ...(timing.original ? [] : ['alignment'])] };
    },
  });
}
