import { createResourceStore } from '../resources/revisions.js';
import { exactFact } from './records.js';

function unknown(reason) { return { status: 'unknown', reason }; }
/** Only retained bytes and syntax are observations. MIME and role are declarations. */
export async function inspectCandidate(root, revision) {
  const facts = exactFact(revision);
  const observed = { bytes: revision.storageStatus === 'owned_snapshot' ? 'verified' : 'unobserved' };
  if (revision.storageStatus === 'owned_snapshot' && revision.byteLength <= 8 * 1024 * 1024 && ['text/plain', 'application/json'].includes(revision.mediaType)) {
    const bytes = await createResourceStore(root).readContent(revision.revisionId);
    try { const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); observed.utf8 = true; observed.textLength = text.length;
      if (revision.mediaType === 'application/json') { JSON.parse(text); observed.jsonSyntax = true; }
    } catch { observed.syntax = 'invalid'; }
  }
  return { ...facts, observed, declarations: { mediaType: revision.mediaType ?? null, kind: revision.kind },
    rights: unknown('No rights evidence has been interpreted by this comparison.'), semanticFit: unknown('Content meaning and task suitability have not been verified.') };
}
export function candidateForRequirement(candidate, requirement, request) {
  const reasons = []; const pending = [];
  const binding = request.inputBindings.find((row) => row.fieldPath === requirement.fieldPath && (row.transformRevisionId ?? row.revisionId) === candidate.revisionId);
  const constraints = requirement.constraints ?? {};
  if (candidate.storageStatus !== 'owned_snapshot') pending.push('retained bytes unavailable');
  if (constraints.kinds && !constraints.kinds.includes(candidate.declarations.kind)) reasons.push('resource kind differs from required structural kind');
  if (constraints.maxBytes !== undefined && candidate.byteLength !== null && candidate.byteLength > constraints.maxBytes) reasons.push('observed byte length exceeds maximum');
  if (constraints.minBytes !== undefined && candidate.byteLength !== null && candidate.byteLength < constraints.minBytes) reasons.push('observed byte length is below minimum');
  if (constraints.mediaTypes && !constraints.mediaTypes.includes(candidate.mediaType)) reasons.push('declared MIME differs from accepted media types');
  if (requirement.source === 'file' && constraints.mediaTypes?.includes(candidate.mediaType)) pending.push('declared MIME does not prove file encoding or full validity');
  if (binding && binding.role !== requirement.role) reasons.push('request binding role differs from required role');
  if (candidate.observed.syntax === 'invalid') reasons.push('declared textual syntax is invalid');
  const measured = new Set(['kinds', 'maxBytes', 'minBytes', 'mediaTypes']);
  for (const key of Object.keys(constraints)) if (!measured.has(key)) pending.push(`${key} has not been observed`);
  return { revisionId: candidate.revisionId, contentHash: candidate.contentHash, status: reasons.length ? 'mismatch' : pending.length ? 'unknown' : 'candidate',
    selection: binding ? 'request-bound' : 'unselected-candidate',
    roleEvidence: binding ? { kind: 'request-declaration', attestation: 'caller-supplied-not-user-approval', fieldPath: binding.fieldPath, role: binding.role, originalRevisionId: binding.revisionId, consumedRevisionId: binding.transformRevisionId ?? binding.revisionId } : { kind: 'unknown' }, reasons, unknown: pending,
    proposedActions: [...reasons.map((reason) => ({ action: 'transform-or-acquire', reason })), ...pending.map((reason) => ({ action: 'verify', reason }))] };
}
