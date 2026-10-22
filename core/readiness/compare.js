import { canonicalJson } from '../util/hash.js';
import { readWorkspaceState } from '../publications/state.js';
import { readInputDefinitions, assertInputScope } from '../resources/input-definitions.js';
import { createResourceStore } from '../resources/revisions.js';
import { assertContextIsolation } from '../context/isolation.js';
import { validateCapabilityRequest, validateCapabilityValue } from '../../packs/production/capabilities.js';
import { validateReadinessInput, invalidReadiness, readTypedJson, exactFact, SPECIFICATION_KIND } from './records.js';
import { inspectCandidate, candidateForRequirement } from './candidates.js';
import { readReadinessSelections } from './selection.js';

function atPath(value, path) { return path.replace(/^parameters\./, '').split('.').reduce((node, key) => node?.[key], value.parameters); }
function requirementNeeded(row, request) {
  if (row.requirement !== 'conditional') return row.requirement === 'required';
  if (row.condition?.operator === 'absent') return atPath(request, row.condition.fieldPath) === undefined;
  return null;
}
function parameterResult(row, request, needed) {
  const value = atPath(request, row.fieldPath);
  if (value === undefined) return { status: needed === true ? 'missing' : needed === null ? 'unknown' : 'optional', evidence: 'request-parameter', reasons: ['parameter absent'] };
  try { validateCapabilityValue(row, value); return { status: 'provided', evidence: 'request-parameter', reasons: [] }; }
  catch (error) { return { status: 'mismatch', evidence: 'request-parameter', reasons: [error.message] }; }
}
/** Compare only a caller-declared bounded search of exact revisions; this never selects inputs. */
export async function buildCapabilityReadiness(root, input, state) {
  validateReadinessInput(input);
  const store = createResourceStore(root);
  const specification = await readTypedJson(root, input.specificationRevisionId, SPECIFICATION_KIND);
  const request = await readTypedJson(root, input.requestRevisionId, 'generation-request');
  const { definitions } = await readInputDefinitions(root, input, state);
  const scope = definitions.profile.value.scope.filter((id) => definitions.policy.value.scope.includes(id)).sort();
  const definitionsIds = new Set(Object.values(definitions).map((entry) => entry.revisionId));
  const candidates = [];
  for (const id of input.candidateRevisionIds) {
    const revision = await store.readRevision(id); assertInputScope(definitions, revision.resourceId);
    candidates.push(await inspectCandidate(root, revision));
  }
  const boundRevisionIds = [...new Set(request.value.inputBindings.flatMap((binding) => [binding.revisionId, binding.transformRevisionId].filter(Boolean)))];
  for (const id of [input.specificationRevisionId, input.requestRevisionId, ...boundRevisionIds]) assertInputScope(definitions, (await store.readRevision(id)).resourceId);
  await assertContextIsolation(root, [input.requestRevisionId, ...input.candidateRevisionIds, ...boundRevisionIds], input);
  const selected = (await readReadinessSelections(root, input, state, scope)).filter((row) => !definitionsIds.has(row.revisionId));
  const missingSelected = selected.filter((row) => !input.candidateRevisionIds.includes(row.revisionId));
  // Completeness refers exclusively to selected revisions in this exact profile/policy intersection.
  if (input.search.completeness === 'complete' && missingSelected.length) invalidReadiness('complete search must include every selected revision in the declared profile/policy scope');
  let requestValidation = { status: 'valid' };
  try { validateCapabilityRequest(specification.value, request.value); }
  catch (error) { requestValidation = { status: 'mismatch', code: error.code ?? 'CAPABILITY_REQUEST_INVALID', reason: error.message }; }
  const requirements = [];
  for (const row of specification.value.inputs) {
    const required = requirementNeeded(row, request.value);
    if (['text', 'parameter'].includes(row.source)) {
      const result = parameterResult(row, request.value, required);
      const binding = request.value.inputBindings.find((entry) => entry.fieldPath === row.fieldPath);
      if (binding) {
        const revision = await store.readRevision(binding.transformRevisionId ?? binding.revisionId);
        result.binding = exactFact(revision);
        if (binding.role !== row.role || revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'text/plain'
          || typeof atPath(request.value, row.fieldPath) !== 'string' || revision.byteLength !== Buffer.byteLength(atPath(request.value, row.fieldPath), 'utf8')
          || (await store.readContent(revision.revisionId)).toString('utf8') !== atPath(request.value, row.fieldPath)) {
          result.status = 'mismatch'; result.reasons.push('bound text role or exact retained UTF-8 bytes differ from request parameter');
        }
      }
      requirements.push({ fieldPath: row.fieldPath, role: row.role, source: row.source, required, ...result }); continue;
    }
    const matches = candidates.map((candidate) => candidateForRequirement(candidate, row, request.value));
    const status = matches.some((candidate) => candidate.status === 'candidate') ? 'candidates' : matches.some((candidate) => candidate.status === 'unknown') ? 'unknown'
      : matches.length ? 'mismatch' : input.search.completeness === 'complete' ? 'absent-in-searched-selection' : 'unknown-partial-search';
    requirements.push({ fieldPath: row.fieldPath, role: row.role, source: row.source, required, status, candidates: matches,
      selectedCandidateRevisionIds: matches.filter((candidate) => candidate.status === 'candidate' && candidate.selection === 'request-bound').map((candidate) => candidate.revisionId),
      absenceMeaning: 'Only the declared selected-revision search was checked; unselected resources and external holdings are not covered.' });
  }
  const consumed = await Promise.all(boundRevisionIds.map(async (id) => exactFact(await store.readRevision(id))));
  const totalBytes = [...new Map([...consumed, exactFact(specification.revision), exactFact(request.revision), ...Object.values(definitions)].map((row) => [row.revisionId, row])).values()].reduce((sum, row) => sum + (row.byteLength ?? 0), 0);
  const maxInputBytes = Math.min(definitions.profile.value.maxInputBytes, definitions.policy.value.maxInputBytes ?? Number.MAX_SAFE_INTEGER);
  return { version: 1, input, workspaceCheckpoint: state.checkpoint, specification: exactFact(specification.revision), request: exactFact(request.revision),
    definitions: Object.fromEntries(Object.entries(definitions).map(([kind, value]) => [kind, { revisionId: value.revisionId, contentHash: value.contentHash, definitionHash: value.definitionHash }])),
    search: { ...input.search, basis: 'scope-bindings-with-global-fallback-in-profile-policy-intersection', resourceIds: scope, selected, omittedSelected: missingSelected,
      unselectedAndExternalHoldings: 'not-searched', freshness: 'at-workspace-checkpoint' },
    candidates, boundRevisionIds, requirements, requestValidation,
    readiness: { canPrepare: requestValidation.status === 'valid' && requirements.every((row) => {
      const supplied = atPath(request.value, row.fieldPath) !== undefined || request.value.inputBindings.some((binding) => binding.fieldPath === row.fieldPath);
      return !supplied && row.required !== true || row.status === 'provided' || row.status === 'candidates' && row.selectedCandidateRevisionIds.length > 0;
    }) && totalBytes <= maxInputBytes },
    budget: { observedBytes: totalBytes, maxInputBytes, withinObservedBudget: totalBytes <= maxInputBytes, complete: candidates.every((row) => row.byteLength !== null),
      meaning: 'Exact request bindings and definitions are a lower bound; the complete final input closure is independently budgeted before execution.' },
    decision: { candidateDiscoveryOnly: true, inputSelection: 'not-performed', internalExecutionAuthority: 'not-granted', rights: 'unknown',
      meaning: 'Candidates describe structural facts and caller-declared roles. They are not content, rights, or execution approval.' } };
}
export async function compareCapabilityReadiness(root, input) {
  const copied = JSON.parse(canonicalJson(input));
  return buildCapabilityReadiness(root, copied, await readWorkspaceState(root));
}
export async function retainCapabilityReadiness(root, { resourceId, ...input }) {
  const report = await compareCapabilityReadiness(root, input);
  return createResourceStore(root).propose({ resourceId, kind: 'capability-readiness', owned: { bytes: canonicalJson(report), mediaType: 'application/json' } });
}
