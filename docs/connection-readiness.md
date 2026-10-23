# 입력 준비와 연결·계정 준비를 함께 확인하기

[입력 자료 대조](capability-readiness.md)는 정확한 파일/텍스트 판본을 확인한다.
연결 대조는 같은 요청의 **경로·계정·프로젝트**가 설치·노출·인증·권한·요금제·크레딧을
충족하는지 별도로 보고한다. 입력이 있어도 연결 준비를 확인하지 못하면 실행할 수 없다.
모든 [37개 파트너 접근 현황](partner-access.md)에는 웹/API/CLI/공식 MCP/공식 스킬/수동
export의 확인 범위를 구분했다. 웹 로그인과 API 인증, MCP 연결은 다른 상태다.

## 공통 MCP 절차

공개 경로는 기존 `folio_resource_query` 안에 있다.

1. `accessSpecifications` 또는 `accessSpecification {accessId}`로 접근 계약을 읽는다.
   JSON을 `folio_resources propose`, kind `access-specification`으로 보관한다. 기능 명세와
   provider/product/capability/model/endpoint/schemaVersion identity가 같아야 한다.
2. 호스트가 해당 경로의 설치·노출과 비과금 읽기 점검을 수행한다. 실제 인증은 기존 호스트
   secret 관리에 맡긴다. 아래처럼 상태만 `retainConnectionCheck {resourceId,check}`에 넘긴다.
3. `connectionReadiness`에 접근/기능/요청/점검의 정확 판본, profile/pipeline/policy, scope/path,
   accountAlias/projectAlias를 넘긴다. `retainConnectionReadiness`는 `resourceId`를 추가해
   보고를 보관한다. 각 조건의 effectiveStatus와 nextAction, canPrepare를 반환한다.
4. 기능 명세·입력 보고·접근 명세·연결 보고·요청을 필수 맥락 역할로 선택한다.
   context 미리보기 → package 보관·선택 → Input 봉인. 누락·차단·부분·미확인은 봉인 전에 차단된다.
5. v2 Operation의 exact request를 시작한다. 공식 호스트 경로는 호출 직전 호스트 읽기 점검과
   `validateConnection {inputSnapshotId,requestRevisionId,accountAlias,projectAlias,accessSpecificationRevisionId}`를
   다시 수행한다. 이 확인은 기존 policy/grant·검토·사용자 결정을 대신하지 않는다.

`context.ready`는 맥락 역할의 제공 여부이며 외부 계정의 인증 성공 표시는 아니다.
연결 판단은 `connectionReadiness.readiness.canPrepare`와 실행 직전 확인을 함께 사용한다.

```json
{
  "version": 1,
  "accessSpecificationRevisionId": "sha256:<route>",
  "capabilitySpecificationRevisionId": "sha256:<capability>",
  "requestRevisionId": "sha256:<request>",
  "scopeId": "episode-1", "pathId": "main",
  "accountAlias": "account-local", "projectAlias": "project-local",
  "checkedAt": "2026-10-23T00:00:00.000Z",
  "expiresAt": "2026-10-23T00:05:00.000Z",
  "observation": "host-reported", "authenticationBoundary": "host-secret-store",
  "checks": [
    {"kind":"installation","status":"passed","basis":"host-tool-metadata","reasonCode":"verified"},
    {"kind":"exposure","status":"passed","basis":"host-tool-metadata","reasonCode":"verified"},
    {"kind":"authentication","status":"unknown","basis":"read-only-host-probe","reasonCode":"not-checked"},
    {"kind":"permission","status":"unknown","basis":"read-only-host-probe","reasonCode":"not-checked"},
    {"kind":"plan","status":"unknown","basis":"read-only-host-probe","reasonCode":"not-checked"},
    {"kind":"credits","status":"unknown","basis":"read-only-host-probe","reasonCode":"credits-unconfirmed"}
  ]
}
```

위 예는 설치·노출만 확인했으므로 준비 완료가 아니다. 여섯 조건을 중복 없이 받으며
`passed/blocked/unknown/partial/expired`를 구분한다. 사용자 선언만의 passed는 partial이고,
도구 메타데이터만으로 인증·권한·요금제·크레딧의 passed를 증명할 수 없다. 필수 조건의
not-applicable도 준비 완료로 승격하지 않는다. 로컬 브로커는 외부 auth/plan/credits를
적용 밖으로 선언하며, 그 상태로 외부 공급자의 사용 가능성을 주장하지 않는다.

