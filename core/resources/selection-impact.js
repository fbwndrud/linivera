import { bindingDigest } from './input-selections.js';
/** Marker revisions prove history; scoped drift follows the binding meaning, not its container marker. */
export function scopedSelectionChanges(manifest, state) {
  return (manifest.selectionDependencies ?? []).flatMap((dependency) => {
    if (dependency.mode === 'fixed') return [];
    if (dependency.mode === 'global') {
      const current = state.sourceSelections[dependency.resourceId];
      return current?.selectionRevision === dependency.selectionRevision ? [] : [{ resourceId: dependency.resourceId, inputRevisionId: dependency.revisionId, inputSelectionRevision: dependency.selectionRevision, currentRevisionId: current?.revisionId ?? null, reason: 'source-selection-changed' }];
    }
    const current = state.inputSelections[dependency.scopeId]?.bindings.find((binding) => binding.bindingKey === dependency.bindingKey);
    return current && bindingDigest(current) === dependency.bindingDigest ? [] : [{ scopeId: dependency.scopeId, bindingKey: dependency.bindingKey,
      resourceId: manifest.resources.find((revision) => revision.revisionId === dependency.revisionId)?.resourceId ?? current?.resourceId ?? null,
      inputRevisionId: dependency.revisionId, inputSelectionRevision: dependency.selectionRevision, currentRevisionId: current?.revisionId ?? null, reason: 'scoped-selection-changed' }];
  });
}
