import { createResourceStore } from './revisions.js';
import { readInputDefinitions, assertInputScope, sourceDependency, invalidInput } from './input-definitions.js';
import { scopedDependencies, validateBindings } from './input-selections.js';
import { collectInputClosure } from './input-closure.js';
export async function buildInputManifestV2(root, input, state) {
  if (!input || input.version !== 2 || Object.keys(input).some((key) => !['version', 'scopeId', 'scopeSelectionRevision', 'bindingKeys', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId', 'externalMode'].includes(key)) || !['reject', 'reference-only'].includes(input.externalMode ?? 'reject')) invalidInput('unsupported v2 input fields');
  const selection = state.inputSelections[input.scopeId];
  if (!selection || selection.scopeSelectionRevision !== input.scopeSelectionRevision || selection.actor !== 'user') invalidInput('exact user scope selection required');
  validateBindings(selection.bindings);
  const bindingKeys = input.bindingKeys ?? selection.bindings.map((binding) => binding.bindingKey);
  if (!Array.isArray(bindingKeys) || !bindingKeys.length || new Set(bindingKeys).size !== bindingKeys.length || bindingKeys.some((key) => !selection.bindings.some((binding) => binding.bindingKey === key))) invalidInput('nonempty unique selected binding keys required');
  const bindings = bindingKeys.map((key) => selection.bindings.find((binding) => binding.bindingKey === key));
  const { definitions, selections } = await readInputDefinitions(root, input, state);
  const store = createResourceStore(root); const selectionDependencies = [];
  for (const binding of bindings) {
    const revision = await store.readRevision(binding.revisionId);
    if (revision.resourceId !== binding.resourceId) invalidInput('binding revision resource differs');
    selectionDependencies.push(...scopedDependencies(state, input.scopeId, binding));
  }
  const revisionIds = [...new Set(bindings.map((binding) => binding.revisionId))];
  const expanded = await collectInputClosure(root, revisionIds); const resources = [];
  const definitionIds = new Set(Object.values(definitions).map((definition) => definition.revisionId));
  let totalBytes = Object.values(definitions).reduce((total, definition) => total + definition.byteLength, 0);
  for (const revision of expanded) {
    assertInputScope(definitions, revision.resourceId);
    if (!revisionIds.includes(revision.revisionId)) {
      const retained = selection.bindings.filter((binding) => binding.revisionId === revision.revisionId && binding.resourceId === revision.resourceId);
      if (retained.length) for (const binding of retained) selectionDependencies.push(...scopedDependencies(state, input.scopeId, binding));
      else {
        const dependency = sourceDependency(revision, state); selections.push(dependency);
        selectionDependencies.push({ mode: 'global', ...dependency });
      }
    }
    if (revision.storageStatus === 'external_unobserved' && input.externalMode !== 'reference-only') invalidInput('external input requires explicit reference-only');
    resources.push({ resourceId: revision.resourceId, revisionId: revision.revisionId, contentHash: revision.contentHash, storageStatus: revision.storageStatus, byteLength: revision.byteLength ?? null, observation: revision.storageStatus === 'external_unobserved' ? 'reference-only' : 'folio-executed' });
    if (!definitionIds.has(revision.revisionId)) totalBytes += revision.byteLength ?? 0;
  }
  const maxInputBytes = Math.min(definitions.profile.value.maxInputBytes, definitions.policy.value.maxInputBytes ?? Number.MAX_SAFE_INTEGER);
  if (totalBytes > maxInputBytes) invalidInput('input exceeds byte budget');
  return { version: 2, scopeId: input.scopeId, scopeSelectionRevision: input.scopeSelectionRevision, bindingKeys, bindings, selectionDependencies,
    revisionIds, profileRevisionId: input.profileRevisionId, pipelineRevisionId: input.pipelineRevisionId, policyRevisionId: input.policyRevisionId,
    externalMode: input.externalMode ?? 'reject', workspaceCheckpoint: state.checkpoint, selections, resources, definitions,
    scope: [...new Set(resources.map((resource) => resource.resourceId))], totalBytes, maxInputBytes, byteBudgetComplete: resources.every((resource) => resource.byteLength !== null) };
}
