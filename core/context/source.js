import { FolioError } from '../errors.js';
import { readInputSelection } from '../resources/input-selections.js';
import { createResourceStore } from '../resources/revisions.js';
import { validateUsageContext } from '../resources/context-records.js';

export async function contextSource(root, input, coverage) {
  let revisionId = input.contextRevisionId;
  if (revisionId === undefined) {
    let selection = await readInputSelection(root, input.scopeId);
    let bindings = selection?.bindings.filter((binding) => binding.role === 'context') ?? [];
    if (bindings.length !== 1) {
      coverage.unknown.push({ reason: bindings.length ? 'multiple context bindings require an explicit context revision' : 'no user selected context for this scope' });
      return null;
    }
    selection = await readInputSelection(root, input.scopeId, { validateDependencies: true, bindingKeys: [bindings[0].bindingKey] });
    bindings = selection?.bindings.filter((binding) => binding.role === 'context') ?? [];
    if (bindings.length !== 1) throw new FolioError('CONTEXT_SCOPE_MISMATCH', 'context selection changed during recovery');
    revisionId = bindings[0].revisionId;
  }
  const store = createResourceStore(root);
  let revision;
  try { revision = await store.readRevision(revisionId); }
  catch (error) {
    if (error.code !== 'RESOURCE_OBJECT_MISSING') throw error;
    coverage.missing.push({ revisionId, reason: 'context revision is unavailable' }); return null;
  }
  if (revision.kind !== 'usage-context' || revision.mediaType !== 'application/json' || revision.storageStatus !== 'owned_snapshot') throw new FolioError('CONTEXT_INVALID', 'exact owned usage-context required');
  const value = validateUsageContext(JSON.parse((await store.readContent(revision.revisionId)).toString('utf8')));
  if (value.scopeId !== input.scopeId || (input.pathId !== undefined && value.pathId !== input.pathId) || (input.timeLabel !== undefined && value.timeLabel !== input.timeLabel)) throw new FolioError('CONTEXT_SCOPE_MISMATCH', 'context belongs to another scope, path or time');
  return { revision, value };
}
