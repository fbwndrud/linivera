const rule = (required, optional = []) => ({ required, allowed: [...required, ...optional] });
/** Declarative operation shapes mirror the public command boundaries. */
export const RESOURCE_ARGUMENTS = {
  folio_motion: { plan: rule(['inputSnapshotId']), render: rule(['inputSnapshotId', 'idempotencyKey', 'actor'], ['grantId']), compile: rule(['inputSnapshotId', 'idempotencyKey', 'actor'], ['grantId']), assemble: rule(['inputSnapshotId', 'idempotencyKey', 'actor'], ['grantId']) },
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
    describe: rule(['revisionId']), materialize: rule(['revisionId', 'output']),
    importBundle: rule(['resourceId', 'manifest'], ['pathMappings', 'parents', 'schemaRef']),
    inspectStructure: rule(['revisionId', 'format'], ['parserVersion', 'dependencyManifestRevisionId']),
    normalizeStructure: rule(['resourceId', 'sourceRevisionId', 'format', 'structureBindings'], ['parserVersion', 'dependencyManifestRevisionId']),
  },
  folio_inputs: {
    select: rule(['scopeId', 'expectedScopeSelectionRevision', 'actor', 'reason', 'bindings', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId']),
    getSelection: rule(['scopeId'], ['checkpoint']),
    prepare: rule(['profileRevisionId', 'pipelineRevisionId', 'policyRevisionId'], ['revisionIds', 'externalMode', 'version', 'scopeId', 'scopeSelectionRevision', 'bindingKeys']), verify: rule(['inputSnapshotId']),
  },
  folio_policy: {
    issue: rule(['grantId', 'policyRevisionId', 'profileRevisionId', 'pipelineRevisionId', 'actor', 'actions', 'resourceIds', 'expiresAt', 'expectedCheckpoint', 'authority']),
    revoke: rule(['grantId', 'expectedCheckpoint', 'authority']), status: rule(['grantId']),
  },
  folio_operations: {
    start: rule(['inputSnapshotId', 'idempotencyKey', 'actor'], ['grantId', 'operationContractVersion', 'requestRevisionId']),
    submit: rule(['operationId', 'requestId', 'inputSnapshotId', 'resultRevisionIds'], ['reportedTrace']),
    review: rule(['operationId', 'outputHashes', 'findings', 'reviewer']),
    decide: rule(['operationId', 'receiptId', 'expectedCheckpoint', 'action', 'actor'], ['grantId']),
    recordExecution: rule(['operationId', 'executionId', 'expectedExecutionHead', 'event']),
    inspect: rule(['operationId'], ['executionId', 'executionHead', 'cursor', 'limit']),
    submitGroup: rule(['operationId', 'groupId', 'inputSnapshotId', 'executionId', 'executionHead', 'requestDigest', 'resultRevisionIds', 'groupManifestRevisionId']),
    reviewGroup: rule(['operationId', 'groupId', 'outputHashes', 'findings', 'reviewer']),
    decideGroup: rule(['operationId', 'groupId', 'receiptId', 'expectedCheckpoint', 'action', 'actor'], ['grantId']),
    recordSession: rule(['sessionId', 'expectedSessionHead', 'event']), inspectSession: rule(['sessionId'], ['sessionHead']),
  },
  folio_resource_query: { query: rule([], ['resourceId', 'selector', 'freshness']), refresh: rule([], ['checkpoint']),
    graph: rule([], ['resourceId', 'direction', 'depth', 'limit', 'cursor', 'generationId', 'boundaryLimit', 'edgeLimit']), indexGraph: rule([]),
    context: rule(['scopeId', 'purpose', 'budget'], ['contextRevisionId', 'pathId', 'timeLabel', 'revisionIds']) },
  folio_embeddings: { index: rule([], ['dimension', 'freshness']), search: rule(['generationId', 'text'], ['freshness', 'limit']) },
};
