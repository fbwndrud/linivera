import { invalid, requireTransport, prepareRequest, fixedGroups, assertHandle, resourceIdentity, selectedKeys, submissionGate } from './common.js';
import { nativeRecord } from './native-records.js';
import { textBindings } from './input-bindings.js';
import { capturedFile } from './file-transfer.js';
import { validateMeshyParameters } from './request-schemas.js';
import { MESHY_MODEL_MEDIA_TYPES } from './meshy-formats.js';

export const MESHY_ENDPOINT = '/openapi/v2/text-to-3d';
export const MESHY_SCHEMA_SOURCE = 'https://docs.meshy.ai/en/api/text-to-3d';
export const MESHY_SCHEMA_CHECKED = '2026-10-22';
const formats = { ...MESHY_MODEL_MEDIA_TYPES, mtl: 'text/plain' };
const state = (status) => ({ PENDING: 'accepted', IN_PROGRESS: 'running', SUCCEEDED: 'complete', FAILED: 'failed', CANCELED: 'canceled' })[status] ?? 'unknown';

/** Preview creation only. Refinement is a separate paid operation, never an automatic follow-up. @param {{transport?:any,accountAlias?:string}} options */
export function createMeshyAdapter({ transport, accountAlias } = {}) {
  requireTransport(transport, ['submit', 'get', 'download']);
  if (typeof accountAlias !== 'string' || !accountAlias) invalid('accountAlias required');
  const submitOnce = submissionGate();
  return Object.freeze({
    async prepare(request, pinnedArtifacts = []) {
      const parameters = request?.parameters;
      if (request?.endpoint !== MESHY_ENDPOINT || request.capability !== 'text-to-3d') invalid('supported Meshy preview request required');
      validateMeshyParameters(parameters);
      fixedGroups(request, 1);
      return prepareRequest(request, 'meshy', { endpoint: MESHY_ENDPOINT, input: structuredClone(parameters) }, textBindings(request, pinnedArtifacts, ['prompt']));
    },
    async submit(prepared) {
      return submitOnce(prepared, async () => {
        const response = await transport.submit(MESHY_ENDPOINT, prepared.nativeRequest.input);
        if (typeof response?.result !== 'string' || !response.result) invalid('Meshy acknowledgement requires result task ID');
        return { status: 'accepted', handle: { provider: 'meshy', accountAlias, endpoint: MESHY_ENDPOINT,
          jobId: response.result, jobIdSource: 'provider', request: prepared.request }, nativeRecords: [nativeRecord('submit', response)] };
      });
    },
    async inspect(handle) {
      assertHandle(handle, 'meshy', accountAlias);
      const response = await transport.get(MESHY_ENDPOINT, handle.jobId);
      return { status: state(response.status), nativeStatus: response.status, nativeRecords: [nativeRecord('status', response)] };
    },
    async collect(handle, artifactKeys) {
      assertHandle(handle, 'meshy', accountAlias);
      const data = await transport.get(MESHY_ENDPOINT, handle.jobId); const [groupId] = fixedGroups(handle.request, 1);
      if (data.id !== undefined && data.id !== handle.jobId) invalid('result belongs to a different Meshy task');
      const available = [];
      for (const [format, url] of Object.entries(data.model_urls ?? {})) {
        if (!Object.hasOwn(formats, format)) invalid('unknown model file format');
        available.push({ artifactKey: `model-${format}`, relativePath: `models/model.${format}`, role: format === 'mtl' ? 'material' : 'model', mediaType: formats[format], url });
      }
      for (const [index, texture] of (data.texture_urls ?? []).entries()) for (const [channel, url] of Object.entries(texture)) {
        if (!['base_color', 'metallic', 'normal', 'roughness', 'emission'].includes(channel)) invalid('unknown texture channel');
        available.push({ artifactKey: `texture-${index}-${channel}`, relativePath: `textures/${index}-${channel}.png`, role: 'texture', mediaType: 'image/png', url });
      }
      available.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      const keys = selectedKeys(available.map((file) => file.artifactKey), artifactKeys);
      const artifacts = []; const members = []; const unavailable = [];
      for (const file of available) {
        const { url, ...descriptor } = file;
        if (!keys.includes(file.artifactKey)) { unavailable.push({ relativePath: file.relativePath, role: file.role, required: true, reason: 'File was not selected for capture' }); continue; }
        try {
          if (typeof url !== 'string' || !url.startsWith('https://')) invalid('HTTPS model download required');
          const actual = capturedFile(await transport.download(url));
          artifacts.push({ ...descriptor, groupId, resourceId: resourceIdentity(handle, file.artifactKey), ...actual,
            metadata: { relativePath: file.relativePath, required: true } });
          members.push({ artifactKey: file.artifactKey, relativePath: file.relativePath, role: file.role, required: true });
        } catch (error) { unavailable.push({ relativePath: file.relativePath, role: file.role, required: true,
          reason: error.code === 'PRODUCTION_INPUT_INVALID' ? error.message : 'File download failed; recover this task without creating it again' }); }
      }
      for (const format of handle.request.parameters.target_formats) if (!available.some((file) => file.artifactKey === `model-${format}`)) unavailable.push({ relativePath: `models/model.${format}`, role: 'model', required: true, reason: 'Requested format was not reported by the task' });
      if (data.status !== 'SUCCEEDED') unavailable.push({ role: 'output-enumeration', required: true, reason: 'Task has not reported successful final output enumeration' });
      return { status: data.status === 'SUCCEEDED' && !unavailable.length ? 'complete' : 'partial', artifacts,
        bundles: [{ artifactKey: 'model-bundle', groupId, role: 'bundle', resourceId: resourceIdentity(handle, 'model-bundle'),
          bundleType: 'model-3d', members, unavailable, dependencyCoverage: 'unknown', restorability: 'unknown' }],
        nativeRecords: [nativeRecord('result', data)], observation: 'host-reported', unavailableFields: ['unobservedDependencies', 'modelInternalReasoning'] };
    },
  });
}
