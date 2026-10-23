import { embeddingsDefinition } from './embeddings.js';
import { motionDefinition } from './motion.js';
import { resourcesDefinition } from './resources.js';
import { inputsDefinition } from './inputs.js';
import { policyDefinition } from './policy.js';
import { operationsDefinition } from './operations.js';
import { resourceQueryDefinition } from './resource-query.js';
const ROOT = { type: 'string', minLength: 1, description: '작가가 고른 작품 폴더의 절대 경로. 서버는 절대 경로인지만 확인하고 폴더를 제한하지 않는다 — 작가가 고른 폴더만 넘긴다' };
import { inputConditions } from './input-contracts.js';
import { describeProperties, toolAnnotations } from './metadata.js';
import { outputSchema } from './output-contracts.js';
const ID = { type: 'string', minLength: 1 };
const TEXT = { type: 'string' };
const QUOTE = { type: 'string', minLength: 1, maxLength: 500 };
const NAME = { type: 'string', minLength: 1, maxLength: 200 };
const SURFACE = {
  type: 'object', additionalProperties: false, required: ['kind', 'id'],
  properties: { kind: { type: 'string', enum: ['node', 'entity', 'asset', 'source'] }, id: ID, field: TEXT },
};
const ITEM = {
  type: 'object', additionalProperties: false, required: ['entityId', 'kind', 'quote'],
  properties: { entityId: ID, kind: { type: 'string', enum: ['appearance', 'mention'] }, quote: QUOTE, before: TEXT, after: TEXT },
};

const SPAN = { type: 'object', additionalProperties: false, required: ['id', 'quote'], properties: { id: ID, quote: QUOTE } };
const LINK = { type: 'object', additionalProperties: false, required: ['sourceId', 'quote'], properties: { sourceId: ID, quote: QUOTE } };
const CLAIM = {
  type: 'object', additionalProperties: false, required: ['quote', 'sources'],
  properties: { quote: QUOTE, before: TEXT, after: TEXT, sources: { type: 'array', items: LINK, maxItems: 20 } },
};

const tool = (name, description, properties = {}, required = []) => ({
  name, description, annotations: toolAnnotations(name), outputSchema: outputSchema(name),
  inputSchema: { type: 'object', properties: describeProperties({ root: ROOT, ...properties }, name), required: ['root', ...required], additionalProperties: false, ...inputConditions(name, properties) },
});

/** 기본 도구 여덟 개(설계 §16). */
export const BASE_TOOL_NAMES = Object.freeze([
  'folio_init', 'folio_status', 'folio_run', 'folio_resume', 'folio_decide', 'folio_structure', 'folio_find', 'folio_view',
]);

