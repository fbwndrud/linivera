# 다음 작업의 맥락 묶음

결과물 하나에는 공급자 응답·workflow·편집·프로젝트·브리프·권리·배포·성과 기록이
연결될 수 있다. Linivera는 이 관계를 보관하지만, 결과물을 고른다고 역방향 기록을
자동으로 다음 Input에 넣지 않는다. 다음 작업에 필요한 자료는 사용자가 역할별로 고르고,
기존 `usage-context` → `context-package` → Input 경로로 정확한 판본을 고정한다.
새 자료형이나 별도 연결 체계는 없다.

## 역할 요구 선언

`usage-context` version 1에 선택 필드 `requirements`를 둔다.
필드가 없는 기존 기록과 Input은 의미가 바뀌지 않는다.

```json
{
  "version": 1, "scopeId": "episode-1", "pathId": "main",
  "requirements": [
    {"role": "deliverable", "required": true, "accepts": [{"kind": "deliverable"}]},
    {"role": "provider-response", "required": true, "accepts": [
      {"kind": "structure-map", "format": "minimax-video-query"},
      {"kind": "structure-map", "format": "provider-response"}]},
    {"role": "rights", "required": true,
     "accepts": [{"kind": "structure-map", "format": "delivery-record", "recordType": "rights"}],
     "bindsRole": "deliverable"},
    {"role": "performance", "required": false,
     "accepts": [{"kind": "structure-map", "format": "delivery-record", "recordType": "performance"}],
     "bindsRole": "release"}
  ],
  "states": [
    {"role": "deliverable", "status": "selected", "artifactRevisionId": "<exact revision>", "evidenceRevisionIds": []},
    {"role": "rights", "status": "observed", "artifactRevisionId": "<rights map revision>", "evidenceRevisionIds": []}
  ]
}
```

| 필드 | 의미 |
|---|---|
| role | 고유 역할 이름. states의 role과 대응한다 |
| required | 명시 boolean. true면 다음 Input 전에 그 역할의 자료가 있어야 한다 |
| accepts | 선택. 그 역할 판본의 kind와 structure-map format, delivery-record recordType 조건 |
| bindsRole | 선택. 그 역할의 delivery-record map의 subject(`/subjects/i/hint`) binding이 다른 역할의 유일한 state 판본을 가리켜야 한다. accepts는 delivery-record여야 한다 |

검사는 보관 판본을 다시 읽고 structure-map은 원본에서 재계산해 대조한다.
다른 kind/format/recordType이나 다른 결과물 판본을 가리키는 기록은 `usage-context`
보관에서 `CONTEXT_INVALID`로 거절한다. `bindsRole`은 기존 binding을 확인할 뿐
새 관계를 만들지 않는다. evidence slot에 같은 판본이 있어도 subject가 아니면 거절한다.
subject가 여러 개인 brief/rights 기록은 그중 하나가 그 판본이면 받는다. 한 기록이 여러
결과물에 적용된다는 원문 보고이며, 기록의 다른 subject 판본도 그 기록의 binding으로 Input에
들어간다. 한 결과물만 다룬 기록이 필요하면 그 기록을 따로 normalize한다.
bindsRole이 가리키는 역할은 state가 정확히 하나여야 한다. 그 밖의 역할에는 여러 state
(예: 공급자 응답 3개)를 둘 수 있다. state의 판본은 artifactRevisionId, 없으면 첫 증거다.

requirements는 그 usage-context를 만든 다음 작업의 선언이다. package의 `purpose`는
설명 텍스트이며 별도로 검사하지 않는다. requirements 없이 만든 package(예: revisionIds만
지정한 미리보기)는 역할 차단이 없고 `ready:true`이므로, 차단이 필요한 작업은 역할을 선언한다.

## 미리보기·보관·입력

1. 역방향 관계 찾기: `folio_resource_query graph`에서 결과물을 target으로 하는
   `structure-reference` edge의 source map을 확인한다. 이 목록은 후보일 뿐이다.
2. 사용자가 고른 판본으로 `usage-context`를 propose하고 선택한다.
3. `folio_resource_query context`(scopeId, pathId, purpose, contextRevisionId, budget)로
   미리본다. 반환값에 `requirements[]`({role, required, status, revisionIds, included})와
   `ready`가 추가된다. status는 provided/unknown/absent/unverified/incomplete/truncated/missing이다.
   incomplete는 package에 들어간 그 역할 map의 필수 binding이 비어 있다는 뜻이다. 필수·선택
   역할 모두 `ready:false`이고 package 보관을 거절한다.
   text 발췌만 예산으로 잘린 item은 provided로 남고 coverage.truncated에 기록된다.
   Input에는 해당 판본 전체 bytes가 들어간다.
