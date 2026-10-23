import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { assertRevisionId } from '../resources/schema.js';
import { readObject, writeImmutable } from '../resources/files.js';
import { withWorkspaceStateTransaction } from '../publications/state.js';
import { graphCatalogFingerprint } from './graph-catalog.js';
import { readGraphData } from './graph-data.js';
import { traverseResourceGraph } from './graph-traversal.js';
import { verifyIndexedPage } from './graph-page-verification.js';
import { validateGraphIndexShape } from './graph-index-schema.js';
const path = (root, id) => join(root, '.folio/projections/graph', id.slice(7) + '.json');

/** Explicit derived index. Building it performs the same full checks as the default graph. */
export function buildGraphIndex(root) {
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    const graph = await readGraphData(root, state);
    const value = { version: 1, checkpoint: state.checkpoint, catalogDigest: await graphCatalogFingerprint(root), graph };
    const generationId = sha256(canonicalJson(value));
    await writeImmutable(root, path(root, generationId), canonicalJson(value));
    return { generationId, checkpoint: state.checkpoint, nodes: graph.nodes.length, edges: graph.edges.length, contentVerification: 'verified' };
  });
}

/** The index suggests candidates; returned relationships and files are checked against originals. */
export async function readIndexedGraph(root, input, state) {
  assertRevisionId(input.generationId);
  const bytes = await readObject(root, path(root, input.generationId));
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new FolioError('RESOURCE_GRAPH_INDEX_INVALID', 'invalid graph index JSON'); }
  if (sha256(bytes) !== input.generationId || canonicalJson(value) !== bytes.toString('utf8') || value.version !== 1
    || !Array.isArray(value.graph?.nodes) || !Array.isArray(value.graph?.edges)) throw new FolioError('RESOURCE_GRAPH_INDEX_INVALID', 'graph index fingerprint differs');
  if (canonicalJson(value.checkpoint) !== canonicalJson(state.checkpoint) || value.catalogDigest !== await graphCatalogFingerprint(root)) throw new FolioError('RESOURCE_GRAPH_INDEX_STALE', 'authoritative catalog changed; build a new index');
  validateGraphIndexShape(value.graph);
  // Cached global coverage is discovery data too; only this page's checks make authority claims.
  const result = traverseResourceGraph({ ...value.graph, coverage: {} }, input, state.checkpoint);
  const verified = await verifyIndexedPage(root, result, state);
  return { ...verified, generationId: input.generationId, coverage: { ...verified.coverage,
    contentVerification: 'returned-scope-verified', reviewVerification: 'not-recomputed', discoveryComplete: false,
    unknown: [{ reason: 'indexed-discovery-only' }, { reason: 'review-impact-requires-full-graph' }] } };
}
