import { FolioError } from '../errors.js';
import { createResourceStore } from '../resources/revisions.js';
import { contextInvalid, usageStateRevisionId } from '../resources/context-records.js';
import { verifyStructureMap } from '../resources/structure-bindings.js';

const SUBJECT_KEY = /^\/subjects\/\d+\/hint$/;

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
const unmappedRequired = (map) => map.structure.references.some((ref) => ref.required && !map.bindings.some((binding) => binding.referenceKey === ref.key));

/**
 * Check declared roles against exact retained revisions. Rejects wrong types or records whose
 * subject is another revision; never adds context, follows reverse relations or treats a record as approval.
 * Status: provided, unknown, absent, unverified (bound role has no state) or incomplete (required map slot unmapped).
 */
export async function evaluateRequirements(root, context) {
  if (!context.requirements) return [];
  const store = createResourceStore(root); const declared = new Map(context.requirements.map((row) => [row.role, row]));
  const rows = new Map(context.requirements.map((row) => [row.role, { role: row.role, required: row.required, status: 'absent', revisionIds: [], stateIndexes: [], incompleteIndexes: [] }]));
  const targets = (role) => context.states.filter((state) => state.role === role && state.status !== 'unknown').map(usageStateRevisionId);
  const weaker = (row, status) => { if (row.status !== 'provided' && row.status !== 'incomplete') row.status = status; };
  for (const [index, state] of context.states.entries()) {
    const requirement = declared.get(state.role); const row = rows.get(state.role);
    if (!requirement) continue;
    if (state.status === 'unknown') { if (row.status === 'absent') row.status = 'unknown'; continue; }
    const revisionId = usageStateRevisionId(state); const revision = await store.readRevision(revisionId);
    const map = await readMap(root, revision);
    if (requirement.accepts && !accepts(revision, map, requirement.accepts)) contextInvalid(`context role ${state.role} names a resource of another type`);
    if (requirement.bindsRole) {
      const expected = targets(requirement.bindsRole);
      if (expected.length > 1) contextInvalid(`bindsRole ${requirement.bindsRole} needs exactly one exact state`);
      if (!expected.length) { weaker(row, 'unverified'); continue; }
      // Only the record's subject counts; an evidence slot naming the same revision does not.
      if (!map?.bindings.some((binding) => SUBJECT_KEY.test(binding.referenceKey) && binding.revisionId === expected[0])) contextInvalid(`context role ${state.role} is a record about another revision than ${requirement.bindsRole}`);
    }
    if (map && unmappedRequired(map)) { row.status = row.status === 'provided' ? 'provided' : 'incomplete'; row.incompleteIndexes.push(index); continue; }
    row.status = 'provided'; row.revisionIds.push(revisionId); row.stateIndexes.push(index);
  }
  return [...rows.values()];
}
/** Join evaluated roles with the items a package actually provides. */
export function coverRequirements(rows, items, coverage) {
  const included = new Set(items.map((item) => item.contextStateIndex).filter((index) => index !== undefined));
  const missing = rows.filter((row) => row.required && !row.stateIndexes.some((index) => included.has(index))).map((row) => row.role);
  const incomplete = rows.filter((row) => row.incompleteIndexes.some((index) => included.has(index))).map((row) => row.role);
  const requirements = rows.map(({ stateIndexes, incompleteIndexes: _incomplete, ...row }) => {
    const present = stateIndexes.some((index) => included.has(index));
    const absent = row.revisionIds.some((id) => coverage.missing.some((entry) => entry.revisionId === id)) ? 'missing' : 'truncated';
    return { ...row, status: row.status === 'provided' && !present ? absent : row.status, included: present };
  });
  return { requirements, missing, ready: !missing.length && !incomplete.length };
}
export function assertRequirementsMet(missing) {
  if (missing.length) throw new FolioError('CONTEXT_REQUIRED_MISSING', 'Provide every required context role before fixing the next input. Linked records are not approvals.', { missing });
}
/** Reject records of the wrong type or subject when a usage context is retained. */
export async function verifyRequirementRecords(root, context) { await evaluateRequirements(root, context); }
/** A usage context with declared requirements cannot become input until each required role is provided. */
export async function assertContextRequirements(root, context) {
  const rows = await evaluateRequirements(root, context);
  assertRequirementsMet(rows.filter((row) => row.required && row.status !== 'provided').map((row) => row.role));
}
