import { canonicalJson, sha256 } from '../../util/hash.js';
import { createResourceStore } from '../../resources/revisions.js';
import { fail } from '../objects.js';
import { validateExecutionEvent, assertTransition } from './schema.js';
import { verifyNativeRequest, bindArtifacts } from './bindings.js';
/** Rebuild from verified ledger records. Every retained artifact is revalidated. */
export async function replayExecution(root, request, records) {
  const executions = new Map();
  for (const record of records) {
    if (record.type !== 'execution-event' || record.payload?.operationId !== request.operationId || typeof record.payload?.executionId !== 'string') fail('EXECUTION_INTEGRITY_FAILURE', 'execution belongs to a different operation');
    const { executionId, event } = record.payload; validateExecutionEvent(event);
    const old = executions.get(executionId);
    assertTransition(old?.status, event.type);
    if (!old && executions.size) fail('EXECUTION_TRANSITION_INVALID', 'new generation requires a new operation');
    const current = old ?? { executionId, status: undefined, requestDigest: null, artifacts: [], groups: [], providerJobId: null, providerRunId: null, remoteInputBindings: [] };
    if (event.type === 'prepared') {
      await verifyNativeRequest(root, request.value, event);
      current.requestDigest = event.requestDigest; current.remoteInputBindings = event.remoteInputBindings;
      current.groups = request.value.outputSpec.groupPolicy === 'fixed' ? request.value.outputSpec.groups.map((group) => ({ ...group })) : [];
    } else if (event.requestDigest !== undefined && event.requestDigest !== current.requestDigest) fail('EXECUTION_BINDING_INVALID', 'request digest cannot change');
    if (event.nativeRecordRevisionId) await createResourceStore(root).readRevision(event.nativeRecordRevisionId);
    for (const key of ['providerJobId', 'providerRunId']) if (event[key] !== undefined) {
      if (current[key] !== null && current[key] !== event[key]) fail('EXECUTION_BINDING_INVALID', 'provider handle cannot change');
      current[key] = event[key];
    }
    if (event.type === 'group-discovered') {
      const spec = request.value.outputSpec; const rules = spec.groupRules;
      if (spec.groupPolicy !== 'dynamic' || !event.nativeKey || typeof event.nativeKey !== 'object' || Array.isArray(event.nativeKey) || Object.keys(event.nativeKey).sort().join('|') !== [...rules.keyFields].sort().join('|') || Object.values(event.nativeKey).some((value) => typeof value !== 'string' || !value.length)
        || (rules.allowedKinds && !rules.allowedKinds.includes(event.kind))) fail('OUTPUT_GROUP_INVALID', 'discovered group violates sealed rules');
      const groupId = sha256(canonicalJson(event.nativeKey));
      if (event.groupId !== groupId || current.groups.some((group) => group.groupId === groupId) || current.groups.length >= rules.maxGroups) fail('OUTPUT_GROUP_INVALID', 'invalid or duplicate dynamic group');
      current.groups.push({ groupId, slots: spec.slotsSchema, nativeKey: event.nativeKey });
    }
    if (event.artifacts) {
      const artifacts = await bindArtifacts(root, event.artifacts);
      if (canonicalJson(artifacts) !== canonicalJson(event.artifacts)) fail('EXECUTION_INTEGRITY_FAILURE', 'artifact binding was not sealed');
      for (const artifact of artifacts) {
        const group = current.groups.find((group) => group.groupId === artifact.groupId);
        const slot = group?.slots.find((slot) => slot.role === artifact.role);
        if (!slot || !slot.acceptableMediaTypes.includes(artifact.mediaType)) fail('OUTPUT_GROUP_INVALID', 'observed artifact violates group slot');
        const prior = current.artifacts.find((item) => item.artifactKey === artifact.artifactKey);
        if (prior && canonicalJson(prior) !== canonicalJson(artifact)) fail('EXECUTION_BINDING_INVALID', 'artifact key already binds a different retained revision');
        if (!prior) current.artifacts.push(artifact);
      }
    }
    if (event.type === 'complete') {
      if (!current.groups.length || (request.value.outputSpec.groupPolicy === 'dynamic' && event.enumerationComplete !== true)
        || current.groups.some((group) => group.slots.some((slot) => {
          const count = current.artifacts.filter((artifact) => artifact.groupId === group.groupId && artifact.role === slot.role).length;
          return count !== (slot.cardinality ?? 1) && !(count === 0 && !slot.required);
        }))) fail('EXECUTION_INCOMPLETE', 'complete requires final enumeration and every declared output slot');
    }
    if (event.type !== 'group-discovered' && !(event.type === 'outputs-observed' && ['failed', 'canceled', 'complete'].includes(current.status))) current.status = event.type;
    if (event.reportedCost !== undefined) current.reportedCost = event.reportedCost;
    if (event.unavailableFields !== undefined) current.unavailableFields = event.unavailableFields;
    current.head = { seq: record.seq, hash: record.hash }; executions.set(executionId, current);
  }
  return [...executions.values()];
}
