import { createHash } from 'node:crypto';
import { FolioError } from '../../core/errors.js';
import { canonicalJson } from '../../core/util/hash.js';
import { nativeRecord } from './native-records.js';

/** @returns {never} */
export function invalid(message) { throw new FolioError('PRODUCTION_INPUT_INVALID', message); }
export function freezeJson(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeJson); Object.freeze(value); }
  return value;
}
export function digest(value) { return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`; }
export function resourceIdentity(handle, artifactKey) {
  return `generated-${digest({ provider: handle.provider, accountAlias: handle.accountAlias, endpoint: handle.endpoint, jobId: handle.jobId, artifactKey }).slice(7)}`;
}
export function requireTransport(transport, methods) {
  for (const method of methods) if (typeof transport?.[method] !== 'function') invalid(`injected transport.${method} required`);
}
export function prepareRequest(request, provider, nativeRequest, inputMapping = []) {
  if (request?.version !== 1 || request.provider !== provider || !request.parameters || !Array.isArray(request.inputBindings)) invalid('versioned provider request required');
  const captured = nativeRecord('request', nativeRequest);
  return freezeJson({ request: structuredClone(request), nativeRequest, inputMapping, requestDigest: digest(captured.record), nativeRecords: [captured] });
}
export function fixedGroups(request, count) {
  const spec = request.outputSpec;
  if (spec?.groupPolicy !== 'fixed' || !Array.isArray(spec.groups) || spec.groups.length !== count || new Set(spec.groups.map((g) => g.groupId)).size !== count) invalid('one declared output group per candidate required');
  if (spec.groups.some((g) => typeof g.groupId !== 'string' || !g.groupId)) invalid('output group identity required');
  return spec.groups.map((g) => g.groupId);
}
export function assertHandle(handle, provider, accountAlias) {
  if (handle?.provider !== provider || handle.accountAlias !== accountAlias || typeof handle.jobId !== 'string' || !handle.jobId || !handle.request || handle.endpoint !== handle.request.endpoint) invalid('provider handle belongs to another account or is incomplete');
}
export function selectedKeys(available, requested) {
  if (requested === undefined) return available;
  if (!Array.isArray(requested) || new Set(requested).size !== requested.length || requested.some((key) => !available.includes(key))) invalid('requested artifact keys are unavailable');
  return requested;
}

export function submissionGate() {
  const attempts = new WeakMap();
  return (prepared, submit) => {
    if (!prepared || typeof prepared !== 'object') invalid('prepared request required');
    if (!attempts.has(prepared)) attempts.set(prepared, Promise.resolve().then(submit).catch((error) => ({
      status: Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? 'failed' : 'submission-unknown',
      nativeRecords: [], unavailableFields: ['providerJobId'], reason: 'transport did not return a usable acknowledgement',
    })));
    return attempts.get(prepared);
  };
}
