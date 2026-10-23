import { FolioError } from '../errors.js';
import { createResourceStore } from '../resources/revisions.js';
import { validateCapabilityRequest } from '../../packs/production/capabilities.js';
import { READINESS_KIND, SPECIFICATION_KIND, readTypedJson } from './records.js';

/** Retained v1 facts keep their meaning; they cannot authorize a request rejected by today's contract. */
export async function assertReadinessRequestContract(root, report) {
  const input = report.input ?? report;
  const specification = await readTypedJson(root, input.specificationRevisionId ?? input.capabilitySpecificationRevisionId, SPECIFICATION_KIND);
  const request = await readTypedJson(root, input.requestRevisionId, 'generation-request');
  try { validateCapabilityRequest(specification.value, request.value); }
  catch { throw new FolioError('CAPABILITY_INPUTS_INCOMPLETE', 'Compare the exact request against the current capability contract before new work.'); }
}
export async function assertInputReadinessContracts(root, manifest) {
  const store = createResourceStore(root);
  for (const row of manifest.resources) {
    const revision = await store.readRevision(row.revisionId);
    if ([READINESS_KIND, 'connection-check', 'connection-readiness'].includes(revision.kind)) await assertReadinessRequestContract(root, (await readTypedJson(root, row.revisionId, revision.kind)).value);
  }
}
