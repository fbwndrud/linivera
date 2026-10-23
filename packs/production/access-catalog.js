import { capabilityCatalog } from './capability-catalog.js';

const checkedAt = '2026-10-23';
const onlineChecks = ['installation', 'exposure', 'authentication', 'permission', 'plan', 'credits'];
const chroma = {
  status: 'unknown', applicableRoutes: 'unknown', activation: 'unknown', expiresAt: 'unknown',
  reason: '공식 크레딧 팩 재조회 HTTP 403. 웹/API/MCP 적용과 활성화·기한을 확인하지 못함.',
  source: 'https://submit.chromaawards.com/pack', checkedAt,
};
const requirement = (status, action) => ({ status, action });
const onlineRequirements = (auth, creditAction) => ({
  signup: requirement('required', '공식 계정/개발자 화면에서 가입·계정 소유를 확인한다.'),
  authentication: { status: 'required', methods: auth, action: '호스트 secret 관리로 인증하고 비밀값 없이 상태만 기록한다.' },
  permission: requirement('account-dependent', '선택한 기능·모델·프로젝트에 대한 실행 권한과 키 제한을 확인한다.'),
  plan: requirement('account-dependent', '선택 기능을 현재 요금제로 사용할 수 있는지 확인한다.'),
  credits: requirement('account-dependent', creditAction),
});
const source = (url, scope) => ({ url, kind: 'official', scope });
function spec(id, capabilityId, route, requirements, sources, scope, unknowns, extra = {}) {
  return {
    version: 1, id, capabilityId,
    identity: structuredClone(capabilityCatalog.find((item) => item.id === capabilityId).identity),
    route, requiredChecks: onlineChecks, maxCheckAgeSeconds: 300, requirements,
    evidence: { checkedAt, sources, scope, unknowns }, chroma: structuredClone(chroma), ...extra,
  };
}

