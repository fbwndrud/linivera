import { RESOURCE_DESCRIPTIONS } from './resource-metadata.js';
const DESCRIPTIONS = {
  ...RESOURCE_DESCRIPTIONS,
  revision: 'Saved version to read. Omit for the current version.',
  expectedRev: 'Current version from get or the last write. Use null only before the first version.',
  snapshot: 'Complete candidate evidence, claims and questions. A proposal is not adopted until the author approves it.',
  proposalId: 'Stored proposal id. Inspect the exact proposal before relaying an author decision.',
  decision: 'Actual author approval or rejection text. The host must not invent it.',
  evidence: 'Evidence records kept separately from claims and unresolved questions.',
  questions: 'Unresolved or resolved questions, with support, objections and resolution reasons.',
  basis: 'Evidence or resolution basis. Inference cannot become accepted evidence automatically.',
  perspectiveId: 'Stable definition id for a private viewpoint; null means the shared world viewpoint.',
  anchor: 'Exact saved source or finalized section version, quote and location.',
  rev: 'Exact content fingerprint of the referenced version.',
  hash: 'Fingerprint of the original bytes or finalized section text.',
  span: 'Exact UTF-16 text range or author-declared passage id.',
  start: 'Inclusive UTF-16 quote start position.', end: 'Exclusive UTF-16 quote end position.',
  receiptId: 'Matching finalized section review record id.',
  dependencies: 'Evidence ids required together for derived evidence. Cycles are refused.',
  limitations: 'Limits of an inference. Required for inferred evidence.',
  support: 'Evidence ids supporting this claim or question in the same viewpoint.',
  against: 'Evidence ids opposing this claim or question; kept in history.',
  status: 'Declared claim or question state; current invalid evidence is reported separately.',
  claimIds: 'Related claim ids from this snapshot.',
  required: 'Whether an unresolved question prevents finalizing its selected sections. Default false.',
  resolution: 'Resolution basis and the author-reviewed reason.',
  fields: 'Interview fields to confirm using the actual author confirmation.',
  value: 'Interpreted answer, shown separately from the original answer.',
  raw: 'Actual original author answer. Do not substitute host recommendations.',
  confirmation: 'Actual author confirmation of the interpreted fields.',

  root: "Absolute path to the work folder chosen by the author. Required. The server does not restrict folders; pass only the author-chosen folder.",
  title: "Display title for the work, section or source. Free text, separate from its id.",
  preset: "Starting structure supplied by the first pack. Consult details.packPresets for available choices.",
  packs: "Pack ids. The first pack determines writing steps and presets; default [novel].",
  features: "Optional capabilities on or off. Omitted settings use their defaults. Required content, review-record and must-fix safeguards remain active.",
  node: "Section id, next or next-recheck. next selects the next section; next-recheck requires mode recheck; recommit requires an explicit section id.",
  mode: "normal: write and review; recheck: review finalized text; recommit: review and finalize edited text. Recheck and recommit require node.",
  variant: "Version id declared in work.yaml. main is the original. Other versions use normal mode and require a finalized original writing section.",
  runId: "Run id returned for this work. Do not mix writing and image run ids.",
  answers: "Object mapping every pending requestId to its text answer. Answer all current requests and no unknown ids.",
  action: "Author decision: approve; request_revision with feedback; skip with reason. Active hard issues cannot be approved; accepting block issues needs a reason.",
  feedback: "Author’s revision request or approval comments. Nonblank feedback is required for request_revision.",
  reason: "Author’s reason for accepting an issue or skipping a run. Nonblank text is required for skip.",
  op: "Operation to perform. Required and permitted arguments depend on the operation.",
  parentId: "Parent section id. Omit to place the section at the top level.",
  level: "Level name declared in work.yaml, such as arc, episode or scene.",
  id: "Target id. Section, definition, source and file ids use lowercase letters, numbers and hyphens; see the operation for the target type.",
  brief: "Writing instructions or a short summary for the new section.",
  index: "Zero-based position among sibling sections. Omit to append at the end.",
  nodeId: "Section id in the work structure.",
  nodeIds: "Existing sibling section ids to group. Structure and order are checked against the current work.",
  query: "Lookup type. rename previews a name change without applying it. blocks, bibliography, terms and links accept id * for the whole work.",
  kind: "Content type: node (section), entity (definition), asset (image), source. candidates defaults to node.",
  newName: "New display name for a definition. Required for rename.",
  keepOldName: "Keep the previous name as an alias after renaming. Default true.",
  include: "Additional location ids selected from changes/candidates. Recorded appearances are included by default; scan candidates must be explicitly chosen.",
  exclude: "Location ids to leave out of the proposed name change.",
  surface: "Content location to record appearances in. kind and id are required; field chooses a supported text field.",
  field: "Text field for this content type. Omit to use its default body field.",
  items: "Complete appearance list for this content location. An empty list clears the current list.",
  entityId: "Id of a definition registered in the work.",
  quote: "Exact quote from the relevant text. Optional before/after context disambiguates repeated quotes.",
  before: "Optional text immediately before the quote to disambiguate its position.",
  after: "Optional text immediately after the quote to disambiguate its position.",
  planDigest: "Plan fingerprint returned by folio_find query rename. Apply the exact author-approved plan; obtain a new plan if the work changed.",
  date: "Optional source date as free display text.",
  reliability: "Author-supplied source reliability: low, medium or high. Not automatically assessed.",
  spans: "Quoted source passages, each with an id and a quote actually present in the source.",
  text: "Source text to import. add requires exactly one of text/path.",
  path: "Absolute path to an author-chosen regular, non-symlink source file, up to 10MiB. add requires exactly one of text/path.",
  claims: "Exact manuscript claims and supporting source quotes. Any invalid quote rejects the entire batch.",
  sources: "Supporting source quotes. Each contains sourceId and an exact quote from that source.",
  sourceId: "Registered source id.",
  checkDraft: "Custom check to validate: words/pattern (automatic) or rule/source/samples (AI review). Validation errors are returned in the result.",
  workKind: "Work type used to explain recommended check groups, such as novel, serial or textbook.",
  assetId: "New image id not already used in the work. Lowercase letters, numbers and hyphens.",
  from: "Absolute path to the Vibelore work to read only. root must be a new folder outside from.",
  format: "web: pages and browser printing; epub: flowing electronic book. No direct PDF generation.",
  language: "BCP 47 manuscript/publication language, such as ko or en-US, independent of Studio UI. init saves it in a new work; export overrides it for that output. Omit for legacy defaults.",
  output: "Absolute path to a new output folder outside the work. Its parent must exist. Required for export, which is the default operation.",
};
const DEFAULTS = {
  folio_init: { packs: ['novel'] }, folio_run: { node: 'next', mode: 'normal', variant: 'main' },
  folio_find: { kind: 'node', keepOldName: true, include: [], exclude: [] },
  folio_occurrences: { keepOldName: true, include: [], exclude: [] },
  folio_export: { op: 'export', format: 'web', variant: 'main' },
};

