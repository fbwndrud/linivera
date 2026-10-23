import { canonicalJson } from '../util/hash.js';
import { createResourceStore } from '../resources/revisions.js';
import { bindingDigest, scopedDependencies, validateBindings } from '../resources/input-selections.js';
import { readWorkspaceState } from '../publications/state.js';
import { FolioError } from '../errors.js';
import { invalidReadiness } from './records.js';

/** Scope bindings override the global choice per Resource, preserving multiple exact fixed revisions. */
export async function readReadinessSelections(root, input, state, resourceIds) {
  const store = createResourceStore(root); const selection = state.inputSelections[input.scopeId];
  if (selection) {
    validateBindings(selection.bindings);
    if (selection.actor !== 'user') invalidReadiness('scope selection must be caller-attested user selection');
  }
  const selected = [];
  for (const resourceId of resourceIds) {
    const bindings = selection?.bindings.filter((binding) => binding.resourceId === resourceId) ?? [];
    if (bindings.length) {
      for (const binding of bindings) {
        if ((await store.readRevision(binding.revisionId)).resourceId !== resourceId) invalidReadiness('scope binding revision identity differs');
        selected.push({ resourceId, revisionId: binding.revisionId, basis: 'scoped', bindingKey: binding.bindingKey, mode: binding.mode,
          dependencies: scopedDependencies(state, input.scopeId, binding) });
      }
    } else {
      const marker = state.sourceSelections[resourceId];
      if (marker?.revisionId) selected.push({ resourceId, revisionId: marker.revisionId, basis: 'global', selectionRevision: marker.selectionRevision });
    }
  }
  return selected;
}
function dependencyMeaning(rows) {
  return rows.map((row) => {
    const meaning = { ...row }; delete meaning.selectionRevision;
    return row.mode === 'global' ? row : meaning;
  });
}
function stale() { throw new FolioError('CAPABILITY_READINESS_STALE', 'Scoped input selection changed. Compare the current exact bindings before starting new work.'); }
/** Only a verified v2 manifest's actual fixed/scoped consumption can override global freshness. */
export async function hasCurrentScopedConsumption(root, input, revisionId, manifest, state) {
  if (manifest?.version !== 2 || manifest.scopeId !== input.scopeId || !manifest.resources.some((row) => row.revisionId === revisionId)) return false;
  const dependencies = (manifest.selectionDependencies ?? []).filter((row) => ['fixed', 'scoped'].includes(row.mode) && row.scopeId === input.scopeId && row.revisionId === revisionId);
  if (!dependencies.length) return false;
  const historical = await readWorkspaceState(root, { checkpoint: manifest.workspaceCheckpoint });
  let pinned = false;
  for (const dependency of dependencies) {
    const original = historical.inputSelections[input.scopeId]?.bindings.find((binding) => binding.bindingKey === dependency.bindingKey);
    if (!original) stale();
    const current = state.inputSelections[input.scopeId]?.bindings.find((binding) => binding.bindingKey === dependency.bindingKey);
    if (!current || bindingDigest(original) !== dependency.bindingDigest || bindingDigest(current) !== dependency.bindingDigest) stale();
    try {
      const priorDependencies = scopedDependencies(historical, input.scopeId, original);
      const currentDependencies = scopedDependencies(state, input.scopeId, current);
      if (canonicalJson(dependencyMeaning(priorDependencies)) !== canonicalJson(dependencyMeaning(currentDependencies))) stale();
    } catch { stale(); }
    if (original.mode !== 'global') pinned = true;
  }
  return pinned;
}
/** A report's own related scoped evidence must retain the same binding meaning. */
export function assertReportedScopeCurrent(value, revisionId, state) {
  for (const row of value.search.selected.filter((entry) => entry.basis === 'scoped' && entry.revisionId === revisionId)) {
    const current = state.inputSelections[value.input.scopeId]?.bindings.find((binding) => binding.bindingKey === row.bindingKey);
    if (!current || current.revisionId !== revisionId) stale();
    try {
      if (canonicalJson(dependencyMeaning(row.dependencies)) !== canonicalJson(dependencyMeaning(scopedDependencies(state, value.input.scopeId, current)))) stale();
    } catch { stale(); }
  }
}
