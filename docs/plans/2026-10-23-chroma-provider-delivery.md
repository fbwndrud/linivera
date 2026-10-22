# P4 공급자 응답과 브리프·권리·배포 성과

기준은 PR #7 head `525aa3c`다. 사용자가 요청한 P4를 기존 Resource → structure-map →
Input → Operation → Review에 이어 구현한다. 파서는 core/packs에서 네트워크를 부르지 않는다.

## 범위

- 공식 응답 계약을 확인한 공급자의 순수 JSON 해석: 작업 ID/상태·결과 슬롯·오류.
  URL과 file ID는 실제 보관 판본에 명시적으로 연결하는 힌트이며 자동 fetch하지 않는다.
  native 상태나 응답 구조를 원래 생성 인과·품질·내부 승인으로 승격하지 않는다.
- 다른 공급자 응답은 별도 보관한 `provider-response` 선언의 정확한 JSON Pointer로
  작업/상태/출력 슬롯을 읽는다. wildcard·코드·JSONPath 실행 없이 선언 판본도 Input에 고정한다.
- `delivery-record` version 1은 brief/rights/release/performance를 구분한다. 원문 증거와
  적용 대상의 정확한 판본을 필수 연결한다. 권리·배포 상태는 외부 보고이며 내부 승인과 다르다.
- 성과는 플랫폼·계정·외부 배포 ID·측정 구간·asOf·집계 기준·지표 정의·단위를 보관한다.
  performance의 release 대상은 같은 identity를 가진 실제 release structure-map이어야 한다.
  다른 플랫폼의 지표를 합산하거나 권리의 법적 유효성을 자동 판정하지 않는다.

## 수용 조건

기존에 합의한 공개 Resource MCP inspect/normalize, Input/Operation/graph와 공통
Adapter/recorder 경계에서 합성 fixture로 검증한다. 한 동작씩 실패 → 구현을 반복한다.
native 부분 오류·성공인데 파일 누락·미지원 응답·포인터/선언 위조·필수 연결 누락,
scope/선택/용량·경로 격리·오래된 Input 검증을 유지한다. 새 계약으로 잠금을 끌 수 없다.

실제 stdio에서 공급자 응답/선언 + 브리프 + 권리 + 배포판 + 성과와 증거를 보관하고
재시작 후 실제 읽은 값으로 다음 결과와 후속 결과를 만든다. 권리 문서·성과 또는 선언
변경이 두 단계 뒤 재검토로 전파되는지 확인한다. 실제 생성·공급자 계정·외부 배포는 하지 않는다.

전체 check와 설치 tarball을 검증하고 Standards/Spec 독립 리뷰를 반영해 #7 위에 PR을 올린다.
형식 근거는 배경 조사 [공급자 응답](2026-10-23-chroma-provider-response-research.md)에 기록한다.