/** 모든 중첩 인자에 설명을 붙인다. 공통 이름의 다른 뜻은 도구별로 덮어쓴다. */
export function describeProperties(properties, name) {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => {
    const description = name === 'folio_find' && key === 'id' ? 'Lookup target id. Scoped lookups (blocks, bibliography, terms, links) accept a section id or *.'
      : key === 'kind' && value.enum?.includes('appearance') ? 'appearance: directly present; mention: referred to in the text.' : DESCRIPTIONS[key];
    const defaults = DEFAULTS[name] ?? {};
    return [key, { ...value, description: value.description ?? description,
      ...(Object.hasOwn(defaults, key) ? { default: defaults[key] } : {}),
      ...(value.properties ? { properties: describeProperties(value.properties, name) } : {}),
      ...(value.items?.properties ? { items: { ...value.items, properties: describeProperties(value.items.properties, name) } } : {}),
    }];
  }));
}

/** 조회도 캐시·서버를 만들 수 있어 실제 효과에 맞춰 보수적으로 표시한다. */
export function toolAnnotations(name) {
  const readOnly = ['folio_status', 'folio_config'].includes(name);
  return {
    readOnlyHint: readOnly,
    destructiveHint: ['folio_lore', 'folio_interview', 'folio_run', 'folio_resume', 'folio_decide', 'folio_structure', 'folio_occurrences', 'folio_assets', 'folio_tracking', 'folio_resources', 'folio_policy', 'folio_operations'].includes(name),
    idempotentHint: readOnly || ['folio_init', 'folio_find', 'folio_view'].includes(name),
    openWorldHint: false,
  };
}