4. `ready:true`인 `package`를 kind `context-package`로 propose하고 선택한다. package는
   출처 context의 requirements를 그대로 복제하며 바꾸거나 지울 수 없다.
5. `folio_inputs prepare`에 package 하나만 넣는다. item의 정확한 판본과 증거, 그 안의
   structure-map 원본·연결 파일·`dependencyManifestRevisionId` 선언, performance가 가리키는
   release map까지 typed closure로 펼쳐진다. 출처 `usage-context`는 provenance라 들어가지 않는다.

차단 규칙:

- 필수 역할이 unknown/absent/unverified이거나 예산으로 잘리면 package 보관과 Input
  closure에서 `CONTEXT_REQUIRED_MISSING`(details.missing). 요구가 있는 usage-context를
  Input에 직접 넣어도 같다. 선택 역할의 제외는 coverage에 남고 차단하지 않는다.
- 역할 map의 필수 binding이 비어 있으면 필수 역할은 누락으로 차단한다. 역할 선언이 없거나
  중첩 map(예: performance가 가리키는 release map)이 비어 있으면 Input 준비에서
  `STRUCTURE_BINDINGS_INCOMPLETE`.
- package 전체 typed reference의 scope/path/time은 기존 격리를 따른다. 중첩 P3/P4 map의
  증거로 다른 이야기·경로의 context를 넣으면 `CONTEXT_SCOPE_MISMATCH`.
- scoped v2 Input은 package나 대조 보고 없이 요청을 직접 선택해도 전체 typed closure의
  scopeId를 검사한다. `generation-request.iteration`을 통한 다른 이야기의 맥락 유입도 차단한다.
  이 검사 전에 보관한 Input의 hash/판본 검증은 유지하지만 새 Operation에서 다시 차단한다.
  v2 Input 자체에는 path/time 대상 필드가 없으며, 이를 선언한 context/보고 경로가 별도로 검사한다.
- 위조 item·참조 집합, 원본과 다른 map, identity가 다른 performance, profile/policy의
  scope·`maxInputBytes` 초과는 기존 검증으로 거절한다.
- 구버전 parser map을 담은 package는 Input으로 봉인·검증할 수 있지만 새 Operation
  시작은 `STRUCTURE_PARSER_UPGRADE_REQUIRED`다.

## 변경과 승인

묶음은 정확한 판본만 가리킨다. 공급자 원문·편집 미디어·DB 증거·권리 증거·성과 기록의
새 판본을 선택해도 묶음과 과거 Input은 바뀌지 않는다. 그 판본을 사용한 결과와 후속
결과는 기존 review impact로 재검토 대상이 된다. 새 판본으로 이어가려면 map을 다시
normalize하고 새 usage-context와 package를 만든다.

필수 역할 충족은 해당 기록이 연결되어 있다는 뜻이다. 권리 보고의 법적 유효성,
배포·성과 보고의 진위, 작업 결과의 승인을 뜻하지 않는다. 승인은 기존 review/decide와
사용자 결정으로만 기록된다.

## 단일 작업 공간 예제

`node examples/chroma-continuity.js`는 실제 stdio MCP 하나의 작업 공간에서 다음을 실행한다.
공식 fal 대표 명세/대조/묶음을 실제 합성 transport에 넘겨 prompt 바이트에서 이미지 색을
계산한다. 응답·영상·증거 파일을 경로로 보관하고 원본을 지운 뒤, P0 응답 map →
P1 ComfyUI workflow(응답이 보고한 이미지 ID를 LoadImage에 사용)와 node 계약·model →
작업 1 frame → P2 OTIO(frame과 공급자 영상) → 작업 2 cut → P3 project-manifest(cut·DB
snapshot 외부 상태 증거) → 작업 3 deliverable → P4 brief/rights/release/performance →
공식 Meshy MCP의 합성 호스트 점검/부분 다운로드 복구·모델 의존성도 함께 연결한다.
재시작 → [기능 명세·자료 대조](capability-readiness.md)와 [연결 준비](connection-readiness.md) → 묶음 하나의 Input(60개 판본) →
v2 합성 Operation 작업 4 → 작업 5로 이어진다. 명세·대조 보고·정확한 요청도 필수 역할이다.
필수 맥락·연결 누락, 잘못된 역할, 중첩 scope, 위조, 용량, 구 parser 거절과 아홉 가지
upstream 변경의 두 단계 재검토, 과거 Input 검증을 함께 확인한다.

모든 자료는 합성 fixture다. 실제 모델 생성·공급자 호출·미디어 재생·편집기/엔진 복원·
외부 게시·법률 판단은 수행하거나 검증하지 않는다.
