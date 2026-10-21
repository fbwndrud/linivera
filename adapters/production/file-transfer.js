import { isAbsolute, resolve } from 'node:path';
import { invalid } from './common.js';
export const MAX_INLINE_CAPTURE_BYTES = 8 * 1024 * 1024;

/** Actual file import and streaming hash verification remain at the host's Resource seam. */
export function capturedFile(value) {
  if (value instanceof Uint8Array) {
    if (value.byteLength > MAX_INLINE_CAPTURE_BYTES) invalid('large captures require a local file descriptor');
    return { bytes: Buffer.from(value) };
  }
  if (!value || typeof value.path !== 'string' || !isAbsolute(value.path) || resolve(value.path) !== value.path || value.path.includes('\0')) invalid('normalized absolute local file descriptor required');
  if (value.contentHash !== undefined && !/^sha256:[a-f0-9]{64}$/.test(value.contentHash)) invalid('invalid expected file hash');
  return { path: value.path, ...(value.contentHash ? { contentHash: value.contentHash } : {}) };
}
