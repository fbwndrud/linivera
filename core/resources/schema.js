import { FolioError } from '../errors.js';
import { assertMediaType } from './media-types.js';

export const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
export const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
export function assertResourceId(id) {
  if (typeof id !== 'string' || !ID.test(id) || id === '.' || id === '..') throw new FolioError('RESOURCE_ID_INVALID', 'invalid resource identity');
}
export function assertRevisionId(id) {
  if (typeof id !== 'string' || !HASH_PATTERN.test(id)) throw new FolioError('RESOURCE_REVISION_INVALID', 'invalid revision hash');
}
export function validateProposal(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FolioError('RESOURCE_INVALID', 'proposal must be an object');
  const allowed = ['resourceId', 'kind', 'parents', 'owned', 'external', 'schemaRef'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new FolioError('RESOURCE_RESERVED_KEY', 'unknown or reserved envelope field');
  assertResourceId(input.resourceId);
  if (typeof input.kind !== 'string' || !ID.test(input.kind)) throw new FolioError('RESOURCE_INVALID', 'kind must be a safe name');
  if (input.schemaRef !== undefined && (typeof input.schemaRef !== 'string' || input.schemaRef.length > 2048)) throw new FolioError('RESOURCE_INVALID', 'invalid schemaRef');
  if (!Array.isArray(input.parents ?? []) || new Set(input.parents ?? []).size !== (input.parents ?? []).length) throw new FolioError('RESOURCE_PARENT_INVALID', 'parents must be unique revision ids');
  for (const parent of input.parents ?? []) assertRevisionId(parent);
  if (Boolean(input.owned) === Boolean(input.external)) throw new FolioError('RESOURCE_INVALID', 'exactly one storage source is required');
  if (input.owned) {
    if (Object.keys(input.owned).some((key) => !['bytes', 'mediaType'].includes(key))) throw new FolioError('RESOURCE_RESERVED_KEY', 'unknown owned field');
    assertMediaType(input.owned.mediaType);
    if (!['text/plain', 'application/json'].includes(input.owned.mediaType) && !(input.owned.bytes instanceof Uint8Array)) throw new FolioError('RESOURCE_CONTENT_INVALID', 'opaque media requires binary bytes');
    if (!(input.owned.bytes instanceof Uint8Array) && typeof input.owned.bytes !== 'string') throw new FolioError('RESOURCE_INVALID', 'bytes must be text or Uint8Array');
    const bytes = Buffer.from(input.owned.bytes);
    if (bytes.length > MAX_RESOURCE_BYTES) throw new FolioError('RESOURCE_TOO_LARGE', 'snapshot exceeds byte limit');
    if (['text/plain', 'application/json'].includes(input.owned.mediaType)) try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (input.owned.mediaType === 'application/json') JSON.parse(text);
    } catch { throw new FolioError('RESOURCE_CONTENT_INVALID', 'content must be valid UTF-8 and valid JSON when declared JSON'); }
  } else {
    if (Object.keys(input.external).some((key) => !['uri', 'reportedRevision'].includes(key))) throw new FolioError('RESOURCE_RESERVED_KEY', 'unknown external field');
    try {
      if (typeof input.external.uri !== 'string' || input.external.uri.length > 8192) throw new Error();
      new URL(input.external.uri);
    } catch { throw new FolioError('RESOURCE_INVALID', 'external URI must be absolute'); }
    if (input.external.reportedRevision !== undefined && (typeof input.external.reportedRevision !== 'string' || input.external.reportedRevision.length > 2048)) throw new FolioError('RESOURCE_INVALID', 'invalid reportedRevision');
  }
}
