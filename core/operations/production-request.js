import { createResourceStore } from '../resources/revisions.js';
import { verifyInput } from '../resources/input-snapshots.js';
import { verifyRequestClosure } from '../resources/reference-closure.js';
import { validateProductionRequest } from '../../packs/production/request-schema.js';
import { fail } from './objects.js';
const textFields = new Set(['prompt', 'text', 'previous_text', 'next_text']);
async function verifyTextBindings(store, value) {
  for (const binding of value.inputBindings) {
    if (!textFields.has(binding.fieldPath)) continue;
    const revisionId = binding.transformRevisionId ?? binding.revisionId;
    const revision = await store.readRevision(revisionId);
    const text = value.parameters[binding.fieldPath];
    if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'text/plain' || typeof text !== 'string'
      || !Buffer.from(text, 'utf8').equals(await store.readContent(revisionId))) fail('PRODUCTION_INPUT_BINDING_INVALID', 'text parameter must equal the exact owned input revision bytes');
  }
}
export function assertOperationContract(request, version) {
  if ((request.operationContractVersion ?? 1) !== version) fail('OPERATION_CONTRACT_MISMATCH', 'operation contract does not allow this API');
}
export async function readProductionRequest(root, request, pinnedManifest = undefined) {
  assertOperationContract(request, 2);
  const manifest = pinnedManifest ?? (await verifyInput(root, request.inputSnapshotId)).manifest;
  if (!manifest.resources.some((resource) => resource.revisionId === request.requestRevisionId)) fail('REQUEST_MISMATCH', 'generation request must be pinned in snapshot');
  const store = createResourceStore(root); const revision = await store.readRevision(request.requestRevisionId);
  if (revision.kind !== 'generation-request' || revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') fail('PRODUCTION_REQUEST_INVALID', 'owned generation request JSON required');
  const value = validateProductionRequest(JSON.parse((await store.readContent(request.requestRevisionId)).toString('utf8')));
  await verifyRequestClosure(root, manifest, value);
  await verifyTextBindings(store, value);
  return { value, manifest, revision };
}
