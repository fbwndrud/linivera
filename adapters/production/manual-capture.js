import { sha256 } from '../../core/util/hash.js';
import { invalid, digest, prepareRequest, fixedGroups, assertHandle, selectedKeys, resourceIdentity } from './common.js';

export function createManualCaptureAdapter({ accountAlias = 'manual' } = {}) {
  const preparedFiles = new WeakMap();
  const captures = new Map();
  return Object.freeze({
    async prepare(request, files = []) {
      if (request?.endpoint !== 'local-files' || request.capability !== 'manual-import' || typeof request.parameters?.captureId !== 'string' || !request.parameters.captureId) invalid('manual captureId and local-files endpoint required');
      if (request.inputBindings?.length) invalid('manual file capture cannot attest original generation inputs');
      const groups = fixedGroups(request, request.outputSpec?.groups?.length);
      if (!Array.isArray(files) || !files.length || new Set(files.map((file) => file.artifactKey)).size !== files.length) invalid('unique supplied files required');
      const copied = files.map((file) => {
        if (!groups.includes(file.groupId) || typeof file.artifactKey !== 'string' || !file.artifactKey || typeof file.role !== 'string' || !file.role || typeof file.mediaType !== 'string' || !(file.bytes instanceof Uint8Array)) invalid('file key, group, role, media type and actual bytes required');
        return { artifactKey: file.artifactKey, groupId: file.groupId, role: file.role, mediaType: file.mediaType, bytes: Buffer.from(file.bytes) };
      });
      const nativeRequest = { endpoint: 'local-files', captureId: request.parameters.captureId,
        declaredProvider: request.parameters.declaredProvider ?? 'unknown',
        files: copied.map(({ bytes, ...file }) => ({ ...file, contentHash: sha256(bytes), byteLength: bytes.length })),
      };
      const prepared = prepareRequest(request, 'manual', nativeRequest);
      preparedFiles.set(prepared, copied);
      return prepared;
    },
    async submit(prepared) {
      const files = preparedFiles.get(prepared);
      if (!files) invalid('manual request must be prepared by this adapter');
      const jobId = prepared.nativeRequest.captureId;
      const old = captures.get(jobId);
      if (old && old.requestDigest !== prepared.requestDigest) invalid('capture identity already binds different files');
      captures.set(jobId, { files, requestDigest: prepared.requestDigest });
      return { status: 'complete', handle: { provider: 'manual', accountAlias, endpoint: 'local-files', jobId, jobIdSource: 'local-capture', request: prepared.request }, nativeRecords: prepared.nativeRecords };
    },
    async inspect(handle) {
      assertHandle(handle, 'manual', accountAlias);
      return { status: captures.has(handle.jobId) ? 'complete' : 'collection-unavailable', nativeStatus: 'local-files', observation: 'user-reported' };
    },
    async collect(handle, artifactKeys) {
      assertHandle(handle, 'manual', accountAlias);
      const captured = captures.get(handle.jobId);
      if (!captured) invalid('manual files are not available in this host session');
      const keys = selectedKeys(captured.files.map((file) => file.artifactKey), artifactKeys);
      return {
        status: 'complete', artifacts: captured.files.filter((file) => keys.includes(file.artifactKey)).map((file) => ({
          ...file, bytes: Buffer.from(file.bytes), resourceId: resourceIdentity(handle, file.artifactKey),
          metadata: { generation: 'unknown', declaredProvider: handle.request.parameters.declaredProvider ?? 'unknown', captureDigest: digest({ jobId: handle.jobId, contentHash: sha256(file.bytes) }) },
        })), nativeRecords: [], observation: 'user-reported', unavailableFields: ['originalPrompt', 'providerJobId', 'providerModel', 'seed'],
      };
    },
  });
}