export const accessCatalog = [
  spec('fal-flux-api-v1', 'fal-flux-schnell-v1',
    { kind: 'api', official: true, direction: 'external-to-provider', locator: 'fal-ai/flux/schnell', version: '2026-10-23-public-docs' },
    onlineRequirements(['api-key'], '동일 endpoint의 현재 가격·계정 잔액·키의 지출 제한을 확인한다.'),
    [source('https://fal.ai/models/fal-ai/flux/schnell/api', 'FAL_KEY 인증·공개 queue endpoint')],
    ['기존 fal FLUX schnell 비동기 연결기와 공식 API 인증 교집합'],
    ['실계정 권한·현재 잔액·개별 제한', '웹 세션과 API 키의 동일 상태', 'Chroma 크레딧 적용']),
  spec('elevenlabs-tts-api-v1', 'elevenlabs-tts-timestamps-v1',
    { kind: 'api', official: true, direction: 'external-to-provider', locator: '/v1/text-to-speech/{voice_id}/with-timestamps', version: '2026-10-23-public-docs' },
    onlineRequirements(['api-key'], '음성/모델/codec 권한, 현재 크레딧·키 사용 제한을 공식 계정에서 확인한다.'),
    [source('https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps', 'xi-api-key 및 timestamps endpoint'),
      source('https://elevenlabs.io/mcp', 'OAuth hosted MCP와 API-key local MCP의 구별')],
    ['multilingual_v2 timestamps 기존 연결기; hosted MCP를 이 endpoint와 동일시하지 않음'],
    ['선택 voice 사용권·계정 권한·잔액', 'hosted Creative/Agents 범위와 timestamps 대응', 'Chroma 적용']),
  spec('meshy-preview-api-v1', 'meshy-text-to-3d-preview-v1',
    { kind: 'api', official: true, direction: 'external-to-provider', locator: '/openapi/v2/text-to-3d', version: '2026-10-23-public-docs' },
    onlineRequirements(['api-key'], '무료 GET /openapi/v1/balance로 사용 가능 잔액과 월간 만료를 확인하고 작업 비용을 따로 대조한다.'),
    [source('https://docs.meshy.ai/en/api/authentication', 'Bearer API key·월간 키 한도·IP allowlist'),
      source('https://docs.meshy.ai/en/api/balance', '무료 잔액 조회·pool/member/workspace 제한'),
      source('https://docs.meshy.ai/en/api/text-to-3d', 'preview 생성 API')],
    ['meshy-7.1 preview; 키별/팀별 제한은 실제 점검에서 확인'],
    ['실제 계정·팀·키의 허용 기능·요금제·잔액', 'Chroma 적용']),
  spec('meshy-preview-official-mcp-v1', 'meshy-text-to-3d-preview-v1',
    { kind: 'mcp', official: true, direction: 'external-to-provider', locator: '@meshy-ai/meshy-mcp-server', version: '0.6.5' },
    onlineRequirements(['host-environment-api-key'], '무료 meshy_check_balance 후 모델·옵션의 현재 비용과 키 한도를 대조한다. REST와 같은 크레딧을 사용한다.'),
    [source('https://docs.meshy.ai/en/api/ai', '공식 MCP·skill·REST와 같은 권한/요금'),
      source('https://github.com/meshy-dev/meshy-mcp-server/blob/main/package.json', '조사한 source package version 0.6.5'),
      source('https://github.com/meshy-dev/meshy-mcp-server/blob/main/src/tools/generation.ts', 'preview 고정·moderation:false·도구 이름'),
      source('https://github.com/meshy-dev/meshy-mcp-server/blob/main/src/tools/tasks.ts', '상태·다운로드와 URL-only fallback')],
    ['외부 호스트가 공급자를 호출하는 공식 도구; 제품 내부에 외부 MCP를 등록하는 기능이 아님',
      'MESHY_API_KEY는 호스트 secret으로 공급; 입력/증거/로그에 비밀값을 넣지 않음',
      '공식 source 0.6.5 교집합: prompt 2~800, preview 고정, mode 미전달, moderation:false 관측'],
    ['실제 설치 버전·tool schema와 source 일치', '실계정 기능 허용·plan·잔액', 'texture 의존성·실제 호환성', 'Chroma 적용'],
    { toolContract: { version: 1, implementation: 'meshy-mcp-0.6.5', fixedParameters: {
      mode: 'preview', moderation: false, include_textures: false,
    }, tools: {
      create: 'meshy_text_to_3d', status: 'meshy_get_task_status', download: 'meshy_download_model', balance: 'meshy_check_balance',
    } } }),
  spec('meshy-preview-official-skill-v1', 'meshy-text-to-3d-preview-v1',
    { kind: 'skill', official: true, direction: 'external-to-provider', locator: 'meshy-dev/meshy-3d-agent', version: '2026-10-23-source-snapshot' },
    onlineRequirements(['host-environment-api-key'], '공식 REST 잔액과 현재 작업 비용을 확인한다. skill은 MCP 설치를 대체할 수 있는 절차이며 권한 증거가 아니다.'),
    [source('https://docs.meshy.ai/en/api/ai', '공식 문서가 연결한 REST 직접 호출 skill'),
      source('https://github.com/meshy-dev/meshy-3d-agent', '공식 연결된 skill 저장소')],
    ['대표 preview에 활용할 수 있는 공식 절차의 발견·조사; skill 실행 자동화는 이번 미구현'],
    ['skill의 실제 설치판본·전체 실행 schema', '실계정 권한·plan·잔액', 'Chroma 적용']),
  spec('local-broker-access-v1', 'local-broker-v1',
    { kind: 'manual-export', official: false, direction: 'host-local', locator: 'local-broker/v1', version: '1' },
    {
      signup: requirement('not-applicable', '로컬 확보 bytes/path 계약에는 가입 상태를 주장하지 않는다.'),
      authentication: { status: 'not-applicable', methods: [], action: '공급자 인증은 이 로컬 계약의 확인 범위 밖이다.' },
      permission: requirement('required', '호스트 로컬 실행 허용과 별도 내부 승인 잠금을 확인한다.'),
      plan: requirement('not-applicable', '외부 공급자 요금제는 이 로컬 계약의 확인 범위 밖이다.'),
      credits: requirement('not-applicable', '외부 공급자 잔액·Chroma 크레딧을 이 계약으로 충족시키지 않는다.'),
    }, [{ url: 'docs/capability-specifications.md', kind: 'local-contract', scope: '로컬 사용자 선언 계약' }],
    ['호스트가 이미 확보한 자료를 보관·변환하는 로컬 선언; 공급자 공식 인증 명세가 아님'],
    ['원 자료 공급자의 계정·권한·크레딧 상태'],
    { requiredChecks: ['installation', 'exposure', 'permission'] }),
];
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }
freeze(accessCatalog);
