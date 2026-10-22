# P3 프로젝트 자료와 외부 상태의 연결

기준은 PR #6 head `43226a1`이다. 사용자가 확인한 방향은 공급자 전용 파서 유무와
무관하게 확보한 자료를 보관하고 다음 반복 작업에 연결하는 것이다. 기존 착수 계획과
[지원표](../chroma-support.md)의 P3를 이어 쓴다. 기존 공통 Adapter/Resource를 재사용한다.

## 범위

- `project-manifest`: Linivera version 1 선언으로 파일 역할, 진입점, 파일 간 의존성,
  DB·환경·배포 상태의 증거 파일과 누락을 읽는다. 공급자 고유 export라고 주장하지 않는다.
  임의 파일 유형도 역할과 실제 판본을 지정해 연결한다. 코드를 실행하거나 import를 추측하지 않는다.
- `aseprite`: JSON hash/array atlas의 sheet, frame rectangle·trim·duration(ms), tag의
  frame 범위를 읽는다. sheet는 필수 파일 슬롯이며 이미지 해독·게임 재생은 별도다.
- 브로커/사용자가 확보한 파일을 기존 `createVersionedExportAdapter`와 recorder로
  보관한다. 공급자별 API/파서가 없어도 같은 Input/Operation/graph로 이어지는지 검증한다.
  외부 URL만 있는 것과 실제 보관 파일을 구분하고 생성 당시 입력은 unknown으로 남긴다.

## 계약

`project-manifest`는 `{version:1,files,entrypoints,dependencies,externalStates}`다.
files는 `{path,role,required}`이며 경로는 정규화한 상대 경로다. dependencies는
`{from,to,kind}`로 선언한 파일을 참조한다. entrypoints도 선언한 파일 경로만 쓴다.
externalStates는 `{id,kind,required,evidence,unavailable}`이며 kind는 database,
environment, deployment다. evidence는 선언한 파일 경로, unavailable은 누락 설명이다.
필수 상태에 증거가 없거나 알려진 누락이 있으면 필수 미연결 슬롯으로 남겨 다음 Input을
차단한다. 증거가 있어도 실제 실행 환경의 완전 복원·현재 상태를 검증했다는 뜻이 아니다.

## 검증 경계와 완료 기준

이미 합의한 공개 Resource MCP inspect/normalize/Input/Operation/graph와 공통 Adapter
경계를 그대로 사용한다. 합성 fixture로 한 동작씩 실패를 확인한 뒤 구현한다.
파일/상태 누락, 모호한 경로·중복·미지정 참조, 위조 map, 선택·scope·용량 검증을 유지한다.
실제 stdio 재시작 뒤 브로커 자료 → 구조 map → 다음 결과 → 후속 작업을 검증하고,
DB 증거/스프라이트 변경이 후속 결과에 재검토를 전파하는지 확인한다.
전체 검사와 설치 tarball을 검증하고 Standards/Spec 독립 리뷰 수정 후 #6 위에 PR을 올린다.

## 형식 근거

- [Aseprite JSON hash/array](https://www.aseprite.org/api/spritesheetdataformat)
- [Aseprite sprite와 frame duration](https://www.aseprite.org/docs/sprite/)
- [공식 exporter 구현](https://github.com/aseprite/aseprite/blob/main/src/app/doc_exporter.cpp)
  은 rectangle·duration·tag 필드 의미 확인용이며 코드를 복사하지 않는다.

P3는 선언과 확인된 atlas 구조의 기본 연결 범위다. 임의 코드의 정적 분석, 엔진별 씬
복원, DB 실행/비밀값 수집, 자동 배포·실제 브로커 네트워크 연결은 이 변경에 포함하지 않는다.
