import { invalid, resourceIdentity, requireTransport, prepareRequest, fixedGroups, assertHandle, selectedKeys, submissionGate } from './common.js';
import { nativeRecord } from './native-records.js';
import { textBindings } from './input-bindings.js';
import { validateFalParameters } from './request-schemas.js';

export const FAL_IMAGE_ENDPOINT = 'fal-ai/flux/schnell';
export const FAL_SCHEMA_SOURCE = 'https://fal.ai/models/fal-ai/flux/schnell/api';

/** @param {{transport?: any, accountAlias?: string}} options */
export function createFalAdapter({ transport, accountAlias } = {}) {
  requireTransport(transport, ['submit', 'status', 'result', 'download']);
  if (typeof accountAlias !== 'string' || !accountAlias) invalid('accountAlias required');
  const submitOnce = submissionGate();
  return Object.freeze({
    async prepare(request, pinnedArtifacts = []) {
      if (request?.endpoint !== FAL_IMAGE_ENDPOINT || request.capability !== 'text-to-image' || typeof request.parameters?.prompt !== 'string' || !request.parameters.prompt.trim()) invalid('supported fal image request required');
      validateFalParameters(request.parameters);
      fixedGroups(request, request.parameters.num_images ?? 1);
      return prepareRequest(request, 'fal', { endpoint: request.endpoint, input: structuredClone(request.parameters) }, textBindings(request, pinnedArtifacts, ['prompt']));
    },
    async submit(prepared) {
      return submitOnce(prepared, async () => {
        const response = await transport.submit(prepared.nativeRequest.endpoint, { input: prepared.nativeRequest.input });
        if (typeof response?.request_id !== 'string' || !response.request_id) invalid('fal submit response requires request_id');
        return {
          status: 'accepted', handle: { provider: 'fal', accountAlias, endpoint: prepared.nativeRequest.endpoint, jobId: response.request_id, request: prepared.request },
          nativeRecords: [nativeRecord('submit', response)],
        };
      });
    },
    async inspect(handle) {
      assertHandle(handle, 'fal', accountAlias);
      const response = await transport.status(handle.endpoint, { requestId: handle.jobId, logs: true });
      const status = { IN_QUEUE: 'accepted', IN_PROGRESS: 'running', COMPLETED: 'complete' }[response?.status] ?? 'unknown';
      return { status, nativeStatus: response.status, nativeRecords: [nativeRecord('status', response)] };
    },
    async collect(handle, artifactKeys) {
      assertHandle(handle, 'fal', accountAlias);
      const response = await transport.result(handle.endpoint, { requestId: handle.jobId });
      const data = response.data ?? response;
      if (!Array.isArray(data.images)) invalid('fal result requires images');
      const count = handle.request.parameters.num_images ?? 1;
      const groups = fixedGroups(handle.request, count);
      if (data.images.length > count) invalid('provider returned undeclared extra candidates');
      const keys = selectedKeys(data.images.map((_, i) => `image-${i}`), artifactKeys);
      const artifacts = [];
      for (const [index, image] of data.images.entries()) {
        const artifactKey = `image-${index}`;
        if (!keys.includes(artifactKey)) continue;
        const bytes = await transport.download(image.url);
        if (!(bytes instanceof Uint8Array)) invalid('download transport must return bytes');
        artifacts.push({ artifactKey, groupId: groups[index], role: 'image', resourceId: resourceIdentity(handle, artifactKey), mediaType: image.content_type ?? 'image/jpeg', bytes: Buffer.from(bytes), metadata: { seed: data.seed ?? null, width: image.width ?? null, height: image.height ?? null } });
      }
      const missing = Array.from({ length: count }, (_, index) => `image-${index}`).slice(data.images.length);
      return { status: missing.length ? 'partial' : 'complete', artifacts, nativeRecords: [nativeRecord('result', response)], observation: 'host-reported', unavailableFields: ['modelInternalReasoning', ...(data.seed == null ? ['seed'] : []), ...missing] };
    },
  });
}
