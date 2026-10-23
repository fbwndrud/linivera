import { withWorkspaceStateTransaction } from '../publications/state.js';
import { traverseResourceGraph } from './graph-traversal.js';
import { readGraphData } from './graph-data.js';
import { readIndexedGraph } from './graph-index.js';

/** Defaults retain full verification. Indexed discovery is an explicit partial view. */
export function queryResourceGraph(root, input = {}) {
  return withWorkspaceStateTransaction(root, ({ state }) => readResourceGraph(root, input, state));
}
export async function readResourceGraph(root, input, state) {
  if (input.generationId) return readIndexedGraph(root, input, state);
  return traverseResourceGraph(await readGraphData(root, state), input, state.checkpoint);
}
