import { FolioError } from '../errors.js';
function invalid(message) { throw new FolioError('RESOURCE_GRAPH_INDEX_INVALID', message); }
/** Cheap structural checks protect traversal budgets; originals still prove every returned relationship. */
export function validateGraphIndexShape(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) invalid('indexed nodes and edges required');
  const nodes = new Set(); const edges = new Set();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || !['resource', 'operation'].includes(node.type) || nodes.has(node.id)) invalid('indexed node identities must be unique');
    nodes.add(node.id);
  }
  for (const edge of graph.edges) {
    if (!edge || Object.keys(edge).some((key) => !['id', 'source', 'target', 'kind', 'groupId'].includes(key))
      || typeof edge.kind !== 'string' || !edge.kind || !nodes.has(edge.source) || !nodes.has(edge.target)
      || (edge.groupId !== undefined && (edge.kind !== 'output' || typeof edge.groupId !== 'string' || !edge.groupId))
      || edge.id !== `${edge.kind}:${edge.source}:${edge.target}${edge.groupId === undefined ? '' : ':' + edge.groupId}` || edges.has(edge.id)) invalid('invalid indexed relationship identity or endpoints');
    edges.add(edge.id);
  }
}
