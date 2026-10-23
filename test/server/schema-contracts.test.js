import test from 'node:test';
import assert from 'node:assert/strict';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { TOOLS } from '../../server/tools/definitions.js';
import { validateInput } from '../../server/validate-input.js';

const provider = new AjvJsonSchemaValidator();
const schemaOf = (name) => TOOLS.find((tool) => tool.name === name).inputSchema;
const VALID = {
  folio_motion: [{ op: 'plan', inputSnapshotId: 'snapshot' }, { op: 'render', inputSnapshotId: 'snapshot', idempotencyKey: 'movie', actor: 'user' }, { op: 'compile', inputSnapshotId: 'snapshot', idempotencyKey: 'timeline', actor: 'host', grantId: 'grant' }],
  folio_assets: [{ op: 'list' }], folio_tracking: [{ op: 'get' }],
  folio_resources: [{ op: 'propose', resourceId: 'synthetic', kind: 'note', owned: { bytes: 'synthetic', mediaType: 'text/plain' } },
    { op: 'inspectStructure', revisionId: 'source', format: 'glb' },
    { op: 'inspectStructure', revisionId: 'source', format: 'xmeml', parserVersion: 1 },
    { op: 'inspectStructure', revisionId: 'source', format: 'aseprite' },
    { op: 'inspectStructure', revisionId: 'source', format: 'runware-image-response' },
    { op: 'inspectStructure', revisionId: 'source', format: 'minimax-video-query' },
    { op: 'inspectStructure', revisionId: 'source', format: 'kling-video-query' },
    { op: 'inspectStructure', revisionId: 'source', format: 'delivery-record' },
    { op: 'inspectStructure', revisionId: 'source', format: 'provider-response', dependencyManifestRevisionId: 'contract' },
    { op: 'normalizeStructure', resourceId: 'structure', sourceRevisionId: 'source', format: 'project-manifest', structureBindings: [] },
    { op: 'inspectStructure', revisionId: 'source', format: 'comfy-ui', parserVersion: 2, dependencyManifestRevisionId: 'contract' },
    { op: 'normalizeStructure', resourceId: 'structure', sourceRevisionId: 'source', format: 'comfy-api', structureBindings: [{ referenceKey: '/1/inputs/image', revisionId: 'image' }] }],
  folio_inputs: [{ op: 'verify', inputSnapshotId: 'snapshot' }], folio_policy: [{ op: 'status', grantId: 'grant' }],
  folio_operations: [{ op: 'start', inputSnapshotId: 'snapshot', idempotencyKey: 'once', actor: 'user' }],
  folio_resource_query: [{ op: 'query' }], folio_embeddings: [{ op: 'index', dimension: 128 }],
  folio_init: [{ title: '합성 작품', preset: 'scene' }], folio_status: [{}],
  folio_run: [{}, { node: 'next-recheck', mode: 'recheck' }, { node: 'a', mode: 'recommit' }, { node: 'next', variant: 'en' }],
  folio_resume: [{ runId: 'r', answers: {} }],
  folio_decide: [{ runId: 'r', action: 'approve' }, { runId: 'r', action: 'skip', reason: '작가 요청' }, { runId: 'r', action: 'request_revision', feedback: '고쳐 주세요' }],
  folio_structure: [{ op: 'add', level: 'scene', id: 'a' }, { op: 'move', nodeId: 'a', index: 0 }, { op: 'wrap', nodeIds: ['a'], level: 'chapter', id: 'c' }],
  folio_find: [{ query: 'node', id: 'a' }, { query: 'rename', id: 'hero', newName: '주인공' }, { query: 'links', id: '*' }],
  folio_view: [{}], folio_config: [{}, { checkDraft: { words: ['운명'] } }],
  folio_occurrences: [{ op: 'submit', surface: { kind: 'node', id: 'a' }, items: [] }, { op: 'rename', entityId: 'hero', newName: '주인공', planDigest: 'digest' }],
  folio_sources: [{ op: 'add', id: 'ref', text: '합성 자료' }, { op: 'add', id: 'ref', path: '/tmp/ref.txt' }, { op: 'list' }, { op: 'get', id: 'ref' }, { op: 'link', nodeId: 'a', claims: [] }],
  folio_image: [{ op: 'start', assetId: 'picture' }, { op: 'resume', runId: 'i' }, { op: 'resume', runId: 'i', answers: {} }, { op: 'decide', runId: 'i', action: 'approve' }, { op: 'pending' }],
  folio_import_vibelore: [{ from: '/tmp/source' }], folio_export: [{ output: '/tmp/book' }, { op: 'export', output: '/tmp/book' }, { op: 'check' }],
};
const INVALID = {
  folio_resources: [{ op: 'inspectStructure', revisionId: 'source', format: 'unknown' }, { op: 'normalizeStructure', resourceId: 'structure', sourceRevisionId: 'source', format: 'gltf' },
    { op: 'inspectStructure', revisionId: 'source', format: 'otio', parserVersion: 3 },
    { op: 'inspectStructure', revisionId: 'source', format: 'srt', structureBindings: [] }],
  folio_motion: [{ op: 'render', inputSnapshotId: 'snapshot' }, { op: 'plan', inputSnapshotId: 'snapshot', actor: 'user' }, { op: 'assemble', inputSnapshotId: 'snapshot', idempotencyKey: 'movie', actor: 'user', width: 100 }],
  folio_structure: [{ op: 'add' }, { op: 'move', nodeId: 'a', title: 'extra' }, { op: 'wrap', nodeIds: [], level: 'chapter', id: 'c' }],
  folio_sources: [{ op: 'get' }, { op: 'list', text: 'extra' }, { op: 'add', id: 'ref' }, { op: 'add', id: 'ref', text: '자료', path: '/tmp/ref.txt' }, { op: 'link', nodeId: 'a' }],
  folio_occurrences: [{ op: 'submit' }, { op: 'rename', entityId: 'hero', newName: '주인공' }],
  folio_image: [{ op: 'start' }, { op: 'pending', assetId: 'extra' }, { op: 'decide', runId: 'i' }, { op: 'decide', runId: 'i', action: 'skip' }],
  folio_find: [{ query: 'rename', id: 'hero' }],
  folio_decide: [{ runId: 'r', action: 'skip' }, { runId: 'r', action: 'skip', reason: ' \n ' }, { runId: 'r', action: 'request_revision' }, { runId: 'r', action: 'request_revision', feedback: ' ' }],
  folio_run: [{ mode: 'recommit' }, { mode: 'recheck' }, { mode: 'recommit', node: 'next' }, { node: 'next-recheck' }, { node: 'a', variant: 'en', mode: 'recheck' }],
  folio_export: [{}, { op: 'export' }],
};

