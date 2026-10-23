# PR #9 별도 세션 독립 검토와 수정

검토일: 2026-10-23. 원격 PR #9를 다시 조회하고 fetch하여 다음 비교 범위를 고정했다.

- base `49f4dcf0235abc492f1c5ba1db5cec46d8f822a3`
- 원래 head `e4ec91576e92d0e425cac472b3b2ca2e388c2cd4`
- 비교: `git diff 49f4dcf...e4ec915`, 14개 커밋·77파일.
- 기존 구현 세션과 분리한 리뷰 복제본을 사용했다. 사용자 주 작업 디렉터리,
  원래 점검 트리와 구현 트리의 미커밋 변경을 수정하지 않았다.
- 정본은 capability/access/context-bundle/P0~P4 계획과 공개 사용 문서, 최신 PR 설명이다.
  이전 리뷰 결론과 테스트 수치로 이번 판단을 대체하지 않았다.

## Standards

code-review 스킬에 따라 Spec과 독립된 하위 에이전트가 AGENTS.md·CONTRIBUTING.md·
user-language·SECURITY와 고정 diff를 검토했다. 확정 규칙 위반·수정이 필요한 smell 0건.
core/packs의 네트워크·모델 호출, 실제 자료/비밀값 fixture, 잠금 우회 설정을 발견하지 못했다.
원래 범위의 독립 focused 검사는 53/53 통과했다. 수정 후 책임 분리·순수 상수·역사 검증과
신규 실행 차단을 다시 검토했다. 역사 판본 선택은 공개 on/off 설정이 아니다.

## Spec

### P1: 직접 scoped Input의 요청 iteration으로 다른 이야기 맥락 유입

- 위치: `core/resources/input-snapshots-v2.js`, `core/resources/input-closure.js`.
- 정본: context-bundle 계획의 typed reference 격리, capability 계획의 scope 차단과
  사용자 검토 항목 9의 요청 iteration/다른 이야기 자료 유입 금지.
- 재현: scope `story`에서 generation-request 하나만 fixed root로 선택한다. 요청의
  iteration.baseRevisionIds는 전역 선택한 `foreign-story` usage-context를 가리킨다.
  readiness/package를 거치지 않으면 이전 prepare와 start가 모두 통과했다.
- 영향: 요청 내부의 정확한 판본 참조가 있어도 다른 이야기의 상태가 신규 작업에 들어왔다.
- 수정: 새 scoped v2 봉인 및 모든 새 Operation에서 typed closure 전체의 scope를 검사한다.
  역사 Input 재빌드는 기존 manifest/hash를 유지하며 신규 실행에서 다시 차단한다.
- 회귀: 실제 stdio MCP 3개. 요청만 root로 한 foreign 거절, same-story 실행/재시작 성공,
  합성 과거 Input 검증 성공과 새 Operation 거절. 수정 전 2개 실패를 확인했다.
- 범위: v2 자체가 선언한 scopeId를 검사한다. path/time은 이를 선언하는 기존 context/보고
  경로에서 검사한다. 다른 scope 출처의 iteration 의도를 무조건 현재 scope로 강제하지 않는다.

### P2: Meshy 요청 형식과 출력 slot MIME 모순을 준비 완료로 판정

- 위치: `packs/production/capabilities.js`, `server/production/official-tools.js`.
- 정본: capability-specifications의 '요청 format별 model 파일', 출력 역할/수 검증과
  실제 validator/공식 도구 계약 일치 요구.
- 재현: target_formats=['glb']인데 model slot은 model/obj만 허용한다. 또는 GLB/OBJ를
  요청하면서 GLB만 허용하고 cardinality만 2로 맞춘다. 공개 Resource readiness가 이전에는
  requestValidation=valid와 canPrepare=true를 반환했다. 수정 전 회귀 실패를 확인했다.
