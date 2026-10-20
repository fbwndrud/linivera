const rule = (required, optional = []) => ({ required, allowed: [...required, ...optional] });
/** Declarative operation shapes mirror the public command boundaries. */
export const RESOURCE_ARGUMENTS = {
  folio_assets: {
    add: rule(['id', 'brief'], ['title']), update: rule(['id', 'expectedRev', 'brief'], ['title']),
    put: rule(['id', 'expectedRev', 'mediaType'], ['path', 'uri', 'contentHash', 'origin']),
    attach: rule(['id', 'expectedRev', 'nodeIds']), review: rule(['id', 'expectedRev', 'contentHash', 'checked', 'findings']),
    decide: rule(['id', 'expectedRev', 'reviewId', 'action'], ['reason', 'feedback']), list: rule([]), get: rule(['id']),
  },
  folio_tracking: {
    get: rule([], ['planId']), propose: rule(['expectedRev'], ['planId', 'plan', 'changes']),
    decide: rule(['proposalId', 'proposalDigest', 'action'], ['feedback']), apply: rule(['proposalId', 'proposalDigest', 'grantId']),
    query: rule([], ['type', 'subjectId', 'criterionId', 'nodeId', 'cursor', 'limit']),
  },
  folio_resources: {
    propose: rule(['resourceId', 'kind'], ['parents', 'owned', 'external', 'schemaRef']), read: rule(['revisionId']),
    decideSource: rule(['revisionId', 'expectedSelectionRevision', 'action']),
    importFile: rule(['resourceId', 'kind', 'path', 'mediaType'], ['parents', 'schemaRef', 'contentHash']), importAsset: rule(['assetId', 'expectedRev']),
  },
  folio_inputs: {
    prepare: rule(['revisionIds', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId'], ['externalMode']), verify: rule(['inputSnapshotId']),
  },
  folio_policy: {
    issue: rule(['grantId', 'policyRevisionId', 'profileRevisionId', 'pipelineRevisionId', 'actor', 'actions', 'resourceIds', 'expiresAt', 'expectedCheckpoint', 'authority']),
    revoke: rule(['grantId', 'expectedCheckpoint', 'authority']), status: rule(['grantId']),
  },
  folio_operations: {
    start: rule(['inputSnapshotId', 'idempotencyKey', 'actor'], ['grantId']),
    submit: rule(['operationId', 'requestId', 'inputSnapshotId', 'resultRevisionIds'], ['reportedTrace']),
    review: rule(['operationId', 'outputHashes', 'findings', 'reviewer']),
    decide: rule(['operationId', 'receiptId', 'expectedCheckpoint', 'action', 'actor'], ['grantId']),
  },
  folio_resource_query: { query: rule([], ['resourceId', 'selector', 'freshness']), refresh: rule([], ['checkpoint']), graph: rule([], ['resourceId', 'direction', 'depth', 'limit']) },
  folio_embeddings: { index: rule([], ['dimension', 'freshness']), search: rule(['generationId', 'text'], ['freshness', 'limit']) },
};
