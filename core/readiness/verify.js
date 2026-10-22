import { canonicalJson } from '../util/hash.js';
import { readWorkspaceState } from '../publications/state.js';
import { createResourceStore } from '../resources/revisions.js';
import { FolioError } from '../errors.js';
import { buildCapabilityReadiness } from './compare.js';
import { invalidReadiness, READINESS_KIND, SPECIFICATION_KIND, readTypedJson, readinessInputReferences, readinessEvidenceReferences } from './records.js';
import { validateCapabilitySpec } from '../../packs/production/capabilities.js';

/** Rebuild a report against its retained ledger prefix, never against today's selections. */
export async function verifyCapabilityReadiness(root, value) {
  if (!value || value.version !== 1 || !value.input || !value.workspaceCheckpoint) invalidReadiness('versioned readiness report with exact checkpoint required');
  const state = await readWorkspaceState(root, { checkpoint: value.workspaceCheckpoint });
  const expected = await buildCapabilityReadiness(root, value.input, state);
  if (canonicalJson(expected) !== canonicalJson(value)) invalidReadiness('report differs from exact specification, retained evidence or historical scope');
  return readinessInputReferences(value);
}
export async function verifyReadinessResource(root, input) {
  if (![READINESS_KIND, SPECIFICATION_KIND].includes(input.kind)) return;
  if (input.owned?.mediaType !== 'application/json') invalidReadiness('specification and readiness require owned JSON');
  const value = JSON.parse(Buffer.from(input.owned.bytes).toString('utf8'));
  if (input.kind === SPECIFICATION_KIND) validateCapabilitySpec(value);
  else await verifyCapabilityReadiness(root, value);
}
export async function readReadinessReferences(root, revision) {
  if (revision.kind === SPECIFICATION_KIND) { await readTypedJson(root, revision.revisionId, SPECIFICATION_KIND); return []; }
  if (revision.kind !== READINESS_KIND) return [];
  const { value } = await readTypedJson(root, revision.revisionId, READINESS_KIND);
  return verifyCapabilityReadiness(root, value);
}
export async function readReadinessRelations(root, revision) {
  if (revision.kind !== READINESS_KIND) return [];
  const { value } = await readTypedJson(root, revision.revisionId, READINESS_KIND);
  const provided = await verifyCapabilityReadiness(root, value);
  return [...provided.map((targetRevisionId) => ({ targetRevisionId, kind: 'context-input' })),
    ...readinessEvidenceReferences(value).map((targetRevisionId) => ({ targetRevisionId, kind: 'context-evidence' }))];
}
/** Fresh operations recompare changed inputs; historical sealed inputs remain independently verifiable. */
export async function assertReadinessCurrent(root, revisionId) {
  const { value } = await readTypedJson(root, revisionId, READINESS_KIND);
  await verifyCapabilityReadiness(root, value);
  const store = createResourceStore(root); const state = await readWorkspaceState(root);
  const prior = await readWorkspaceState(root, { checkpoint: value.workspaceCheckpoint });
  const refs = [...readinessInputReferences(value), ...readinessEvidenceReferences(value)];
  for (const id of refs) {
    const revision = await store.readRevision(id);
    const current = state.sourceSelections[revision.resourceId];
    const historical = prior.sourceSelections[revision.resourceId];
    if (historical?.revisionId === id && current?.revisionId !== id) throw new FolioError('CAPABILITY_READINESS_STALE', 'Selected evidence changed. Compare the current exact revisions before starting new work.');
    if (readinessInputReferences(value).includes(id) && current?.revisionId && current.revisionId !== id) throw new FolioError('CAPABILITY_READINESS_STALE', 'Selected capability inputs changed. Compare the current exact revisions before starting new work.');
  }
}

export async function assertReadinessRequirements(root, revisionId) {
  const { value } = await readTypedJson(root, revisionId, READINESS_KIND);
  await verifyCapabilityReadiness(root, value);
  if (!value.readiness.canPrepare) throw new FolioError('CAPABILITY_INPUTS_INCOMPLETE', 'Resolve required capability inputs and request mismatches before preparing input.');
}

/** A report for another request cannot authorize the request actually sent to an adapter. */
export async function assertReadinessForRequest(root, manifest, requestRevisionId) {
  const store = createResourceStore(root); const reports = [];
  for (const row of manifest.resources) {
    const revision = await store.readRevision(row.revisionId);
    if (revision.kind === READINESS_KIND) reports.push((await readTypedJson(root, revision.revisionId, READINESS_KIND)).value);
  }
  if (!reports.length) return;
  const matching = reports.filter((value) => value.input.requestRevisionId === requestRevisionId);
  if (!matching.length) throw new FolioError('CAPABILITY_READINESS_REQUEST_MISMATCH', 'The prepared comparison must name the exact generation request being started.');
  for (const report of matching) {
    await verifyCapabilityReadiness(root, report);
    if (!report.readiness.canPrepare) throw new FolioError('CAPABILITY_INPUTS_INCOMPLETE', 'Resolve required inputs before starting this request.');
  }
}
