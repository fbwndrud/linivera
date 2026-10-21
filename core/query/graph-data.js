import { FolioError } from '../errors.js';
import { listResourceRevisions } from '../resources/catalog.js';
import { readOperationLineage, operationImpactFacts } from '../operations/lineage.js';
import { applyReviewImpact } from '../projections/review-impact.js';
import { metadataEntries } from '../projections/metadata.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { createResourceStore } from '../resources/revisions.js';
import { readResourceRelations } from '../resources/context-references.js';
import { readIterationReferences } from '../operations/iteration.js';
import { readSessionRelations } from '../operations/session-records.js';
import { resourceFamily } from './resource-family.js';

const resourceNode = (id) => `revision:${id}`;
const operationNode = (id) => `operation:${id}`;

export async function readGraphData(root, state) {
  const revisions = await listResourceRevisions(root);
  await metadataEntries(root, state, { transitive: false }); // Revalidates publications and selected source bytes.
  const records = await readOperationLineage(root);
  const impact = applyReviewImpact(revisions.map((r) => ({ ...r, role: 'output', inputRefs: [], reviewReasons: [] })), operationImpactFacts(records, state));
  const scopeBindings = new Map();
  for (const selection of Object.values(state.inputSelections ?? {})) for (const binding of selection.bindings) {
    if (!scopeBindings.has(binding.revisionId)) scopeBindings.set(binding.revisionId, []);
    scopeBindings.get(binding.revisionId).push({ scopeId: selection.scopeId, bindingKey: binding.bindingKey, role: binding.role, mode: binding.mode });
  }
  const nodes = revisions.map((r) => ({ id: resourceNode(r.revisionId), type: 'resource', ...r, family: resourceFamily(r),
    scopedSelections: scopeBindings.get(r.revisionId) ?? [],
    selected: state.sourceSelections[r.resourceId]?.revisionId === r.revisionId, states: [],
    reviewRequired: impact.some((e) => e.revisionId === r.revisionId && e.reviewRequired) }));
  const byId = new Map(nodes.map((n) => [n.id, n])); const edges = []; const edgeIds = new Set();
  function edge(source, target, kind, details = {}) {
    if (!byId.has(source) || !byId.has(target)) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'graph references a missing revision');
    const id = `${kind}:${source}:${target}${details.groupId ? ':' + details.groupId : ''}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id); edges.push({ id, source, target, kind, ...details });
  }
  for (const r of revisions) for (const parent of r.parents) {
    if (byId.get(resourceNode(parent))?.resourceId !== r.resourceId) throw new FolioError('RESOURCE_PARENT_INVALID', 'revision parent belongs to another resource');
    edge(resourceNode(parent), resourceNode(r.revisionId), 'revision');
  }
  for (const revision of revisions) for (const relation of await readResourceRelations(root, revision)) {
    edge(resourceNode(revision.revisionId), resourceNode(relation.targetRevisionId), relation.kind);
  }
  for (const revision of revisions) {
    for (const target of await readIterationReferences(root, revision)) edge(resourceNode(revision.revisionId), resourceNode(target), 'iteration-reference');
    for (const relation of await readSessionRelations(root, revision)) edge(resourceNode(revision.revisionId), resourceNode(relation.targetRevisionId), relation.kind);
  }
  for (const { request, manifest, result, outputs, groups, executionStatus } of records) {
    const id = request.operationId;
    const publication = state.publications.find((p) => p.operationId === id);
    const op = { id: operationNode(id), type: 'operation', operationId: id, requestId: request.requestId,
      inputSnapshotId: request.inputSnapshotId, status: request.operationContractVersion === 2 ? executionStatus : publication?.action === 'approve' ? 'approved' : publication?.action === 'reject' ? 'rejected' : result ? 'submitted' : 'pending' };
    nodes.push(op); byId.set(op.id, op);
    for (const revisionId of new Set([...manifest.resources.map((r) => r.revisionId), ...Object.values(manifest.definitions).map((d) => d.revisionId)])) edge(resourceNode(revisionId), op.id, 'input');
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
    if (n.scopedSelections.length) n.states.push('scoped-source');
    if (!n.states.length) n.states.push('candidate');
    n.states = [...new Set(n.states)];
  }
  return { nodes, edges, coverage: { contentVerification: 'verified', executionHeads: records.filter((record) => record.executionHead).map((record) => ({ operationId: record.request.operationId, head: record.executionHead })),
    operationResultCatalogDigest: sha256(canonicalJson(records.map((record) => ({ operationId: record.request.operationId, requestId: record.request.requestId, catalogDigest: record.catalogDigest ?? sha256(canonicalJson(record.result)) })))) } };
}
