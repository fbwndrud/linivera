import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { assertResourceId } from '../resources/schema.js';
const fail = (code, message) => { throw new FolioError(code, message); };

/** Page a deterministic traversal without losing connections that cross page boundaries. */
export function traverseResourceGraph(graph, input, checkpoint) {
  const { resourceId, direction = 'both', depth = 20, limit = 1000, boundaryLimit = limit, edgeLimit = 5000, cursor } = input;
  if (Object.keys(input).some((key) => !['resourceId', 'direction', 'depth', 'limit', 'boundaryLimit', 'edgeLimit', 'cursor', 'generationId'].includes(key))
    || !['upstream', 'downstream', 'both'].includes(direction) || !Number.isInteger(depth) || depth < 0 || depth > 100
    || !Number.isInteger(limit) || limit < 1 || limit > 5000 || !Number.isInteger(boundaryLimit) || boundaryLimit < 0 || boundaryLimit > 5000
    || !Number.isInteger(edgeLimit) || edgeLimit < 1 || edgeLimit > 10000) fail('RESOURCE_GRAPH_INVALID', 'invalid graph scope or traversal budget');
  if (resourceId !== undefined) assertResourceId(resourceId);
  const scope = { resourceId: resourceId ?? null, direction, depth, limit };
  const signature = sha256(canonicalJson({ scope, boundaryLimit, edgeLimit, checkpoint, graph }));
  let offset = 0;
  if (cursor !== undefined) {
    let value;
    try {
      if (typeof cursor !== 'string' || cursor.length > 2048) throw new Error();
      value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (Object.keys(value).sort().join('|') !== 'offset|signature' || !Number.isSafeInteger(value.offset) || value.offset < 0) throw new Error();
    } catch { fail('RESOURCE_GRAPH_INVALID', 'invalid graph cursor'); }
    if (value.signature !== signature) fail('RESOURCE_GRAPH_CURSOR_STALE', 'graph or requested scope changed; restart traversal');
    offset = value.offset;
  }
  const adjacency = new Map();
  const add = (a, b) => { if (!adjacency.has(a)) adjacency.set(a, []); adjacency.get(a).push(b); };
  for (const edge of graph.edges) {
    if (direction !== 'upstream') add(edge.source, edge.target);
    if (direction !== 'downstream') add(edge.target, edge.source);
  }
  const seeds = resourceId === undefined ? graph.nodes : graph.nodes.filter((node) => node.resourceId === resourceId);
  const reachable = new Set(); const queue = seeds.map((node) => [node.id, 0]); let depthTruncated = false;
  for (let i = 0; i < queue.length; i++) {
    const [id, distance] = queue[i]; if (reachable.has(id)) continue;
    reachable.add(id);
    const next = (adjacency.get(id) ?? []).filter((id) => !reachable.has(id));
    if (distance >= depth) { if (next.length) depthTruncated = true; continue; }
    queue.push(...next.map((id) => [id, distance + 1]));
  }
  const ordered = [...reachable];
  if (offset > ordered.length) fail('RESOURCE_GRAPH_INVALID', 'cursor exceeds traversal');
  const selected = new Set(ordered.slice(offset, offset + limit));
  const internal = graph.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target));
  const boundary = graph.edges.filter((edge) => selected.has(edge.source) !== selected.has(edge.target));
  const boundaryIds = new Set([...new Set(boundary.flatMap((edge) => [edge.source, edge.target]).filter((id) => !selected.has(id)))].slice(0, boundaryLimit));
  const edges = internal.slice(0, edgeLimit);
  const boundaryEdges = boundary.filter((edge) => (selected.has(edge.source) || boundaryIds.has(edge.source)) && (selected.has(edge.target) || boundaryIds.has(edge.target))).slice(0, Math.max(0, edgeLimit - edges.length));
  const omittedEdgeCount = internal.length + boundary.length - edges.length - boundaryEdges.length;
  const nextOffset = offset + selected.size;
  return { nodes: graph.nodes.filter((node) => selected.has(node.id)), edges, boundaryEdges,
    boundaryNodes: graph.nodes.filter((node) => boundaryIds.has(node.id)), checkpoint,
    coverage: { ...graph.coverage, returnedNodeCount: selected.size, reachableNodeCount: reachable.size,
      missing: resourceId !== undefined && !seeds.length ? [{ resourceId, reason: 'resource-not-found' }] : [],
      depthTruncated, limits: { nodes: limit, boundaryNodes: boundaryLimit, edges: edgeLimit }, omittedEdgeCount,
      truncated: omittedEdgeCount ? [{ reason: 'relation-budget', omittedEdgeCount }] : [] },
    nextCursor: nextOffset < ordered.length ? Buffer.from(canonicalJson({ signature, offset: nextOffset })).toString('base64url') : null,
    truncated: depthTruncated || nextOffset < ordered.length || omittedEdgeCount > 0, scope };
}
