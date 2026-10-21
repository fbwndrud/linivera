import { sha256 } from '../../core/util/hash.js';
import { invalid } from './common.js';

export function textBindings(request, artifacts, allowedFields) {
  if (!Array.isArray(request.inputBindings) || !Array.isArray(artifacts)) invalid('input bindings and pinned artifacts required');
  const fields = new Set();
  return request.inputBindings.map((binding) => {
    if (!allowedFields.includes(binding.fieldPath) || fields.has(binding.fieldPath) || binding.transformRevisionId !== undefined) invalid('unsupported, duplicate or transformed input binding');
    fields.add(binding.fieldPath);
    if (typeof binding.revisionId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(binding.revisionId)) invalid('exact pinned input revision required');
    const matches = artifacts.filter((item) => item.revisionId === binding.revisionId);
    if (matches.length !== 1 || !(matches[0].bytes instanceof Uint8Array) || matches[0].mediaType !== 'text/plain') invalid('one pinned text artifact required for each input');
    const artifact = matches[0];
    if (artifact.contentHash !== undefined && artifact.contentHash !== sha256(artifact.bytes)) invalid('pinned artifact bytes do not match content hash');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes); } catch { invalid('pinned text must be UTF-8'); }
    if (request.parameters[binding.fieldPath] !== text) invalid('actual provider field differs from pinned text');
    return { fieldPath: binding.fieldPath, revisionId: binding.revisionId };
  });
}
