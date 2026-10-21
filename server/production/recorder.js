import { sha256, canonicalJson } from '../../core/util/hash.js';
import { FolioError } from '../../core/errors.js';
import { retainProductionArtifacts } from './retain.js';
import { nativeRecord } from '../../adapters/production/native-records.js';
import { verifyPreparedBindings } from './bindings.js';

/** Host-side recorder. The supplied call crosses the existing public MCP interface. */
export function createProductionRecorder({ call, root, operationId, executionId }) {
  const invoke = (name, args) => call(name, { root, ...args });
  let head = null;
  const identity = (kind, value) => `production-${kind}-${sha256(canonicalJson({ operationId, value })).slice(7)}`;
  const json = (resourceId, value, kind) => invoke('folio_resources', { op: 'propose', resourceId, kind,
    owned: { bytes: canonicalJson(value), mediaType: 'application/json' } });
  async function record(event) {
    const result = await invoke('folio_operations', { op: 'recordExecution', operationId, executionId,
      expectedExecutionHead: head, event });
    head = result.executionHead;
    return result;
  }
  async function retainRecords(nativeRecords = []) {
    if (!nativeRecords.length) return [];
    const observations = nativeRecords.map((native) => {
      const safe = nativeRecord(native.stage, native.record);
      const omittedPaths = [...new Set([...(native.omittedPaths ?? []), ...safe.omittedPaths])];
      return { stage: native.stage, record: safe.record, omittedPaths };
    });
    const value = observations.length === 1 ? observations[0].record : { version: 1, observations };
    const revision = await json(identity('observation', observations), value, 'execution-observation');
    const omittedPaths = observations.flatMap((item, index) => item.omittedPaths.map((path) => observations.length === 1 ? path : `observations[${index}].record.${path}`));
    return [{ revisionId: revision.revisionId, stage: observations.length === 1 ? observations[0].stage : 'batch', omittedPaths }];
  }
  async function resume() {
    const result = await invoke('folio_operations', { op: 'inspect', operationId, executionId });
    head = result.executionHead;
    return result;
  }
  async function accepted(submission) {
    if (!submission.handle?.jobId) throw new FolioError('PRODUCTION_CAPTURE_INVALID', 'accepted submission needs an acknowledged provider job');
    const local = submission.handle.jobIdSource?.startsWith('local-') || submission.handle.provider === 'manual';
    const native = [...(submission.nativeRecords ?? [])];
    if (local) native.unshift(nativeRecord('host-correlation', { correlationId: submission.handle.jobId, source: submission.handle.jobIdSource ?? 'local-capture' }));
    const records = await retainRecords(native);
    return record({ type: 'accepted', ...(local ? { unavailableFields: ['providerJobId'] } : { providerJobId: submission.handle.jobId }),
      ...(records[0] ? { nativeRecordRevisionId: records[0].revisionId, omittedPaths: records[0].omittedPaths } : {}) });
  }
  async function status(type, details = {}) {
    const records = await retainRecords(details.nativeRecords);
    return record({ type, ...(details.nativeStatus ? { nativeStatus: details.nativeStatus } : {}),
      ...(details.unavailableFields ? { unavailableFields: details.unavailableFields } : {}),
      ...(records[0] ? { nativeRecordRevisionId: records[0].revisionId, omittedPaths: records[0].omittedPaths } : {}) });
  }
  return Object.freeze({
    resume,
    async prepared(prepared) {
      const inspected = await resume();
      await verifyPreparedBindings({ invoke, prepared, inspected: { ...inspected, selectedExecutionId: executionId } });
      const safe = nativeRecord('request', prepared.nativeRequest);
      if (sha256(canonicalJson(safe.record)) !== prepared.requestDigest) throw new FolioError('PRODUCTION_CAPTURE_INVALID', 'prepared digest must match the retained redacted request');
      const omittedPaths = [...new Set([...safe.omittedPaths, ...(prepared.nativeRecords?.find((item) => item.stage === 'request')?.omittedPaths ?? [])])];
      const revision = await json(identity('request', safe.record), safe.record, 'execution-request');
      return record({ type: 'prepared', requestDigest: prepared.requestDigest, nativeRecordRevisionId: revision.revisionId,
        omittedPaths,
        remoteInputBindings: prepared.inputMapping.map(({ fieldPath, revisionId }) => ({ fieldPath, revisionId })) });
    },
    submitting: () => record({ type: 'submitting' }),
    accepted,
    status,
    async submit(adapter, prepared) {
      const inspected = await resume();
      const current = inspected.executions.find((item) => item.executionId === executionId);
      const actualDigest = sha256(canonicalJson(nativeRecord('request', prepared.nativeRequest).record));
      if (current?.status !== 'prepared' || current.requestDigest !== prepared.requestDigest || actualDigest !== current.requestDigest) throw new FolioError('PRODUCTION_SUBMISSION_BLOCKED', 'only a durably prepared execution may submit; inspect or recover an uncertain acknowledgement without another POST');
      await verifyPreparedBindings({ invoke, prepared, inspected: { ...inspected, selectedExecutionId: executionId } });
      // Optimistic head locking also prevents two hosts from both crossing the network boundary.
      await record({ type: 'submitting' });
      let submission;
      try { submission = await adapter.submit(prepared); }
      catch { submission = { status: 'submission-unknown', unavailableFields: ['providerJobId'] }; }
      if (['accepted', 'complete', 'partial', 'running'].includes(submission?.status) && submission.handle?.jobId) {
        await accepted(submission);
        // Synchronous completion is not a complete retained group until collect has sealed its files.
        if (submission.status === 'running') await status('running', submission);
      } else {
        const type = submission?.status === 'failed' ? 'failed' : 'submission-unknown';
        await status(type, submission ?? {});
        submission = { ...submission, status: type };
      }
      return submission;
    },
    async collect(prepared, collection, { inputSnapshotId }) {
      const previous = (await resume()).executions.find((item) => item.executionId === executionId);
      const { artifacts, bundleObservations } = await retainProductionArtifacts({ invoke, json, prepared, collection, priorArtifacts: previous?.artifacts });
      const nativeRecords = await retainRecords([...(collection.nativeRecords ?? []), ...bundleObservations.map((observation) => ({ stage: 'incomplete-bundle', record: observation }))]);
      await record({ type: artifacts.length ? 'outputs-observed' : 'partial',
        ...(artifacts.length ? { artifacts: artifacts.map(({ artifactKey, groupId, role, revisionId }) => ({ artifactKey, groupId, role, revisionId })) } : {}),
        ...(nativeRecords[0] ? { nativeRecordRevisionId: nativeRecords[0].revisionId, omittedPaths: nativeRecords[0].omittedPaths } : {}),
        unavailableFields: collection.unavailableFields ?? [] });
      const groups = [];
      const incompleteGroups = [];
      const inspected = await resume();
      const current = inspected.executions.find((item) => item.executionId === executionId);
      const touched = new Set(artifacts.map((artifact) => artifact.groupId));
      for (const group of current.groups) {
        const groupId = group.groupId;
        const members = current.artifacts.filter((artifact) => artifact.groupId === groupId);
        const missingRoles = group.slots.filter((slot) => {
          const count = members.filter((member) => member.role === slot.role).length;
          return count !== (slot.cardinality ?? 1) && !(count === 0 && !slot.required);
        }).map((slot) => slot.role);
        if (missingRoles.length) { incompleteGroups.push({ groupId, missingRoles }); continue; }
        if (!touched.has(groupId)) continue;
        const old = inspected.submittedGroups?.find((candidate) => candidate.groupId === groupId);
        if (old) {
          const retainedManifest = await invoke('folio_resources', { op: 'read', revisionId: old.groupManifestRevisionId });
          const priorMembers = JSON.parse(retainedManifest.content).members;
          const signature = (values) => canonicalJson(values.map(({ artifactKey, role, revisionId }) => ({ artifactKey, role, revisionId })).sort((a, b) => a.artifactKey.localeCompare(b.artifactKey)));
          if (signature(priorMembers) !== signature(members)) throw new FolioError('PRODUCTION_GROUP_CONFLICT', 'immutable submitted group differs from the observed members');
          groups.push(old); continue;
        }
        const manifest = await json(identity('group', { groupId, members: members.map((member) => member.revisionId) }), {
          version: 1, groupId, members: members.map(({ artifactKey, role, revisionId }) => ({ artifactKey, role, revisionId })),
        }, 'production-group');
        groups.push(await invoke('folio_operations', { op: 'submitGroup', operationId, groupId, inputSnapshotId,
          executionId, executionHead: head, requestDigest: prepared.requestDigest,
          resultRevisionIds: members.map((member) => member.revisionId), groupManifestRevisionId: manifest.revisionId }));
      }
      return { artifacts, groups, incompleteGroups, bundleObservations, executionHead: head };
    },
  });
}
