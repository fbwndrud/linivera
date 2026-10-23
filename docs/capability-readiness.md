# 필요한 입력과 보유 자료 대조

입력 자료가 있어도 실제 경로·계정의 사용 가능성은 별도다.
[연결·계정 준비](connection-readiness.md)와 [파트너별 접근 경로](partner-access.md)를 함께 확인한다.

`folio_resource_query capabilities`에서 [대표 기능 명세](capability-specifications.md)를 찾고
`specification {capabilityId}`로 정확한 계약을 읽는다. 이 JSON을 `folio_resources propose`의
kind `capability-specification`으로 보관한다. 명세를 이름만으로 실행하거나 자동 갱신하지 않는다.

1. 작업 목적과 입력 후보를 고른다. 텍스트/설정과 파일을 구별하고 정확한 `generation-request`
   판본의 `inputBindings`에 후보 역할을 선언한다. 선언은 내용/권리/실행 승인과 다르다.
2. `folio_resource_query readiness`로 대조한다. 아래 입력은 `retainReadiness`에도 쓰며,
   후자는 `resourceId`를 추가해 kind `capability-readiness` 보고를 보관한다.
3. 후보를 확인하고 실제 사용할 판본을 기존 `decideSource` 또는 `folio_inputs select`로
   선택한다. 명세·보고·요청·필수 원본/증거를 [맥락 묶음](context-bundles.md)의 역할로 선언한다.
4. `context` 미리보기 → `context-package` 보관·선택 → 묶음 하나로 `folio_inputs prepare`.
   `folio_operations start`에 `operationContractVersion:2`와 묶음에 들어간 요청 판본을 넘긴다.
   출력은 기존 실행 기록·후보 그룹·검토 영수증·사용자 결정으로 보관한다.
5. 다음 작업은 출력 판본을 입력 후보로 삼아 재대조한다. 변경된 명세/선택은 새 보고로
   확인하며, 과거 보고·묶음·고정 Input은 그대로 남긴다.

```json
{
  "op": "readiness",
  "specificationRevisionId": "sha256:<exact-spec>",
  "requestRevisionId": "sha256:<exact-request>",
  "candidateRevisionIds": ["sha256:<instruction>", "sha256:<source>"],
  "profileRevisionId": "sha256:<selected-profile>",
  "pipelineRevisionId": "sha256:<selected-pipeline>",
  "policyRevisionId": "sha256:<selected-policy>",
  "scopeId": "episode-1", "pathId": "main",
  "search": {"completeness": "partial", "reason": "Only the two explicit input candidates were inspected."}
}
```

## 보고의 의미

보고는 정확한 명세·요청·후보 판본/hash, 정의와 추가 전용 기록의 checkpoint에 결속된다.
직접 propose한 보고도 같은 기록 prefix에서 재계산하여 위조를 거절한다.
입력은 최대 256개 명시 후보다. 후보 검색을 대신하는 자동 전체 디스크 탐색은 수행하지 않는다.

- `provided`: 관측한 값/정확한 텍스트 바이트가 그 요구와 일치한다.
- `candidates`: 요청이 선언한 역할과 검사 가능한 조건이 맞는 파일 후보다. 의미 적합성과
  권리는 별도의 unknown이다. MIME/파일명만으로 해상도·길이·내용·codec을 확정하지 않는다.
- `mismatch`: 타입/바이트/형식 선언/관측 용량 등 조건이 다르다. 이유와 필요한 확인·변환/
  추가 확보 작업을 반환한다. 자동 변환하지 않는다.
- `unknown`: 관측한 규격·권리·검색 근거가 충분하지 않다.
- `absent-in-searched-selection`: 명시한 선택 판본 범위에서 조건을 만족하는 자료를 찾지 못했다.
- `unknown-partial-search`: 부분 조회여서 미보유로 결론 내릴 수 없다.

`search.completeness=complete`는 그 checkpoint의 profile/policy scope 교집합 안에서
사용자가 선택한 모든 판본을 후보에 포함해야 허용한다. 같은 scope의 명시적 회차 선택이
있으면 해당 Resource의 고정 판본을 우선하며, 없으면 전역 선택을 사용한다. 같은 Resource의
여러 고정 판본도 각각 기록한다. 미선택 판본·외부 소장 자료는
`not-searched`다. scope 전체 자료의 존재를 안다는 뜻이 아니다. 누락된 선택은
`omittedSelected`에 나타난다. 보고의 최신성은 `at-workspace-checkpoint`다.

`readiness.canPrepare`는 검사한 구조적 필수 조건과 요청 계약·관측 예산의 충족이다.
권리 보고나 내부 실행 권한을 부여하지 않는다. 최종 Input은 별도로 선택·scope·typed closure·
전체 바이트 예산을 검사하며 새 작업은 관련 선택이 바뀐 보고를 거절한다.
v2 Input이 실제 fixed/scoped 의존성으로 소비한 판본은 해당 바인딩과 체인이 그대로라면
전역 선택만 바뀌어도 유지할 수 있다. v1/global 소비와 profile/pipeline/policy 정의는
전역 최신성 검사를 유지한다. 관련 회차 바인딩을 바꾸거나 지우면 재대조한다.

보고의 명세·요청·실제 binding은 제공 입력으로 펼친다. 선택하지 않은 다른 후보와
profile/pipeline/policy 판정 근거는 `context-evidence` 관계로 남기며 자동 입력으로 넣지 않는다.
변환이 필요하면 결과를 별도 Resource 판본/Operation으로 보관하고 기존 binding의
`transformRevisionId`로 연결한다. 원본과 실제 변환 판본을 모두 보존한다.

## 재현

지원 Node로 `node examples/chroma-continuity.js`를 실행한다. 하나의 실제 stdio MCP 작업
공간에서 공식 fal 대표 명세/대조/입력 묶음 → 합성 생성 이미지와 원문 응답 → P0~P4 →
공식 Meshy 도구의 준비 대조/부분 다운로드 복구와 프로젝트 모델 의존성 →
로컬 브로커 명세/재대조 → 60개 판본의 묶음 하나 → v2 합성 Operation 출력 → 두 번째
작업을 검증한다. 원본 삭제·중간 재시작·필수 맥락과 연결 누락·중첩 이야기/경로 격리·위조·
배포 identity·입력 예산·구 parser/역사 Input 호환과 아홉 종류 변경의 두 단계 전파를 검사한다.

후속 결과는 보관한 hash·편집 구간·DB 값·brief 문구·권리 보고 상태/원문·성과 수치·공급자
file ID·선언 버전을 소비한다. 실제 모델 생성·공급자 네트워크·미디어 재생·편집기/엔진 복원·
외부 게시·권리 유효성이나 성과 진실성은 검증하지 않는다.

초기 fal 이미지는 prompt 바이트에서 계산한 색을 실제 출력으로 보관한다. 추가 Runware/
MiniMax 응답은 합성 관측 자료이며, 파일 binding은 해당 관측의 참조다. 서로 다른 공급자의
관측을 실제 생성 인과로 승격하지 않는다. 실제 파생은 Input→Operation→출력 관계로만 기록한다.
