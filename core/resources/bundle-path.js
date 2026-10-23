import { FolioError } from '../errors.js';

/** The shared logical member namespace; validation never reads a filesystem path. */
export function assertBundlePath(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value || /[\\\0:]/.test(value) || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new FolioError('BUNDLE_INVALID', 'normalized relative member path required');
  }
}
