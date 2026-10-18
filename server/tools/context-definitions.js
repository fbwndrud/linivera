const ID = { type: 'string', minLength: 1, maxLength: 100 };
const TEXT = { type: 'string', minLength: 1, maxLength: 4000 };
const REV = { type: ['string', 'null'], description: 'Current version; null before the first proposal or answer.' };
const IDS = { type: 'array', items: ID, maxItems: 200 };
const PERSPECTIVE = { type: ['string', 'null'], minLength: 1, maxLength: 100 };
const SPAN = { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { type: 'string', enum: ['text', 'declared'] }, id: ID, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 } } };
const ANCHOR = { type: ['object', 'null'], additionalProperties: false, required: ['kind', 'id', 'rev', 'quote'], properties: {
  kind: { type: 'string', enum: ['source', 'node'] }, id: ID, rev: { type: 'string' }, hash: { type: 'string' }, quote: { ...TEXT, maxLength: 500 }, span: SPAN, receiptId: ID, before: { type: 'string' }, after: { type: 'string' },
} };
const EVIDENCE = { type: 'object', additionalProperties: false, required: ['id', 'basis', 'text'], properties: {
  id: ID, basis: { type: 'string', enum: ['author', 'explicit', 'attributed', 'inferred', 'derived'] }, text: TEXT,
  perspectiveId: PERSPECTIVE, anchor: ANCHOR, dependencies: IDS, limitations: { type: 'string', maxLength: 4000 },
} };
const CLAIM = { type: 'object', additionalProperties: false, required: ['id', 'entityId', 'text'], properties: {
  id: ID, entityId: ID, text: TEXT, perspectiveId: PERSPECTIVE,
  status: { type: 'string', enum: ['proposed', 'adopted', 'rejected', 'superseded'] }, support: IDS, against: IDS,
} };
const QUESTION = { type: 'object', additionalProperties: false, required: ['id', 'text'], properties: {
  id: ID, text: TEXT, perspectiveId: PERSPECTIVE, claimIds: IDS, support: IDS, against: IDS, required: { type: 'boolean' }, nodeIds: { ...IDS, description: 'Sections where this question is required. Empty means all sections.' },
  status: { type: 'string', enum: ['open', 'deferred', 'resolved'] },
  resolution: { type: ['object', 'null'], additionalProperties: false, required: ['basis', 'reason'], properties: { basis: { type: 'string', enum: ['verified', 'author_decision'] }, reason: TEXT } },
} };
const SNAPSHOT = { type: 'object', additionalProperties: false, properties: Object.fromEntries([['evidence', EVIDENCE], ['claims', CLAIM], ['questions', QUESTION]].map(([key, items]) => [key, { type: 'array', items, maxItems: 200 }])) };
const FIELDS = ['purpose', 'audience', 'language', 'surfaceEase', 'conceptPacing', 'inferenceLoad', 'complexityRamp'];
const FIELD = { type: 'string', enum: FIELDS };

export function contextToolDefinitions(tool) {
  return [
    tool('folio_lore', 'Manage approved lore, evidence and unresolved questions. propose stores a full candidate snapshot; decide relays actual author approval or rejection before adopting a version. get reads current validity, a saved revision, or a stored proposal; history lists the activity. Exact source/finalized-section quotes and viewpoints are checked. Inference and private beliefs are never automatically adopted as shared facts. Optional questions do not block writing; writes are refused during open writing runs.', {
      op: { type: 'string', enum: ['get', 'history', 'propose', 'decide'] }, revision: { type: 'string' }, expectedRev: REV,
      snapshot: SNAPSHOT, proposalId: { type: 'string' }, action: { description: 'Actual author approval or rejection of this proposal.', type: 'string', enum: ['approve', 'reject'] }, decision: TEXT,
    }, ['op']),
    tool('folio_interview', 'Keep original interview answers separate from interpreted values and author confirmation. answer records actual answers; confirm relays actual author confirmation. context stores a repeated brief without creating answers or confirmation. get/history resumes saved work. Unchanged values retain confirmation; changing language requires reconfirming the four reader axes. Writes are refused during open writing runs.', {
      op: { type: 'string', enum: ['get', 'history', 'context', 'answer', 'confirm'] }, revision: { type: 'string' }, expectedRev: REV,
      brief: { ...TEXT, maxLength: 8000, description: 'Repeated brief kept as context, not as an author answer.' }, answers: { description: 'Actual original author answers with interpreted values.', type: 'array', minItems: 1, maxItems: 7, items: { type: 'object', additionalProperties: false, required: ['field', 'value', 'raw'], properties: { field: FIELD, value: { ...TEXT, maxLength: 1000 }, raw: TEXT } } },
      fields: { type: 'array', minItems: 1, maxItems: 7, items: FIELD }, confirmation: TEXT,
    }, ['op']),
  ];
}
