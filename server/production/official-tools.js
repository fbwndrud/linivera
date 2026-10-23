import { lstat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createMeshyAdapter } from '../../adapters/production/meshy.js';
import { capturedFile } from '../../adapters/production/file-transfer.js';
import { invalid, digest, freezeJson } from '../../adapters/production/common.js';
import { assertOfficialSpec, assertOfficialDiscovery, officialResult, taskId, taskState } from './official-tools-contract.js';
import { assertToolArguments, assertKnownToolArguments } from './official-tools-schema.js';
import { validateCapabilityRequest } from '../../packs/production/capabilities.js';
export { inspectOfficialToolConnection } from './official-tools-check.js';
export { MESHY_TOOL_CONTRACT, MESHY_INSTALLATION_EVIDENCE } from './official-tools-contract.js';

/** Official tools are supplied by the authenticated host; this module never creates credentials or an HTTP executor. */
export function createOfficialToolAdapter({ tools, accessSpec, accountAlias, projectAlias, accessSpecificationRevisionId, requestRevisionId, outputDirectory, assertReady }) {
  accessSpec = freezeJson(structuredClone(accessSpec));
  assertOfficialSpec(accessSpec);
  if (!tools || ['list', 'call', 'download'].some((key) => typeof tools[key] !== 'function')
    || typeof assertReady !== 'function' || !isAbsolute(outputDirectory ?? '') || resolve(outputDirectory) !== outputDirectory) invalid('host tools, fresh readiness callback and absolute capture directory required');
  if (!/^account-[a-z0-9-]{1,48}$/.test(accountAlias ?? '') || !/^project-[a-z0-9-]{1,48}$/.test(projectAlias ?? '')
    || [accessSpecificationRevisionId, requestRevisionId].some((id) => !/^sha256:[a-f0-9]{64}$/.test(id ?? ''))) invalid('exact access/request revisions and non-secret account/project aliases required');
  async function hostCall(action) {
    try { return await action(); } catch { invalid('official host call failed; raw diagnostics are not retained'); }
  }
  const names = accessSpec.toolContract.tools; let toolSchemas;
  async function invoke(role, args) {
    assertToolArguments(toolSchemas?.[role], args);
    return officialResult(await hostCall(() => tools.call(names[role], args)));
  }
  const native = (stage, id, status, extra = {}) => ({ stage, record: { version: 1, protocol: 'official-mcp',
    implementation: accessSpec.toolContract.implementation, implementationEvidence: 'host-package-attestation',
    independentInstallationVerification: 'not-performed', taskId: id, status, ...extra }, omittedPaths: [] });
  const handles = new Map(); const preparedRequests = new WeakSet();
  const transport = {
    async submit(_endpoint, parameters) {
      toolSchemas = assertOfficialDiscovery(await hostCall(() => tools.list()), accessSpec.toolContract);
      for (const format of parameters.target_formats) assertKnownToolArguments(toolSchemas.download,
        { format, include_textures: false, task_type: 'text-to-3d', response_format: 'json' });
      const input = { prompt: parameters.prompt, target_formats: parameters.target_formats,
        ...(parameters.ai_model !== undefined ? { ai_model: parameters.ai_model } : {}),
        ...(parameters.should_remesh !== undefined ? { should_remesh: parameters.should_remesh } : {}), response_format: 'json' };
      const response = await invoke('create', input);
      return { result: taskId(response.task_id) };
    },
    async get(_endpoint, id) {
      const response = await invoke('status', { task_id: taskId(id), task_type: 'text-to-3d',
        wait: true, timeout_seconds: 10, response_format: 'json' });
      if (taskId(response.task_id) !== id) invalid('official result belongs to another task');
      const status = taskState(response.status);
      const model_urls = {};
      for (const format of handles.get(id)?.request.parameters.target_formats ?? []) {
        // These placeholders are host-local routing keys, never remote signed URLs.
        if (status === 'SUCCEEDED' && typeof response.model_urls?.[format] === 'string') model_urls[format] = `https://capture.invalid/${id}/${format}`;
      }
      return { id, status, model_urls };
    },
    async download(key) {
      const parsed = /^https:\/\/capture\.invalid\/([A-Za-z0-9_-]+)\/(glb|obj|fbx|usdz|stl|3mf)$/.exec(key);
      if (!parsed) invalid('known task output required');
      const [, id, format] = parsed;
      const saveTo = join(outputDirectory, `${digest({ id, format }).slice(7)}.${format}`);
      const response = await invoke('download', { task_id: id, task_type: 'text-to-3d',
        format, include_textures: false, save_to: saveTo, response_format: 'json' });
      if (response.download_error || response.local_path !== saveTo || !Number.isSafeInteger(response.file_size_bytes)
        || response.file_size_bytes <= 0 || response.format !== format) invalid('download tool has not confirmed a complete local file');
      const capture = capturedFile(await hostCall(() => tools.download({ taskId: id, format, path: saveTo, expectedSize: response.file_size_bytes })));
      const path = 'path' in capture ? capture.path : undefined;
      const file = path ? await hostCall(() => lstat(path)) : undefined;
      if (file && (!file.isFile() || file.isSymbolicLink())) invalid('regular local output file required');
      const actualSize = capture.bytes?.byteLength ?? file.size;
      if (actualSize !== response.file_size_bytes || (path && path !== saveTo)) invalid('captured file differs from official download metadata');
      return capture.bytes ?? capture;
    },
  };
  const adapter = createMeshyAdapter({ accountAlias, transport });
  function known(handle) {
    if (handles.get(handle?.jobId) !== handle) invalid('official host requires its existing acknowledged task handle');
  }
  return Object.freeze({
    async prepare(request, artifacts = []) {
      if (Object.entries(accessSpec.identity).some(([key, value]) => request?.[key] !== value)
        || request.parameters?.prompt?.length < 2 || request.parameters?.ai_model !== 'meshy-7.1') invalid('official tool subset requires exact pinned identity, Meshy 7.1 and a two-character prompt');
      const prepared = await adapter.prepare(request, artifacts);
      validateCapabilityRequest(accessSpec.capabilityId, request);
      preparedRequests.add(prepared); return prepared;
    },
    async submit(prepared) {
      if (!preparedRequests.has(prepared)) invalid('official execution requires this host adapter prepared request');
      const scope = { accountAlias, projectAlias, accessSpecificationRevisionId, requestRevisionId };
      const confirmation = await hostCall(() => assertReady({ request: prepared.request, accessSpec, ...scope }));
      if (confirmation?.ready !== true || Object.entries(scope).some(([key, value]) => confirmation[key] !== value)) invalid('fresh connection confirmation must bind this account, project, route and request');
      const result = await adapter.submit(prepared);
      if (!result.handle) return result;
      handles.set(result.handle.jobId, result.handle);
      return { ...result, nativeRecords: [native('official-tool-submit', result.handle.jobId, 'PENDING', {
        tool: names.create, logicalRequestDigest: prepared.requestDigest,
        // Source-verified SDK defaults; these are not observations of an internal HTTP exchange.
        sdkDefaults: { mode: 'preview', moderation: false }, sdkDefaultsBasis: 'catalog-source-with-host-package-attestation', includeTextures: false,
      })] };
    },
    async inspect(handle) {
      known(handle);
      const result = await adapter.inspect(handle);
      return { ...result, nativeRecords: [native('official-tool-status', handle.jobId, taskState(result.nativeStatus))] };
    },
    async collect(handle, artifactKeys) {
      known(handle);
      const result = await adapter.collect(handle, artifactKeys);
      return { ...result, observation: 'host-reported', nativeRecords: [native('official-tool-result', handle.jobId,
        result.status === 'complete' ? 'SUCCEEDED' : 'UNKNOWN', { captureState: result.status,
          capturedFormats: result.artifacts.map((artifact) => artifact.artifactKey.slice('model-'.length)),
          remoteToolSuccessIsRetention: false })] };
    },
  });
}
