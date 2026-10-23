import { withWorkspaceStateTransaction, readWorkspaceState } from '../publications/state.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';
import { authorize } from '../policy/validate.js';
import { createResourceStore } from './revisions.js';
import { assertResourceId, assertRevisionId } from './schema.js';
import { readInputDefinitions, assertInputScope, sourceDependency, invalidInput } from './input-definitions.js';
export function bindingDigest(binding) { return sha256(canonicalJson(binding)); }
/** @param {string} root @param {string} scopeId @param {{checkpoint?:{seq:number,hash:string},validateDependencies?:boolean,bindingKeys?:string[]}} [options] */
export async function readInputSelection(root, scopeId, options = {}) {
  assertResourceId(scopeId);
  const state = await readWorkspaceState(root, options); const selection = state.inputSelections[scopeId] ?? null;
  if (selection) {
    validateBindings(selection.bindings); if (selection.actor !== 'user') invalidInput('user scope selection required');
    if (options.validateDependencies) {
      if (options.bindingKeys && (!options.bindingKeys.length || options.bindingKeys.some((key) => !selection.bindings.some((binding) => binding.bindingKey === key)))) invalidInput('dependency validation requires existing binding keys');
      for (const binding of selection.bindings.filter((binding) => !options.bindingKeys || options.bindingKeys.includes(binding.bindingKey))) scopedDependencies(state, scopeId, binding);
    }
  }
  return selection;
}
export function validateBindings(bindings) {
  if (!Array.isArray(bindings) || !bindings.length || bindings.length > 4096) invalidInput('nonempty bounded bindings required');
  const keys = new Set();
  for (const binding of bindings) {
    if (!binding || Object.keys(binding).some((key) => !['bindingKey', 'role', 'resourceId', 'revisionId', 'mode', 'sourceScopeId', 'sourceBindingKey'].includes(key))) invalidInput('unsupported input binding fields');
    for (const key of ['bindingKey', 'role', 'resourceId']) assertResourceId(binding[key]); assertRevisionId(binding.revisionId);
    if (keys.has(binding.bindingKey) || !['fixed', 'global', 'scoped'].includes(binding.mode)) invalidInput('unique binding keys and explicit selection mode required');
    keys.add(binding.bindingKey);
    if ((binding.sourceScopeId === undefined) !== (binding.sourceBindingKey === undefined) || (binding.mode !== 'scoped' && binding.sourceScopeId !== undefined)) invalidInput('source scope and binding must be a scoped pair');
    if (binding.sourceScopeId !== undefined) { assertResourceId(binding.sourceScopeId); assertResourceId(binding.sourceBindingKey); }
  }
}
/** Resolve exact per-binding dependencies without depending on unrelated scope entries. */
export function scopedDependencies(state, scopeId, binding, visited = new Set(), asSource = false) {
  const marker = state.inputSelections[scopeId];
  if (!marker) invalidInput('scope selection is missing');
  const key = scopeId + ':' + binding.bindingKey;
  if (visited.has(key) || visited.size >= 32) invalidInput('cyclic or excessively nested scoped selection'); visited.add(key);
  const own = { mode: 'scoped', scopeId, bindingKey: binding.bindingKey, revisionId: binding.revisionId, selectionRevision: marker.scopeSelectionRevision, bindingDigest: bindingDigest(binding) };
  if (binding.mode === 'fixed') {
    const fixed = { mode: 'fixed', scopeId, bindingKey: binding.bindingKey, revisionId: binding.revisionId, bindingDigest: bindingDigest(binding) };
    return asSource ? [own, fixed] : [fixed];
  }
  if (binding.mode === 'global') {
    const selection = state.sourceSelections[binding.resourceId];
    if (!selection || selection.revisionId !== binding.revisionId || selection.action?.type !== 'select' || selection.action?.actor !== 'user') invalidInput('global binding differs from user selection');
    return [own, { mode: 'global', resourceId: binding.resourceId, revisionId: binding.revisionId, selectionRevision: selection.selectionRevision }];
  }
  if (binding.sourceScopeId === undefined) return [own];
  const source = state.inputSelections[binding.sourceScopeId]?.bindings.find((candidate) => candidate.bindingKey === binding.sourceBindingKey);
  if (!source || source.resourceId !== binding.resourceId || source.revisionId !== binding.revisionId) invalidInput('scoped source must bind the exact resource revision');
  return [own, ...scopedDependencies(state, binding.sourceScopeId, source, visited, true)];
}
export async function selectInput(root, input) {
  input = JSON.parse(canonicalJson(input));
  if (!input || Object.keys(input).some((key) => !['scopeId', 'expectedScopeSelectionRevision', 'actor', 'reason', 'bindings', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId'].includes(key)) || !Object.hasOwn(input, 'expectedScopeSelectionRevision') || input.actor !== 'user' || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 4096) invalidInput('explicit user selection, reason and expected scope revision required');
  assertResourceId(input.scopeId); validateBindings(input.bindings);
  return withWorkspaceStateTransaction(root, async ({ state, append }) => {
    if ((state.inputSelections[input.scopeId]?.scopeSelectionRevision ?? null) !== input.expectedScopeSelectionRevision) throw new FolioError('INPUT_SELECTION_CONFLICT', 'scope selection changed');
    const { definitions } = await readInputDefinitions(root, input, state); const store = createResourceStore(root);
    const provisional = { ...state, inputSelections: { ...state.inputSelections, [input.scopeId]: { ...input, scopeSelectionRevision: 'pending' } } };
    for (const binding of input.bindings) {
      const revision = await store.readRevision(binding.revisionId);
      if (revision.resourceId !== binding.resourceId) invalidInput('binding resource and revision differ');
      assertInputScope(definitions, revision.resourceId);
      if (binding.mode === 'global') sourceDependency(revision, state);
      scopedDependencies(provisional, input.scopeId, binding);
    }
    authorize(definitions.policy.value, { actor: 'user', action: 'select-source', resourceIds: [...new Set(input.bindings.map((binding) => binding.resourceId))], now: Date.now(), grantState: undefined,
      policyRevisionId: input.policyRevisionId, profileRevisionId: input.profileRevisionId, pipelineRevisionId: input.pipelineRevisionId, definitionHashes: { profile: definitions.profile.definitionHash, pipeline: definitions.pipeline.definitionHash } });
    const checkpoint = await append({ kind: 'input-selection', payload: input });
    return { scopeId: input.scopeId, scopeSelectionRevision: checkpoint.hash, checkpoint, bindings: input.bindings };
  });
}
