# 기능 명세·자료 대조·맥락 묶음 통합 구현

기준: PR #8 `49f4dcf`, 기존 맥락 묶음 구현 `3da7c1c`. 기존 점검 트리의 미커밋 문서는
보존한다. 깨끗한 `codex/chroma-context-bundle`을 재사용하고 기존 후속 수정 `d0b9249`를
보존한 `codex/chroma-capability-readiness` 브랜치에서 이어 구현한다. #8 위 stacked PR로 제출한다.

## 재사용과 확장

Resource 판본/hash, generation-request/inputBindings/outputSpec, usage-context/context-package,
typed closure, 선택·scope·용량·Operation·Review와 P0~P4 파서는 재사용한다.
기존 묶음 역할 검증과 단일 작업 공간 예제를 이번 입력 명세/대조 흐름에 합친다.
새 네트워크 브로커나 관계 체계는 만들지 않는다.

확장: 기능 identity(provider/product/capability/model/endpoint/schemaVersion)의 버전 명세,
대표 연결기의 기존 validator를 재사용한 실행 가능 입력/출력 계약, 공개 MCP 자료 대조.
대조는 후보 발견이며 선택/승인이 아니다. 명세와 대조 보고는 보관한 JSON Resource로
고정하고 usage-context의 필수 역할로 묶는다. 명세 변경은 기존 전이 재검토를 사용한다.

## 작업 순서

1. 최신 PR 상태·기준 head 확인. 기존 합성 예제/역사 입력 계약 확인.
2. 공식 자료를 조사해 대표 기능 명세·37개 파트너 지원 범위를 기록한다.
3. 명세 조회·검증과 대조의 공개 MCP 경로를 구현한다. 읽기 전용 대조의 검색 범위,
   기준 checkpoint, 정확 판본/hash, 관측/선언/미확인, 부분 조회를 명시한다.
4. 선택한 후보→맥락 묶음→요청 inputBindings→고정 Input의 판본을 통합 예제에서 대조한다.
5. 불충족/미확인/미보유/부분 조회와 scope·위조·변경·역사 입력 회귀를 추가한다.
6. lint/typecheck/전체 테스트 및 재현 예제를 실행한다.
7. code-review 스킬의 Standards/Spec 독립 병렬 검토, 지적 수정·회귀·재검토 후 PR 제출.

## 대조 계약과 수용 기준

- 파일명/MIME는 내용·해상도·길이·의미 적합성의 증명이 아니다. 미관측 규격·권리는
  unknown으로 남기며 추가 확인/변환을 제안한다. 사용자 선언은 공식 관측과 구분한다.
- 검색은 명시한 정확 판본 및 선택한 profile/policy 범위에 한정한다. 전체 열람을
  증명하지 않은 검색에서 absent를 전체 미보유로 주장하지 않는다.
- 명세/보고가 보관한 입력 판본과 결속되고 보고 위조를 재계산하여 거절한다.
- 명세→대조→묶음→요청→Operation→보관 출력→다음 반복을 하나의 MCP 작업 공간에서 검증한다.
- 원본 삭제/재시작 뒤 bytes 읽기, 필요한 P0~P4 원본·파일·선언·증거의 정확한 폐쇄,
  필수 누락·identity·scope·용량 차단, 일곱 종류 상위 변경의 두 단계 재검토를 확인한다.
- 역사 Input의 판본/hash와 기존 parser 버전 호환은 유지한다.
- 합성 transport만 사용한다. 실제 모델 생성·재생·편집기/엔진 복원·외부 게시를 주장하지 않는다.

## 검증 기록

구현 기준: `7a84c4b`. [PR #9](https://github.com/fbwndrud/linivera/pull/9)는
최신 #8 `49f4dcf`를 base로 하는 stacked PR이다. 기존 점검 트리의 미커밋 문서는 그대로다.

- 실행 가능한 명세는 공식 확인 일부 fal FLUX schnell, ElevenLabs multilingual_v2/MP3
  timestamps, Meshy 7.1 preview와 로컬 선언 local-broker다. 37개 파트너별 미조사/자료 일부/
  기존 수동 export/브로커 범위를 지원표에서 구분한다.
- 공개 MCP는 capabilities/specification/readiness/retainReadiness다. 보고는 기록 prefix의
  정확한 판본/hash로 재계산하며, 실제 입력과 비교 증거를 구분한다.
- 회차별 선택을 우선 대조하고 같은 Resource의 복수 고정판본을 보존한다. 새 작업에서
  전역 최신성 예외는 검증된 v2 manifest의 실제 fixed/scoped 소비 증명에만 적용한다.
  global 소비·정의·관련 scope 변경은 재대조를 요구한다.
- 단일 실제 stdio MCP 통합 **1/1 통과**(약 93초): 초기 명세/보고/묶음에서 합성 fal
  생성 → P0~P4 → 재대조/47개 판본 묶음 → v2 후속 출력 → 두 번째 작업. 공개 거절 16개,
  일곱 종류 변경의 두 단계 전이 재검토, 원본 삭제/재시작 뒤 bytes, 역사 Input/hash를 확인했다.
  초기 fal의 실제 prompt 바이트를 이미지 색에 반영했다. 독립 공급자 관측의 파일 binding을
  실제 생성 인과로 승격하지 않는다.

## Standards

code-review 스킬의 독립 검토. `git diff 49f4dcf...7a84c4b` 기준 문서화된 규칙 위반·수정이
필요한 smell **0건**. 추가 12파일의 책임 분리, 실제 선택 의존성에 한정한 fixed 예외,
기존 엔진이 검증하는 공개 checkpoint를 사용하는 합성 호스트를 재검토했다.
최종 독립 표적 테스트 **21/21 통과**. core 네트워크 금지, 파일 300줄, 합성 fixture와
hash/영수증/hard/추가 전용 기록/자기검토/soft 비자동수정 잠금 약화를 발견하지 못했다.

## Spec

독립 검토의 P1 **2건 수정·해결 확인**. 제공된 선택 입력의 불일치도 required:false라
실행 준비를 통과하던 경우를 수정했다. optional은 생략 가능하지만 제공하면 조건을
만족해야 한다. 요청의 iteration에 다른 이야기/경로를 넣던 경우는 request 자체부터
typed isolation을 순회하도록 수정했다. 각각 공개/단위 회귀로 보존한다.

최종 독립 표적 테스트 **33/33 통과**. 별도 합성 재현에서도 보고 생성 뒤 scope 선택,
전역 새판본 선택 후 실제 v2 fixed Operation 시작과 과거 Input 검증이 통과했다.
추가 지적·미해결 지적 **0건**. 이 수치는 전체 검사와 중복되므로 합산하지 않는다.

## 최종 전체 검사

Node **24.19.0**, 최종 `7a84c4b` 코드의 `npm run check`: ESLint·TypeScript·전체
**2,004/2,004 통과**, 실패·취소·skip 0(약 524초). dev dependency 없는 새 tarball 설치와
전체 공개 예제를 포함했다. 최종 전체 검사 안의 단일 MCP 통합도 약 36초로 재통과했다.
초기 sandbox 실행의 로컬 socket EPERM은 필요한 로컬 테스트 권한으로 재실행하여
같은 검사 전체의 성공을 확인했다. 대표 연결기 별도 회귀·독립 검토 수치를 합산하지 않는다.

실제 공급자/유료 생성/외부 게시/미디어 재생/에디터·엔진 복원은 수행하거나 검증하지 않았다.
