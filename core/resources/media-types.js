import { FolioError } from '../errors.js';

export function assertMediaType(value) {
  if (typeof value !== 'string' || value.length > 255 || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(value)) {
    throw new FolioError('RESOURCE_MEDIA_UNSUPPORTED', 'a normalized MIME type without parameters is required');
  }
}
export function contentValidation(envelope) {
  const textual = envelope.version === 1 && ['text/plain', 'application/json'].includes(envelope.mediaType);
  return { bytes: envelope.storageStatus === 'owned_snapshot' ? 'verified' : 'unobserved',
    format: textual ? 'validated' : 'opaque', level: textual ? (envelope.mediaType === 'application/json' ? 'json-syntax' : 'utf8') : 'bytes-only' };
}
