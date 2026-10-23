import { readResourceGraph } from '../query/resource-graph.js';
import { withResourceViewCheckpoint } from './resource-checkpoint.js';
export function viewResourceGraph(root) {
  return withResourceViewCheckpoint(root, (state) => readResourceGraph(root, {}, state));
}
