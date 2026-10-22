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

구현·독립 리뷰·최종 검사 결과를 완료 시 추가한다.
