import { FolioError } from '../errors.js';
import { withWorkspaceStateTransaction } from '../publications/state.js';
import { listResourceRevisions } from '../resources/catalog.js';
import { assertResourceId } from '../resources/schema.js';
import { readOperationLineage, operationImpactFacts } from '../operations/lineage.js';
import { applyReviewImpact } from '../projections/review-impact.js';
import { metadataEntries } from '../projections/metadata.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { createResourceStore } from '../resources/revisions.js';

const resourceNode = (id) => `revision:${id}`;
const operationNode = (id) => `operation:${id}`;

async function readGraph(root, state) {
  const revisions = await listResourceRevisions(root);
  await metadataEntries(root, state, { transitive: false }); // Revalidates publications and selected source bytes.
  const records = await readOperationLineage(root);
  const impact = applyReviewImpact(revisions.map((r) => ({ ...r, role: 'output', inputRefs: [], reviewReasons: [] })), operationImpactFacts(records, state));
  const nodes = revisions.map((r) => ({ id: resourceNode(r.revisionId), type: 'resource', ...r,
    selected: state.sourceSelections[r.resourceId]?.revisionId === r.revisionId, states: [],
    reviewRequired: impact.some((e) => e.revisionId === r.revisionId && e.reviewRequired) }));
  const byId = new Map(nodes.map((n) => [n.id, n])); const edges = [];
  function edge(source, target, kind, details = {}) {
    if (!byId.has(source) || !byId.has(target)) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'graph references a missing revision');
    edges.push({ id: `${kind}:${source}:${target}${details.groupId ? ':' + details.groupId : ''}`, source, target, kind, ...details });
  }
  for (const r of revisions) for (const parent of r.parents) {
    if (byId.get(resourceNode(parent))?.resourceId !== r.resourceId) throw new FolioError('RESOURCE_PARENT_INVALID', 'revision parent belongs to another resource');
    edge(resourceNode(parent), resourceNode(r.revisionId), 'revision');
  }
  for (const { request, manifest, result, outputs, groups, executionStatus } of records) {
    const id = request.operationId;
    const publication = state.publications.find((p) => p.operationId === id);
    const op = { id: operationNode(id), type: 'operation', operationId: id, requestId: request.requestId,
      inputSnapshotId: request.inputSnapshotId, status: request.operationContractVersion === 2 ? executionStatus : publication?.action === 'approve' ? 'approved' : publication?.action === 'reject' ? 'rejected' : result ? 'submitted' : 'pending' };
    nodes.push(op); byId.set(op.id, op);
    for (const input of manifest.selections) edge(resourceNode(input.revisionId), op.id, 'input');
    if (!result && !groups) continue;
    for (const output of outputs) {
      const groupPublication = output.groupId && state.groupPublications?.find((entry) => entry.operationId === id && entry.groupId === output.groupId && entry.outputs.some((bound) => bound.revisionId === output.revisionId && bound.contentHash === output.contentHash));
      const outputStatus = request.operationContractVersion === 2 ? groupPublication?.action === 'approve' ? 'approved' : groupPublication?.action === 'reject' ? 'rejected' : output.outputStatus : op.status;
      edge(op.id, resourceNode(output.revisionId), 'output', output.groupId ? { groupId: output.groupId } : {});
      byId.get(resourceNode(output.revisionId)).states.push(outputStatus);
    }
  }
  const store = createResourceStore(root);
  for (const revision of revisions.filter((revision) => ['artifact-bundle', 'production-group'].includes(revision.kind) && revision.storageStatus === 'owned_snapshot')) {
    const value = JSON.parse((await store.readContent(revision.revisionId)).toString('utf8'));
    for (const member of value.members ?? []) edge(resourceNode(revision.revisionId), resourceNode(member.revisionId), 'contains');
  }
  for (const n of nodes.filter((n) => n.type === 'resource')) {
    if (n.selected) n.states.push('source');
    if (!n.states.length) n.states.push('candidate');
    n.states = [...new Set(n.states)];
  }
  return { nodes, edges, coverage: { executionHeads: records.filter((record) => record.executionHead).map((record) => ({ operationId: record.request.operationId, head: record.executionHead })),
    operationResultCatalogDigest: sha256(canonicalJson(records.map((record) => ({ operationId: record.request.operationId, requestId: record.request.requestId, catalogDigest: record.catalogDigest ?? sha256(canonicalJson(record.result)) })))) } };
}

/** Verified, bounded traversal over existing resource and operation records. */
export async function queryResourceGraph(root, input = {}) {
  return withWorkspaceStateTransaction(root, ({ state }) => readResourceGraph(root, input, state));
}

/** Read-only view/export seam, with the caller's already verified workspace checkpoint. */
export async function readResourceGraph(root, input, state) {
  const { resourceId, direction = 'both', depth = 20, limit = 1000 } = input;
  if (Object.keys(input).some((k) => !['resourceId', 'direction', 'depth', 'limit'].includes(k))
    || !['upstream', 'downstream', 'both'].includes(direction) || !Number.isInteger(depth) || depth < 0 || depth > 100
    || !Number.isInteger(limit) || limit < 1 || limit > 5000) throw new FolioError('RESOURCE_GRAPH_INVALID', 'invalid graph scope or traversal budget');
  if (resourceId !== undefined) assertResourceId(resourceId);
    const graph = await readGraph(root, state);
    const seeds = resourceId === undefined ? graph.nodes : graph.nodes.filter((n) => n.resourceId === resourceId);
    const adjacency = new Map();
    function add(a, b) { if (!adjacency.has(a)) adjacency.set(a, []); adjacency.get(a).push(b); }
    for (const e of graph.edges) { if (direction !== 'upstream') add(e.source, e.target); if (direction !== 'downstream') add(e.target, e.source); }
    const selected = new Set(); const queue = seeds.map((n) => [n.id, 0]); let truncated = false;
    for (let i = 0; i < queue.length; i += 1) {
      const [id, distance] = queue[i]; if (selected.has(id)) continue;
      if (selected.size === limit) { truncated = true; continue; }
      selected.add(id);
      const next = (adjacency.get(id) ?? []).filter((n) => !selected.has(n));
      if (distance >= depth) { if (next.length) truncated = true; continue; }
      queue.push(...next.map((n) => [n, distance + 1]));
    }
    return { nodes: graph.nodes.filter((n) => selected.has(n.id)), edges: graph.edges.filter((e) => selected.has(e.source) && selected.has(e.target)),
      checkpoint: state.checkpoint, coverage: graph.coverage, truncated, scope: { resourceId: resourceId ?? null, direction, depth, limit } };
}
