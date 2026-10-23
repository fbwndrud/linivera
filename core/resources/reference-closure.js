import { createResourceStore } from './revisions.js';
import { FolioError } from '../errors.js';
/** Validate actual request references against already selected, scoped, budgeted input. */
export async function verifyRequestClosure(root, manifest, request) {
  const revisions = new Set([...manifest.resources.map((resource) => resource.revisionId), ...Object.values(manifest.definitions).map((definition) => definition.revisionId)]);
  const refs = new Set();
  function walk(value, key = '') {
    if (typeof value === 'string' && (key.endsWith('RevisionId') || key === 'revisionId')) refs.add(value);
    if (Array.isArray(value)) for (const child of value) {
      if (typeof child === 'string' && (key.endsWith('RevisionIds') || ['baseRevisionIds', 'preserveRefs'].includes(key))) refs.add(child);
      else walk(child);
    }
    else if (value && typeof value === 'object') for (const [name, child] of Object.entries(value)) walk(child, name);
  }
  walk(request);
  for (const revisionId of refs) {
    if (!revisions.has(revisionId)) throw new FolioError('INPUT_REFERENCE_OUTSIDE_SNAPSHOT', 'request reference is not pinned in input');
    await createResourceStore(root).readRevision(revisionId);
  }
  return { revisionIds: [...refs].sort() };
}