test('모든 도구의 조건별 입력을 표준 검증기와 같은 방식으로 받거나 거부한다', () => {
  for (const tool of TOOLS) {
    const standard = provider.getValidator(tool.inputSchema);
    const cases = [...VALID[tool.name].map((args) => [args, true]), ...(INVALID[tool.name] ?? []).map((args) => [args, false]),
      [{}, false], [{ root: '/tmp/work', extra: true }, false], [{ root: 3 }, false]];
    for (const [args, expected] of cases) {
      const input = Object.hasOwn(args, 'root') || Object.keys(args).length === 0 && expected === false ? args : { root: '/tmp/work', ...args };
      const before = structuredClone(input);
      assert.equal(standard(input).valid, expected, `${tool.name}: ${JSON.stringify(input)}`);
      assert.equal(validateInput(tool.inputSchema, input).length === 0, expected, `${tool.name}: ${JSON.stringify(input)}`);
      assert.deepEqual(input, before, 'default를 넣거나 인자를 변환하지 않는다');
    }
  }
});

test('모든 명명된 중첩 인자는 설명이 있고 동작·출력 계약이 공개된다', () => {
  function described(schema) {
    for (const child of Object.values(schema.properties ?? {})) {
      assert.equal(typeof child.description, 'string'); assert.ok(child.description.length > 0);
      described(child); if (child.items) described(child.items);
    }
  }
  for (const tool of TOOLS) {
    described(tool.inputSchema);
    assert.deepEqual(Object.keys(tool.annotations).sort(), ['destructiveHint', 'idempotentHint', 'openWorldHint', 'readOnlyHint']);
    const validate = provider.getValidator(tool.outputSchema);
    assert.equal(validate({ error: { code: 'TOOL_INPUT_INVALID', message: 'bad input', details: {} } }).valid, true);
    assert.equal(validate({}).valid, false);
    assert.equal(validate({ result: {}, error: {} }).valid, false);
  }
  assert.equal(TOOLS.find((t) => t.name === 'folio_config').annotations.readOnlyHint, true);
  assert.equal(TOOLS.find((t) => t.name === 'folio_sources').annotations.readOnlyHint, false);
  assert.equal(TOOLS.find((t) => t.name === 'folio_find').annotations.readOnlyHint, false, '파생 색인 캐시를 쓸 수 있다');
});

test('검증기는 타입 없는 부분 스키마·boolean·분기·객체 const를 처리한다', () => {
  const cases = [
    [{ if: false, then: false, else: true }, {}, true], [{ not: false }, {}, true], [{ not: true }, {}, false],
    [{ properties: { x: false } }, { x: null }, false], [{ required: ['x'] }, {}, false],
    [{ const: { a: [1] } }, { a: [1] }, true], [{ const: { a: [1] } }, { a: [2] }, false],
    [{ anyOf: [{ type: 'null' }, { type: 'string' }] }, null, true],
    [{ oneOf: [{ type: 'string' }, { minLength: 1 }] }, 'a', false],
    [{ type: 'array', items: false }, [], true], [{ type: 'array', items: false }, [1], false],
    [{ type: 'string', maxLength: 1 }, '😀', true], [{ type: 'string', minLength: 2 }, '😀', false],
  ];
  for (const [schema, value, expected] of cases) {
    assert.equal(provider.getValidator(schema)(value).valid, expected);
    assert.equal(validateInput(schema, value).length === 0, expected);
  }
  const errors = validateInput(schemaOf('folio_structure'), { root: '/tmp/work', op: 'add' });
  assert.deepEqual(errors.map((e) => e.path).sort(), ['$.id', '$.level']);
});