export const TOOLS = Object.freeze([
  tool('folio_init', "Create a new writing work. The first pack provides the starting structure and writing steps; novel is the default. Choose a preset such as serial, novel, scene, textbook, history, guide, sourcebook, reference, picturebook, fairytale or gamebook from the first pack. Unknown presets return details.packPresets. Existing work.yaml is preserved and returns created:false. Optional features control extra capabilities, never the required safeguards.",
    { title: ID, preset: ID, language: { type: 'string', minLength: 1, maxLength: 35 }, packs: { type: 'array', items: ID, minItems: 1 }, features: { type: 'object', additionalProperties: { type: 'boolean' } } }, ['title', 'preset']),
  tool('folio_status', "Show the next section, work in progress and pending questions. Identify sections needing another review, new checks, must-fix issues, or review and finalization of edited text. Include version status, appearance and evidence links needing relinking, and activity-record verification. Finalized means reviewed and recorded, not published online."),
  tool('folio_run', "Continue one section through its writing steps. normal writes and reviews; recheck reviews finalized text without rewriting; recommit reviews and finalizes edited text and requires a section id. node defaults to next; next-recheck requires mode recheck. Non-main versions use normal only. Results: needs_model (waiting for AI), needs_user (your decision), done, idle, waiting_children or skipped.",
    {
      node: ID, mode: { type: 'string', enum: ['normal', 'recheck', 'recommit', 'tracking-backfill'] },
      variant: ID,
    }),
  tool('folio_resume', "Answer pending AI requests and continue writing. Supply every requested requestId with a text answer in answers. Use the runId returned for this work.",
    { runId: ID, answers: { type: 'object', additionalProperties: { type: 'string' } } }, ['runId', 'answers']),
  tool('folio_decide', "Record the author’s decision: approve, request_revision with feedback, or skip with a reason. Accepting a block issue requires a reason. Active hard issues must be fixed and cannot be approved. The AI assistant must convey the author’s actual decision.",
    { runId: ID, action: { type: 'string', enum: ['approve', 'request_revision', 'skip'] }, feedback: TEXT, reason: TEXT }, ['runId', 'action']),
  tool('folio_structure', "Add, move or group sections. add requires level and id; move requires nodeId; wrap requires nodeIds, level and id. Optional parentId selects the group; index is the zero-based position. Structure changes are refused while a writing run is open.",
    {
      op: { type: 'string', enum: ['add', 'move', 'wrap'] }, parentId: ID, level: ID, id: ID, title: TEXT, brief: TEXT,
      index: { type: 'integer', minimum: 0, maximum: 100000 }, nodeId: ID, nodeIds: { type: 'array', items: ID, minItems: 1 },
    }, ['op']),
  tool('folio_find', "Find sections, definitions, appearances, events and links. candidates lists possible name matches; rename previews changes and requires newName, without applying them. blocks (figure numbers, footnotes, citations and issues), bibliography (cited sources), terms (index), and links accept a section id (including descendants) or * for the whole work. links lists outgoing links, backlinks and broken links.",
    {
      query: { type: 'string', enum: ['node', 'entity', 'usages', 'events', 'candidates', 'rename', 'blocks', 'bibliography', 'terms', 'links'] }, id: ID,
      kind: SURFACE.properties.kind, newName: NAME, keepOldName: { type: 'boolean' }, include: { type: 'array', items: ID, maxItems: 500 },
      exclude: { type: 'array', items: ID, maxItems: 500 },
    }, ['query', 'id']),
  tool('folio_view', "Open the local review viewer and return its url. Read sections, definitions, review records, writing steps, connections, story threads, checks, sources and references. Korean/English UI language is independent of Reading edition. The edition selector switches section text, section review records and Web/EPUB publication between the original and declared variants; settings and tracking use the original. The server listens on 127.0.0.1 and requires the viewing token. Reuse an existing viewer; close after 30 idle minutes, Close viewer, or server exit. Only unlocked step settings can be changed. A missing build returns built:false and setup hint. Review-view export uses exports/viewer.", { nodeId: ID }),
  tool('folio_occurrences', "Record exact appearance quotes with submit {surface, items}; any invalid quote rejects the whole batch. rename applies the author-approved folio_find rename plan using planDigest. Recorded appearances are selected by default; name-scan candidates require explicit inclusion. Return recommit section ids when finalized text changes: review and finalize those changes.",
    {
      op: { type: 'string', enum: ['submit', 'rename'] }, surface: SURFACE, items: { type: 'array', items: ITEM, maxItems: 500 },
      entityId: ID, newName: NAME, keepOldName: { type: 'boolean' }, include: { type: 'array', items: ID, maxItems: 500 },
      exclude: { type: 'array', items: ID, maxItems: 500 }, planDigest: ID,
    }, ['op']),
  tool('folio_sources', "Add, list or get reference sources, or link claims to supporting quotes. add requires id and exactly one of text or path. Copy a regular, non-symlink local file up to 10MiB once; never overwrite the registered original. Return the read path, byte count and content fingerprint. link requires nodeId and claims; any invalid quote rejects the whole batch. Reliability is author-supplied, not a truth certification.",
    {
      op: { type: 'string', enum: ['add', 'list', 'get', 'link'] }, id: ID, title: { type: 'string', maxLength: 200 }, date: { type: 'string', maxLength: 40 },
      reliability: { type: 'string', enum: ['low', 'medium', 'high'] }, spans: { type: 'array', items: SPAN, maxItems: 200 },
      text: { type: 'string', minLength: 1, maxLength: 1000000 }, path: { type: 'string', minLength: 1, maxLength: 4096 },
      nodeId: ID, claims: { type: 'array', items: CLAIM, maxItems: 200 },
    }, ['op']),
  tool('folio_config', "Read available writing steps, required safeguards, selected and recommended check groups, and active check settings. workKind adds work-type recommendations; node adds section recommendations. checkDraft validates a custom check without saving it. This tool is read only.",
    { checkDraft: { type: 'object' }, workKind: ID, node: ID }),
  tool('folio_assets', '제공자 독립 이미지 자산 관리. 생성·편집·시각 검토는 호스트가 한다. add(id,brief,title?) 설명서; update(id,expectedRev,brief,title?) 새 버전; put(id,expectedRev,path 또는 uri,mediaType,contentHash?,origin?) 결과 인계; attach(id,expectedRev,nodeIds) 사용 위치; review(id,expectedRev,contentHash,checked,findings) 해당 파일의 자기검토; decide(id,expectedRev,reviewId,action,reason?/feedback?) 작가 결정; list/get(id) 조회·이력. 파일 사본만 바이트 확인 가능하며 URI는 다운로드·승인하지 않는다. 검토 ID 목록은 get의 checks로 확인한다. hard 승인 불가, block은 작가 이유 필수, advisory는 자동 교체하지 않는다. 쓰기는 열린 원고 실행이 있으면 거부한다.', {
    op: { type: 'string', enum: ['add', 'update', 'put', 'attach', 'review', 'decide', 'list', 'get'] }, id: ID,
    expectedRev: ID, title: { type: 'string', maxLength: 200 }, brief: { type: 'object' },
    path: { type: 'string', minLength: 1, maxLength: 4096 }, uri: { type: 'string', minLength: 1, maxLength: 4096 },
    mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'] },
    contentHash: ID, origin: { type: 'object', additionalProperties: false, properties: { provider: NAME, imageId: NAME, model: NAME } },
    nodeIds: { type: 'array', items: ID, maxItems: 500 }, checked: { type: 'array', items: ID, maxItems: 20 },
    findings: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: false, required: ['checkId', 'code', 'message'], properties: { checkId: ID, code: { type: 'string', maxLength: 100 }, message: { type: 'string', maxLength: 1000 }, location: { type: 'string', maxLength: 500 } } } },
    reviewId: ID, action: { type: 'string', enum: ['approve', 'request_revision'] }, reason: { type: 'string', maxLength: 2000 }, feedback: { type: 'string', maxLength: 2000 },
  }, ['op']),
  tool('folio_tracking', '작품별 추적 계획과 대상을 관리한다. get(planId 기본 main); propose(expectedRev: null 또는 현재 rev, plan 또는 changes 중 하나); decide(proposalId,proposalDigest,action approve/request_revision, 수정 요청은 feedback 필수): 작가의 실제 결정; apply(proposalId,proposalDigest,grantId): 활성 위임 아래 새 대상·비고정 기준 추가만 source host로 반영한다. query(type entities/observations/evidence/history 기본history, subjectId?/criterionId?/nodeId?,cursor?,limit 기본50 최대200): 경계 있는 정본 조회. 제안은 승인 전 적용되지 않는다. 열린 원고 실행 중 쓰기는 거부한다.', {
    op: { type: 'string', enum: ['get', 'propose', 'decide', 'apply', 'query'] }, planId: { type: 'string', enum: ['main'] },
    expectedRev: { type: ['string', 'null'] }, plan: { type: 'object' },
    changes: { type: 'object', additionalProperties: false, properties: { subjects: { type: 'array', items: { type: 'object' } }, criteria: { type: 'array', items: { type: 'object' } }, plan: { type: 'object' } } },
    proposalId: ID, proposalDigest: ID, grantId: ID, action: { type: 'string', enum: ['approve', 'request_revision'] },
    feedback: { type: 'string', maxLength: 4000 }, type: { type: 'string', enum: ['entities', 'observations', 'evidence', 'history'] }, subjectId: ID, criterionId: ID, nodeId: ID,
    cursor: { type: 'string', pattern: '^(0|[1-9][0-9]*)$' }, limit: { type: 'integer', minimum: 1, maximum: 200 },
  }, ['op']),
  ...[resourcesDefinition, inputsDefinition, policyDefinition, operationsDefinition, resourceQueryDefinition, embeddingsDefinition, motionDefinition].map((definition) => ({
    ...definition, annotations: toolAnnotations(definition.name), outputSchema: outputSchema(definition.name),
    inputSchema: { ...definition.inputSchema, properties: describeProperties(definition.inputSchema.properties, definition.name),
      ...inputConditions(definition.name, Object.fromEntries(Object.entries(definition.inputSchema.properties).filter(([key]) => key !== 'root'))) },
  })),
  tool('folio_image', "Create and review one image separately from writing (image pack and images feature required). start requires a new assetId; nodeId is optional. Answer the brief, generation and self-review requests with resume. The host generates a regular PNG/JPG/GIF/WebP file up to 20MiB and supplies its absolute path. decide conveys approval, revision feedback or a skip reason. Approval records the image in assets once; add ![[asset:id]] to the manuscript separately and review and finalize changes. An interrupted finalization can resume with runId alone. pending shows the open image run or null.",
    {
      op: { type: 'string', enum: ['start', 'resume', 'decide', 'pending'] }, assetId: ID, nodeId: ID, runId: ID,
      answers: { type: 'object', additionalProperties: { type: 'string' } }, action: { type: 'string', enum: ['approve', 'request_revision', 'skip'] }, feedback: TEXT, reason: TEXT,
    }, ['op']),
  tool('folio_import_vibelore', "Read a chosen Vibelore work and copy supported episodes, definitions, plans, review history and episode.svg images to a new Linivera folder. The source is read only. Imported sections are not Linivera-reviewed; use mode recommit to review and finalize them. root must not exist or be inside from. Report skipped files as warnings. cleanupPending identifies target/temp paths requiring attention; IMPORT_TEMP_CLEANUP_PENDING means the work was created but temporary cleanup remains.",
    { from: { type: 'string', minLength: 1, maxLength: 4096 }, title: { type: 'string', maxLength: 200 } }, ['from']),
  tool('folio_export', "Check publication inputs or export a read-only web or EPUB edition. op check writes nothing; export is the default and requires a new output folder outside the work with an existing parent. Never overwrite an output folder. variant defaults to main; missing version text is not replaced with original text. Web supports page layouts and browser printing to PDF; the engine does not generate PDF directly. EPUB uses flowing pages. Export does not change the manuscript or create a review record. Report draft, imported, edited text and layout warnings; inspect target/temp when cleanupPending is true.",
    { op: { type: 'string', enum: ['export', 'check'] }, format: { type: 'string', enum: ['web', 'epub'] }, variant: ID, language: { type: 'string', minLength: 1, maxLength: 35 }, output: { type: 'string', minLength: 1, maxLength: 4096 } }),
]);
