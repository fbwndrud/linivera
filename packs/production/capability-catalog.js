const schemaVersion = 'linivera-capability-v1';
const checkedAt = '2026-10-23';
const input = (fieldPath, source, dataType, requirement = 'optional', constraints = {}, extra = {}) =>
  ({ fieldPath, role: fieldPath, source, dataType, requirement, constraints, ...extra });
const output = (role, dataType, mediaTypes, required = true, extra = {}) =>
  ({ role, dataType, mediaTypes, required, minCount: required ? 1 : 0, maxCount: 1, ...extra });
const evidence = (url, scope, unknown, kind = 'official') => ({ checkedAt, sources: [{ url, kind }], scope, unknown });
const identity = (provider, product, capability, model, endpoint) => ({ provider, product, capability, model, endpoint, schemaVersion });

export const capabilityCatalog = [
  {
    version: 1, id: 'fal-flux-schnell-v1',
    identity: identity('fal', 'flux', 'text-to-image', 'flux-schnell', 'fal-ai/flux/schnell'),
    support: { status: 'official-partial', execution: 'adapter' },
    inputs: [
      input('prompt', 'text', 'string', 'required', { minLength: 1, nonBlank: true, mediaTypes: ['text/plain'] }),
      input('num_images', 'parameter', 'integer', 'optional', { minimum: 1, maximum: 4, default: 1, origin: 'adapter-limit' }),
      input('image_size', 'parameter', 'string-or-size', 'optional', { enum: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'], positiveDimensions: true }),
      input('num_inference_steps', 'parameter', 'integer', 'optional', { minimum: 1 }),
      input('seed', 'parameter', 'integer'), input('guidance_scale', 'parameter', 'number', 'optional', { minimum: 0 }),
      input('sync_mode', 'parameter', 'boolean', 'optional', { enum: [false], origin: 'adapter-retention' }),
      input('enable_safety_checker', 'parameter', 'boolean'),
      input('output_format', 'parameter', 'string', 'optional', { enum: ['jpeg', 'png'], default: 'jpeg' }),
      input('acceleration', 'parameter', 'string', 'optional', { enum: ['none', 'regular', 'high'] }),
    ],
    outputs: [output('image', 'file', ['image/jpeg', 'image/png'], true, { countFrom: 'num_images' })],
    states: ['accepted', 'running', 'complete', 'partial', 'unknown', 'submission-unknown'],
    evidence: evidence('https://fal.ai/models/fal-ai/flux/schnell/api',
      ['현재 endpoint의 공개 입력/출력 필드와 기존 비동기 연결기 교집합', '1~4 후보는 저장소 연결기 제한'],
      ['공급자 계정별 정책·가용성', '미기재 크기·prompt 길이 상한', '이미지 내용·품질·안전성·권리', '모델 내부 버전 고정']),
  },
  {
    version: 1, id: 'elevenlabs-tts-timestamps-v1',
    identity: identity('elevenlabs', 'tts', 'text-to-speech', 'eleven_multilingual_v2', '/v1/text-to-speech/{voice_id}/with-timestamps'),
    endpointPattern: '^/v1/text-to-speech/[A-Za-z0-9_-]+/with-timestamps$', modelParameter: 'model_id',
    support: { status: 'official-partial', execution: 'adapter' },
    inputs: [
      input('text', 'text', 'string', 'required', { minLength: 1, mediaTypes: ['text/plain'] }),
      input('model_id', 'parameter', 'string', 'optional', { enum: ['eleven_multilingual_v2'], default: 'eleven_multilingual_v2' }),
      input('language_code', 'parameter', 'string', 'optional', { nullable: true }),
      input('voice_settings', 'parameter', 'object', 'optional', { nullable: true, propertyTypes: { stability: 'number', similarity_boost: 'number', style: 'number', use_speaker_boost: 'boolean', speed: 'number' } }),
      input('pronunciation_dictionary_locators', 'parameter', 'array', 'optional', { maxItems: 3, itemRequiredStrings: ['pronunciation_dictionary_id', 'version_id'] }),
      input('seed', 'parameter', 'integer', 'optional', { nullable: true, minimum: 0, maximum: 4294967295 }),
      input('previous_text', 'text', 'string', 'optional', { nullable: true, mediaTypes: ['text/plain'] }, { ignoredWhen: { fieldPath: 'previous_request_ids', operator: 'nonempty' } }),
      input('next_text', 'text', 'string', 'optional', { nullable: true, mediaTypes: ['text/plain'] }, { ignoredWhen: { fieldPath: 'next_request_ids', operator: 'nonempty' } }),
      input('previous_request_ids', 'parameter', 'array', 'optional', { nullable: true, maxItems: 3, itemType: 'string' }),
      input('next_request_ids', 'parameter', 'array', 'optional', { nullable: true, maxItems: 3, itemType: 'string' }),
      input('use_pvc_as_ivc', 'parameter', 'boolean', 'optional', { nullable: true }),
      input('apply_text_normalization', 'parameter', 'string', 'optional', { enum: ['auto', 'on', 'off'] }),
      input('apply_language_text_normalization', 'parameter', 'boolean'),
      input('output_format', 'parameter', 'string', 'optional', { enum: ['mp3_44100_128'], default: 'mp3_44100_128', origin: 'representative-subset' }),
      input('enable_logging', 'parameter', 'boolean'),
      input('optimize_streaming_latency', 'parameter', 'integer', 'optional', { nullable: true, minimum: 0, maximum: 4, deprecated: true }),
    ],
    outputs: [output('audio', 'file', ['audio/mpeg']), output('alignment', 'json', ['application/json'], false)],
    states: ['complete', 'partial', 'collection-unavailable', 'submission-unknown', 'failed'],
    evidence: evidence('https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps',
      ['기본 multilingual_v2 + MP3 대표 기능; audio_base64 및 원문/정규화 alignment', 'alignment는 공식 응답에서 선택 항목'],
      ['voice 접근·실행 권한·요금제', '모델별 text 길이 상한', '화자 정체성·내용·품질·권리', '최신 audio_effects 및 기타 모델/codec 전체 계약']),
  },
  {
    version: 1, id: 'meshy-text-to-3d-preview-v1',
    identity: identity('meshy', 'text-to-3d', 'text-to-3d', 'meshy-7.1', '/openapi/v2/text-to-3d'),
    modelParameter: 'ai_model', support: { status: 'official-partial', execution: 'adapter' },
    inputs: [
      input('mode', 'parameter', 'string', 'required', { enum: ['preview'] }),
      input('prompt', 'text', 'string', 'required', { minLength: 1, maxLength: 800, nonBlank: true, mediaTypes: ['text/plain'] }),
      input('ai_model', 'parameter', 'string', 'required', { enum: ['meshy-7.1'], origin: 'pinned-representative-model' }),
      input('target_formats', 'parameter', 'array', 'required', { minItems: 1, maxItems: 6, uniqueItems: true, itemEnum: ['glb', 'obj', 'fbx', 'usdz', 'stl', '3mf'], origin: 'adapter-explicit-selection' }),
      input('should_remesh', 'parameter', 'boolean'),
    ],
    outputs: [output('model', 'file', ['model/gltf-binary', 'model/obj', 'application/octet-stream', 'model/vnd.usdz+zip', 'model/stl', 'model/3mf'], true, { countFrom: 'target_formats', maxCount: 6 }),
      output('material', 'file', ['text/plain'], false, { maxCount: 4096 }),
      output('texture', 'file', ['image/png'], false, { maxCount: 4096 }), output('bundle', 'bundle', ['application/json'])],
    states: ['accepted', 'running', 'complete', 'partial', 'failed', 'canceled', 'unknown', 'submission-unknown'],
    evidence: evidence('https://docs.meshy.ai/en/api/text-to-3d',
      ['meshy-7.1 preview의 prompt/mode/target_formats/should_remesh만 실행', 'preview는 무텍스처 geometry; refine는 별도 작업', 'target_formats 명시 필수는 연결기 제한'],
      ['모델/texture 파일의 실제 내부 호환성·복원·품질·권리', '계정별 실행 권한·요금제', 'refine/rigging 및 기타 geometry 옵션은 이 명세 밖']),
  },
  {
    version: 1, id: 'local-broker-v1',
    identity: identity('local', 'broker', 'transform', 'host-defined', 'local-broker/v1'),
    support: { status: 'user-declared', execution: 'host-broker' },
    inputs: [
      input('instruction', 'text', 'string', 'required', { minLength: 1, nonBlank: true, mediaTypes: ['text/plain'] }),
      input('source', 'file', 'binary', 'required', { maxBytes: 2147483648 }),
      input('context', 'resource', 'context-package', 'optional', { kinds: ['context-package'] }),
    ],
    outputs: [output('result', 'json', ['application/json'])], states: ['complete', 'partial', 'failed', 'unknown'],
    evidence: evidence('docs/capability-specifications.md',
      ['호스트가 확보한 로컬 바이트/정확 판본을 사용하는 합성 변환 계약', '생성 공급자 API 또는 자동 네트워크 연결을 선언하지 않음'],
      ['공급자 동작·생성·재생·실행 권한·권리·출력 의미는 별도 검증 필요'], 'local-contract'),
  },
];
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }
freeze(capabilityCatalog);
