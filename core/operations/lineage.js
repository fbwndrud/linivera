import { join } from 'node:path';
import { canonicalJson } from '../util/hash.js';
import { objectIds } from '../resources/catalog.js';
import { verifyInput } from '../resources/input-snapshots.js';
import { readOperation, outputBindings } from './requests.js';
import { get, fail } from './objects.js';
import { productionLineage } from './production-lineage.js';
import { scopedSelectionChanges } from '../resources/selection-impact.js';

/** All submitted producers, including those whose outputs were selected without approval. */
export async function readOperationLineage(root) {
  const records = [];
  for (const id of await objectIds(root, join(root, '.folio', 'operations', 'requests'))) {
    const request = await readOperation(root, id); const { manifest } = await verifyInput(root, request.inputSnapshotId);
    if (request.operationContractVersion === 2) {
      if (await get(root, 'results', id, true)) fail('OPERATION_CONTRACT_MISMATCH', 'v2 operation contains a legacy result');
      records.push(await productionLineage(root, request)); continue;
    }
    const result = await get(root, 'results', id, true);
    const outputs = result ? await outputBindings(root, result.resultRevisionIds) : [];
    if (result && (result.operationId !== id || result.requestId !== request.requestId || result.inputSnapshotId !== request.inputSnapshotId
      || canonicalJson(outputs) !== canonicalJson(result.outputs))) fail('RESULT_MISMATCH', 'lineage result does not bind its exact request');
    records.push({ request, manifest, result, outputs, groups: undefined, executionStatus: undefined, executionHead: null, catalogDigest: null });
  }
  return records;
}
export function selectionChanges(manifest, state) {
  const changes = manifest.selections.filter((s) => state.sourceSelections[s.resourceId]?.selectionRevision !== s.selectionRevision)
    .map((s) => ({ resourceId: s.resourceId, inputRevisionId: s.revisionId, inputSelectionRevision: s.selectionRevision,
      currentRevisionId: state.sourceSelections[s.resourceId]?.revisionId ?? null, reason: 'source-selection-changed' }));
  if (manifest.version !== 2) return changes;
  return [...changes, ...scopedSelectionChanges(manifest, state)].filter((reason, index, all) => all.findIndex((other) => canonicalJson(other) === canonicalJson(reason)) === index);
}
export function operationImpactFacts(records, state) {
  return records.flatMap(({ manifest, outputs }) => outputs.map((output) => ({ ...output, role: 'output',
    inputRefs: manifest.version === 2 ? manifest.resources : manifest.selections, reviewReasons: selectionChanges(manifest, state) })));
}