## 비밀값과 현재성

새 점검은 enum/시간/정확 판본과 비밀이 아닌 `account-…`/`project-…` 별칭만 받는다.
자유 형식 인증 메시지·키·token·cookie·header·원문 도구 응답을 받지 않는다. 실제 secret의
저장/재인증은 호스트 기능을 사용하고 리니베라 자료·Input·맥락 묶음·로그에 복사하지 않는다.
호스트 callback의 원문 오류도 고정된 비밀 없는 오류로 바꾸며 signed URL은 일시적으로만 다룬다.

보고는 기록 prefix와 `evaluatedAt`으로 재계산한다. 과거 Input 검증은 현재 시각과 무관하다.
새 실행은 점검 expiresAt 및 접근 명세의 최대 수명(현재 5분)을 다시 검사한다. 같은 요청·계정·
프로젝트·경로에 과거/새 보고가 공존하면 host checkedAt이 최신인 보고를 현재 판단으로 사용하고,
나머지는 ignoredHistoricalReportRevisionIds로 구별한다. 동일 시각의 충돌은 모두 검사하며,
새 차단 관측을 오래된 성공으로 우회하지 않는다. 연결 점검·보고와 내부 정의는 fixed 선택으로
알려진 새 전역 관측을 무시할 수 없다. 다른 기능의 과거 보고는 역사 맥락으로 유지한다.

설치·권한·요금제·크레딧이 미확인이면 공식 안내에 따라 사람이 가입/연결/권한 확인을 수행해야
한다. 자동 가입·구독 결제·유료 생성·외부 게시를 수행하지 않는다. 양수 잔액만으로 해당 작업의
비용·계정/키/팀 한도를 충족했다고 보지 않는다. Chroma 적용 경로·활성화·기한은 공식 팩 403으로
미확인이다. 일반 API/MCP 크레딧과 같다고 추정하지 않는다.

## 공식 경로 재사용과 결과 보관

대표 `meshy-preview-official-mcp-v1`은 공식 MCP source 0.6.5에서 확인한 도구 schema 교집합이다.
서버 설치나 계정 인증을 실행하지 않는다. 호스트의 `tools.list/call/download` callback을 받아
공식 create/status/download/balance 도구를 재사용하고, 기존 Meshy validator와 recorder를 쓴다.
별도 공급자 HTTP 실행기를 만들거나 파트너마다 새 스킬을 생성하지 않는다. 공식 스킬/CLI가
충분한 다른 경로도 같은 버전 접근 명세를 읽는 호스트 절차에서 재사용할 수 있다.

공식 MCP의 prompt 2~800·내부 preview/moderation:false와 API의 mode 입력 차이를 기록한다.
봉인한 논리 API 요청과 실제 MCP 도구 호출/SDK 기본값은 별도 관측이며 내부 HTTP를 본 것으로
표시하지 않는다. 원문 응답은 보관하지 않고 task/status/확보 형식의 allowlist만 보존한다.

도구 성공, 로컬 파일 확보, 리니베라 보관 완료는 다르다. download 도구의 URL-only fallback,
0바이트/크기/경로 불일치를 차단한다. 부분 실패는 같은 job의 collect만 재시도하며 생성 POST를
반복하지 않는다. 이미 확보한 파일은 원본을 지우고 MCP를 재시작한 뒤에도 보관 bytes로 읽는다.
호스트 프로세스 자체가 사라진 뒤 임의 job handle을 복원하는 API는 이번에 추가하지 않았다.

## 재현과 검증 경계

`node examples/chroma-continuity.js`는 같은 작업 공간에서 Meshy 기능/입력 대조와 연결 점검 →
묶음/Operation → 합성 공식 MCP 도구 → 다운로드 1회 실패/재수집 → 실제 Resource GLB·bundle →
P0~P4 프로젝트 필수 모델 의존성 → 60개 판본 묶음 → 후속 두 작업을 연결한다.
모델의 hash·GLB JSON promptLength·구조 node 개수가 후속 결과에 반영된다.

합성 host tools fixture와 실제 리니베라 stdio MCP만 사용한다. 공급자 실계정·공식 MCP 실호출·
모델 생성·미디어 재생·편집기/엔진 복원·실제 권리·성과 유효성을 검증하지 않았다.
