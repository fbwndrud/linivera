import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { assertBundlePath } from '../../core/resources/bundles.js';
import { invalid, prepareRequest, fixedGroups, assertHandle, selectedKeys, resourceIdentity } from './common.js';
import { capturedFile } from './file-transfer.js';
import { nativeRecord } from './native-records.js';

export const MANUAL_EXPORT_VERSION = 'linivera-manual-export-v1';

/** A Linivera capture envelope, never a claimed vendor JSON or execution schema. */
export function createVersionedExportAdapter({ provider, bundleType, requiredRoles, externalMissing = [], accountAlias = 'manual' }) {
  const preparedCaptures = new WeakMap(); const captures = new Map();
  return Object.freeze({
    async prepare(request, capture = { files: [] }) {
      if (request?.endpoint !== `manual-export/${provider}/v1` || request.capability !== 'manual-export' || request.schemaVersion !== MANUAL_EXPORT_VERSION
        || typeof request.parameters?.captureId !== 'string' || !request.parameters.captureId || request.inputBindings?.length) invalid('versioned manual capture with no claimed original input bindings required');
      const [groupId] = fixedGroups(request, 1);
      if (!Array.isArray(capture.files) || !capture.files.length) invalid('explicit exported files required');
      const paths = new Set(); const keys = new Set();
      const files = capture.files.map((file) => {
        assertBundlePath(file.relativePath);
        if (paths.has(file.relativePath) || typeof file.artifactKey !== 'string' || !file.artifactKey || keys.has(file.artifactKey)
          || typeof file.role !== 'string' || !file.role || typeof file.mediaType !== 'string') invalid('unique file keys, paths and explicit roles/media types required');
        paths.add(file.relativePath); keys.add(file.artifactKey);
        const actual = capturedFile(file.bytes ?? file);
        let omittedPaths = []; let sourceContentHash;
        if (actual.bytes) {
          sourceContentHash = sha256(actual.bytes);
          if (file.contentHash && sourceContentHash !== file.contentHash) invalid('exported file differs from expected hash');
          if (file.mediaType === 'application/json') {
            let value; try { value = JSON.parse(actual.bytes.toString('utf8')); } catch { invalid('declared JSON export is invalid'); }
            const safe = nativeRecord('export-file', value); omittedPaths = safe.omittedPaths;
            if (omittedPaths.length) actual.bytes = Buffer.from(canonicalJson(safe.record));
          }
        }
        return { artifactKey: file.artifactKey, groupId, role: file.role, mediaType: file.mediaType, ...actual,
          metadata: { relativePath: file.relativePath, required: file.required ?? true, sourceContentHash: sourceContentHash ?? file.contentHash ?? null, omittedPaths, generation: 'unknown' } };
      });
      const native = nativeRecord('manual-export', capture.native ?? {});
      const unavailable = [...(capture.unavailable ?? []), ...externalMissing];
      for (const role of requiredRoles) if (!files.some((file) => file.role === role)) unavailable.push({ role, required: true, reason: 'Required export was not supplied' });
      const nativeRequest = { captureSchema: MANUAL_EXPORT_VERSION, sourceProvider: provider,
        captureId: request.parameters.captureId, generation: 'unknown',
        files: files.map(({ artifactKey, role, mediaType, metadata }) => ({ artifactKey, role, mediaType, ...metadata })),
        supplierObservation: native.record, unavailable };
      const prepared = prepareRequest(request, provider, nativeRequest);
      preparedCaptures.set(prepared, { files, native, unavailable, requestDigest: prepared.requestDigest });
      return prepared;
    },
    async submit(prepared) {
      const capture = preparedCaptures.get(prepared);
      if (!capture) invalid('capture must be prepared by this adapter');
      const jobId = prepared.request.parameters.captureId; const old = captures.get(jobId);
      if (old && old.requestDigest !== capture.requestDigest) invalid('capture identity already names another export');
      captures.set(jobId, capture);
      return { status: 'complete', handle: { provider, accountAlias, endpoint: prepared.request.endpoint, jobId,
        jobIdSource: 'local-capture', request: prepared.request }, nativeRecords: [capture.native] };
    },
    async inspect(handle) {
      assertHandle(handle, provider, accountAlias);
      return { status: captures.has(handle.jobId) ? 'complete' : 'collection-unavailable', observation: 'user-reported', nativeStatus: 'manual-export' };
    },
    async collect(handle, artifactKeys) {
      assertHandle(handle, provider, accountAlias); const capture = captures.get(handle.jobId);
      if (!capture) invalid('export files must be retained before the capture host session ends');
      const keys = selectedKeys(capture.files.map((file) => file.artifactKey), artifactKeys);
      const files = capture.files.filter((file) => keys.includes(file.artifactKey));
      const unavailable = [...capture.unavailable, ...capture.files.filter((file) => !keys.includes(file.artifactKey)).map((file) => ({
        relativePath: file.metadata.relativePath, role: file.role, required: file.metadata.required, reason: 'Export file was not selected for capture',
      }))];
      const [groupId] = fixedGroups(handle.request, 1);
      return { status: unavailable.some((item) => item.required !== false) ? 'partial' : 'complete',
        artifacts: files.map((file) => ({ ...file, ...(file.bytes ? { bytes: Buffer.from(file.bytes) } : {}), resourceId: resourceIdentity(handle, file.artifactKey) })),
        bundles: [{ artifactKey: 'export-bundle', groupId, role: 'bundle', resourceId: resourceIdentity(handle, 'export-bundle'), bundleType,
          members: files.map((file) => ({ artifactKey: file.artifactKey, relativePath: file.metadata.relativePath, role: file.role, required: file.metadata.required })),
          unavailable, dependencyCoverage: externalMissing.length ? 'partial' : 'unknown', restorability: 'unknown' }],
        nativeRecords: [capture.native], observation: 'user-reported',
        unavailableFields: ['originalGenerationInputs', 'providerJobId', 'providerModel', 'seed', 'unobservedDependencies'] };
    },
  });
}