- 영향: 생성 결과가 봉인한 출력 계약을 만족할 수 없는데도 실행 준비로 표시됐다.
- 수정: adapter와 capability validator가 같은 frozen 형식/MIME mapping을 사용한다.
  모든 요청 형식의 MIME 수용을 검사하고 공식 prepare도 현재 capability validator를 쓴다.
- 회귀: 공개 Resource 대조/보관/Input 거절, 공식 호스트 list/create 호출 0회,
  6개 형식을 모두 올바르게 선언한 정상 요청 성공을 검사한다.

### 수정 중 독립 재검토에서 발견한 역사 검증 회귀

새 출력 검사를 과거 보고 재계산에도 그대로 적용하면 원래 v1 capability-readiness와
connection-check를 포함한 Input의 verify가 실패했다. 별도 독립 검토자가 원래 head를
임시 위치에 펼쳐 합성 Input을 만든 뒤 수정 코드로 읽는 방식으로 재현했다.

새 입력 대조 보고를 v2로 발행하고 v1 보고/연결 기록은 당시 요청 검증으로 재계산한다.
새 Input 준비와 새 Operation의 공통 경계는 보고·점검 버전에 관계없이 현재 요청 계약을
검사한다. 새 연결 관측과 연결 대조, 공식 prepare도 현재 계약을 강제한다. 과거 raw 기록
재보관은 실행 허가가 아니며 구 판본을 만들어 현재 차단을 우회할 수 없다.

추가 actual stdio MCP 회귀 3개는 capability-readiness, connection-check 단독,
connection-readiness 각각의 과거 Input/hash 읽기·신규 준비/실행 거절·새 대조 거절을 확인한다.
원래 head로 생성한 별도 합성 Input 두 종류도 수정 코드에서 다시 검증했다.

## 설치 경로와 검증

새 `scripts/package-readiness.js`는 개발 의존성 없는 설치 tarball의 실제 MCP로 모순 출력과
요청 iteration 격리 거절을 재검사한다. 저장소 test fixture를 가져오지 않는다. 기존 설치
검증의 공개 예제·P0~P4 단일 작업 공간·60개 판본·후속 두 작업도 유지한다.

최종 수정 코드, Node 24.19.0의 `npm run check`: ESLint·TypeScript·전체
**2,046/2,046 통과**, 실패·취소·skip 0, 약 525초. 개발 의존성 없는 새 tarball 설치 검증
약 172초, 공개 예제 전체와 새 거절 경로도 포함한다. 전체 검사 안에서 P0~P4 단일 작업
공간·60개 판본·후속 두 작업은 약 100초로 통과했다. 이 부분 검사를 전체 수치에 합산하지 않는다.

최종 수정 후 Standards 독립 재검토 잔여 0건, focused 59/59 통과. 구현에 참여하지 않은
별도 Spec 재검토자도 잔여 0건, 교차 회귀 58/58 통과와 원래 head의 과거 Input 두 종류
검증 성공을 확인했다. 수정 시도 중 역사 검증 단절을 발견한 바로 그 재현으로 해결을 확인했다.
위 두 독립 검사와 전체 검사는 겹치므로 고유 테스트 수로 합산하지 않는다.

검토 집계: 원래 고정 diff Standards 0건·Spec P1/P2 각 1건 수정. 수정 중 역사 호환성 회귀
1건도 해결했다. 최종 두 축 모두 잔여 0건이며, 검토 기록과 공개 문서의 v1/v2 경계를 갱신했다.

## 남은 확인 경계

실제 가입·인증·결제·공급자 MCP 설치/실호출·유료 생성·외부 게시를 수행하지 않았다.
호스트 구현/판본은 기존의 호스트 증언 경계이며 독립 배포물 검증이 아니다.
37개 파트너 조사와 대표 실행 명세의 차이, Chroma 크레딧 미확인, 실제 미디어 재생·복원·
권리 유효성·성과 진실성 미검증은 기존 공개 문서의 제한을 유지한다. 병합하지 않는다.
