import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../../server/tools/definitions.js';
import { validateInput } from '../../server/validate-input.js';

const fingerprint = 'sha256:' + '1'.repeat(64);
const checkpoint = { seq: 1, hash: fingerprint };
const schema = (name) => TOOLS.find((tool) => tool.name === name).inputSchema;
const accepts = (name, input) => assert.deepEqual(validateInput(schema(name), { root: '/synthetic', ...input }), []);
const rejects = (name, input) => assert.ok(validateInput(schema(name), { root: '/synthetic', ...input }).length > 0);

test('public resource tools describe and materialize files without inline binary transfer', () => {
  accepts('folio_resources', { op: 'describe', revisionId: fingerprint });
  accepts('folio_resources', { op: 'materialize', revisionId: fingerprint, output: '/synthetic/export.wav' });
  rejects('folio_resources', { op: 'describe', revisionId: fingerprint, output: '/synthetic/export.wav' });
  rejects('folio_resources', { op: 'materialize', revisionId: fingerprint });
});

test('public operation tools bind new production work to the versioned sealed request', () => {
  accepts('folio_operations', { op: 'start', inputSnapshotId: fingerprint, idempotencyKey: 'synthetic', actor: 'user', operationContractVersion: 2, requestRevisionId: fingerprint });
  accepts('folio_operations', { op: 'recordExecution', operationId: fingerprint, executionId: 'synthetic-run', expectedExecutionHead: null, event: { type: 'prepared', requestDigest: fingerprint } });
  accepts('folio_operations', { op: 'inspect', operationId: fingerprint });
  rejects('folio_operations', { op: 'inspect', operationId: fingerprint, actor: 'user' });
});

test('public production group calls require their exact group and execution bindings', () => {
  const submission = { op: 'submitGroup', operationId: fingerprint, groupId: 'take-a', inputSnapshotId: fingerprint,
    executionId: 'synthetic-run', executionHead: checkpoint, requestDigest: fingerprint,
    resultRevisionIds: [fingerprint], groupManifestRevisionId: fingerprint };
  accepts('folio_operations', submission);
  const { groupId: _group, ...missingGroup } = submission;
  rejects('folio_operations', missingGroup);
  accepts('folio_operations', { op: 'reviewGroup', operationId: fingerprint, groupId: 'take-a', outputHashes: [fingerprint], findings: [], reviewer: 'host' });
  accepts('folio_operations', { op: 'decideGroup', operationId: fingerprint, groupId: 'take-a', receiptId: fingerprint, action: 'approve', actor: 'user', expectedCheckpoint: checkpoint });
  rejects('folio_operations', { op: 'review', operationId: fingerprint, groupId: 'take-a', outputHashes: [fingerprint], findings: [], reviewer: 'host' });
});

test('capability discovery and exact revision comparisons have distinct public contracts', () => {
  accepts('folio_resource_query', { op: 'capabilities' });
  accepts('folio_resource_query', { op: 'specification', capabilityId: 'local-broker-v1' });
  const input = { specificationRevisionId: fingerprint, requestRevisionId: fingerprint, candidateRevisionIds: [],
    profileRevisionId: fingerprint, pipelineRevisionId: fingerprint, policyRevisionId: fingerprint,
    scopeId: 'episode-1', search: { completeness: 'partial', reason: 'Only explicit candidates were inspected.' } };
  accepts('folio_resource_query', { op: 'readiness', ...input });
  accepts('folio_resource_query', { op: 'retainReadiness', resourceId: 'report', ...input });
  rejects('folio_resource_query', { op: 'readiness', ...input, search: { completeness: 'complete' } });
  rejects('folio_resource_query', { op: 'capabilities', candidateRevisionIds: [] });
});
