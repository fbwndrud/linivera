import { canonicalJson, sha256 } from '../util/hash.js';
import { readExecution } from './executions.js';
import { listGroups } from './output-groups.js';
export async function productionLineage(root, request) {
  const context = await readExecution(root, request.operationId);
  const groups = await listGroups(root, request.operationId);
  const produced = new Map();
  for (const execution of context.executions) for (const artifact of execution.artifacts) produced.set(artifact.groupId + ':' + artifact.revisionId, { ...artifact, outputStatus: 'observed-output' });
  for (const group of groups) for (const output of group.outputs) produced.set(group.groupId + ':' + output.revisionId, { ...output, groupId: group.groupId, outputStatus: 'submitted' });
  return { request, manifest: context.manifest, result: null, outputs: [...produced.values()], groups, executionHead: context.executionHead,
    executionStatus: context.executions[0]?.status ?? 'pending', catalogDigest: sha256(canonicalJson(groups.map((group) => group.groupHash))) };
}
