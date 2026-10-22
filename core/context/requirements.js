import { FolioError } from '../errors.js';
import { createResourceStore } from '../resources/revisions.js';
import { contextInvalid, usageContextReferences } from '../resources/context-records.js';
import { verifyStructureMap } from '../resources/structure-bindings.js';

const stateRevisionId = (state) => state.artifactRevisionId ?? usageContextReferences({ states: [state] })[0];

async function readMap(root, revision) {
  if (revision.kind !== 'structure-map' || revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') return null;
  const value = JSON.parse((await createResourceStore(root).readContent(revision.revisionId)).toString('utf8'));
  await verifyStructureMap(root, value); return value;
}
function accepts(revision, map, accepted) {
  const recordType = map?.structure.units.find((unit) => unit.id === '/')?.recordType;
  return accepted.some((row) => row.kind === revision.kind && (row.format === undefined || map?.format === row.format)
    && (row.recordType === undefined || recordType === row.recordType));
}

/**
 * Check declared roles against exact retained revisions. Rejects wrong types or records for
 * another revision; never adds context, follows reverse relations or treats a record as approval.
 */
export async function evaluateRequirements(root, context) {
  if (!context.requirements) return [];
  const store = createResourceStore(root); const declared = new Map(context.requirements.map((row) => [row.role, row]));
  const rows = new Map(context.requirements.map((row) => [row.role, { role: row.role, required: row.required, status: 'absent', revisionIds: [], stateIndexes: [] }]));
  const targets = (role) => context.states.filter((state) => state.role === role && state.status !== 'unknown').map(stateRevisionId);
  for (const [index, state] of context.states.entries()) {
    const requirement = declared.get(state.role); const row = rows.get(state.role);
    if (!requirement) continue;
    if (state.status === 'unknown') { if (row.status === 'absent') row.status = 'unknown'; continue; }
    const revisionId = stateRevisionId(state); const revision = await store.readRevision(revisionId);
    const map = requirement.accepts || requirement.bindsRole ? await readMap(root, revision) : null;
    if (requirement.accepts && !accepts(revision, map, requirement.accepts)) contextInvalid(`context role ${state.role} names a resource of another type`);
    if (requirement.bindsRole) {
      const expected = targets(requirement.bindsRole);
      if (!map) contextInvalid(`context role ${state.role} must be a structure map that binds ${requirement.bindsRole}`);
      if (expected.length && !map.bindings.some((binding) => expected.includes(binding.revisionId))) contextInvalid(`context role ${state.role} binds another revision than ${requirement.bindsRole}`);
      if (!expected.length) { if (row.status !== 'provided') row.status = 'unverified'; continue; }
    }
    row.status = 'provided'; row.revisionIds.push(revisionId); row.stateIndexes.push(index);
  }
  return [...rows.values()];
}
export function requiredMissing(rows, included = () => true) {
  return rows.filter((row) => row.required && (row.status !== 'provided' || !row.stateIndexes.some(included))).map((row) => row.role);
}
export function assertRequirementsMet(missing) {
  if (missing.length) throw new FolioError('CONTEXT_REQUIRED_MISSING', 'Provide every required context role before fixing the next input. Linked records are not approvals.', { missing });
}
/** A usage context with declared requirements cannot become input until each required role is provided. */
export async function assertContextRequirements(root, context) {
  assertRequirementsMet(requiredMissing(await evaluateRequirements(root, context)));
}
