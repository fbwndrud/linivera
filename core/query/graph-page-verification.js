import { createResourceStore } from '../resources/revisions.js';
import { verifyInput } from '../resources/input-snapshots.js';
import { readOperation, outputBindings } from '../operations/requests.js';
import { productionLineage } from '../operations/production-lineage.js';
import { get, fail } from '../operations/objects.js';
import { canonicalJson } from '../util/hash.js';
import { readResourceRelations } from '../resources/context-references.js';
import { readIterationReferences } from '../operations/iteration.js';
import { readSessionRelations } from '../operations/session-records.js';
import { resourceFamily } from './resource-family.js';

/** An index is never authority for bytes, causal relationships, approval or review state. */
export async function verifyIndexedPage(root, page, state) {
  const store = createResourceStore(root); const resources = new Map(); const operations = new Map();
  async function operation(id) {
    if (operations.has(id)) return operations.get(id);
    const request = await readOperation(root, id); const { manifest } = await verifyInput(root, request.inputSnapshotId);
    let record;
    if (request.operationContractVersion === 2) record = await productionLineage(root, request);
    else {
      const result = await get(root, 'results', id, true); const outputs = result ? await outputBindings(root, result.resultRevisionIds) : [];
      if (result && (result.requestId !== request.requestId || result.inputSnapshotId !== request.inputSnapshotId || canonicalJson(result.outputs) !== canonicalJson(outputs))) fail('RESULT_MISMATCH', 'indexed result differs from authoritative operation');
      record = { request, manifest, outputs };
    }
    operations.set(id, record); return record;
  }
  async function node(value) {
    if (!value || typeof value !== 'object') fail('RESOURCE_GRAPH_INDEX_INVALID', 'invalid indexed node');
    if (value.type === 'resource') {
      const revision = await store.readRevision(value.revisionId);
      if (value.id !== 'revision:' + revision.revisionId || value.resourceId !== revision.resourceId || value.contentHash !== revision.contentHash) fail('RESOURCE_GRAPH_INDEX_INVALID', 'indexed resource differs');
      resources.set(value.id, revision);
      const selected = state.sourceSelections[revision.resourceId]?.revisionId === revision.revisionId;
      const scopedSelections = Object.values(state.inputSelections ?? {}).flatMap((selection) => selection.bindings.filter((binding) => binding.revisionId === revision.revisionId)
        .map((binding) => ({ scopeId: selection.scopeId, bindingKey: binding.bindingKey, role: binding.role, mode: binding.mode })));
      const states = [...(selected ? ['source'] : []), ...(scopedSelections.length ? ['scoped-source'] : [])];
      return { ...revision, id: value.id, type: 'resource', family: resourceFamily(revision), selected, scopedSelections, states: states.length ? states : ['candidate'], reviewRequired: null, reviewStatus: 'unknown' };
    }
    if (value.type !== 'operation' || value.id !== 'operation:' + value.operationId) fail('RESOURCE_GRAPH_INDEX_INVALID', 'invalid indexed node');
    const { request } = await operation(value.operationId);
    return { id: value.id, type: 'operation', operationId: request.operationId, requestId: request.requestId, inputSnapshotId: request.inputSnapshotId, status: 'observed', reviewStatus: 'unknown' };
  }
  const nodes = []; const boundaryNodes = [];
  for (const value of page.nodes) nodes.push(await node(value));
  for (const value of page.boundaryNodes) boundaryNodes.push(await node(value));
  for (const edge of [...page.edges, ...page.boundaryEdges]) {
    if (!edge || typeof edge.source !== 'string' || typeof edge.target !== 'string') fail('RESOURCE_GRAPH_INDEX_INVALID', 'invalid indexed relationship');
    const source = resources.get(edge.source); const target = resources.get(edge.target); let valid = false;
    if (edge.kind === 'revision') valid = source && target && target.resourceId === source.resourceId && target.parents.includes(source.revisionId);
    else if (edge.kind === 'input' && source && edge.target.startsWith('operation:')) {
      const { manifest } = await operation(edge.target.slice(10));
      valid = [...manifest.resources, ...Object.values(manifest.definitions)].some((item) => item.revisionId === source.revisionId);
    } else if (edge.kind === 'output' && target && edge.source.startsWith('operation:')) {
      valid = (await operation(edge.source.slice(10))).outputs.some((item) => item.revisionId === target.revisionId && (item.groupId ?? null) === (edge.groupId ?? null));
    } else if (edge.kind === 'contains' && source && target) {
      if (['artifact-bundle', 'production-group'].includes(source.kind)) {
        const value = JSON.parse((await store.readContent(source.revisionId)).toString('utf8'));
        valid = value.members?.some((member) => member.revisionId === target.revisionId);
      }
    } else if (source && target) {
      if (edge.kind === 'iteration-reference') valid = (await readIterationReferences(root, source)).includes(target.revisionId);
      else valid = [...await readResourceRelations(root, source), ...await readSessionRelations(root, source)].some((item) => item.kind === edge.kind && item.targetRevisionId === target.revisionId);
    }
    if (!valid) fail('RESOURCE_GRAPH_INDEX_INVALID', 'indexed relationship has no authoritative evidence');
  }
  return { ...page, nodes, boundaryNodes };
}
