# 다음 작업의 맥락 묶음과 P0~P4 단일 작업 공간 검증

기준은 PR #8 head `49f4dcf`와 [P0~P4 점검](2026-10-23-chroma-p0-p4-audit.md)의
우선순위 1·2다. PR #2~#8이 미병합이므로 `codex/chroma-provider-delivery` 위의
stacked PR로 올린다.

## 현재 상태

- `context-package`는 이미 typed closure의 일부다. Input에 넣으면 item의 정확한
  판본과 증거가 펼쳐지고, 그 안의 structure-map은 원본·연결 파일·별도 선언까지 펼친다.
  package의 `sourceContextRevisionId`와 coverage 누락은 provenance라 펼치지 않는다.
- `usage-context`는 역할별 정확한 판본과 observed/selected/unknown 상태를 기록하지만
  "어떤 역할이 필수인지"와 "그 판본이 어떤 자료여야 하는지"를 표현하지 못한다.
  따라서 brief/rights/provider-response map을 빠뜨린 묶음도 정상 package로 보관된다.
- 같은 결과물의 brief/rights 등은 역방향 관계라 자동 포함되지 않는다. 이 동작은 유지한다.

## 설계

새 자료형이나 별도 연결 체계를 만들지 않는다. `usage-context` version 1에 선택 필드
`requirements`를 추가하고 `context-package`가 출처 context의 요구를 그대로 복제·검증한다.
필드가 없는 기존 기록·Input은 의미가 바뀌지 않는다.

```json
{ "role": "rights", "required": true,
  "accepts": [{ "kind": "structure-map", "format": "delivery-record", "recordType": "rights" }],
  "bindsRole": "deliverable" }
```

- `role`은 고유하다. `required`는 명시 boolean이다.
- `accepts`(선택)는 그 역할 state의 정확한 판본이 만족할 kind/format/recordType이다.
  format은 structure-map, recordType은 delivery-record에만 쓴다. 판본을 다시 읽고
  structure-map은 원본에서 재계산해 대조한다.
- `bindsRole`(선택)은 그 역할의 structure-map이 다른 역할 state의 정확한 판본을 실제
  binding으로 가리켜야 한다는 뜻이다. 같은 결과물의 브리프·권리·배포를 함께 묶을 때
  다른 판본의 기록이 섞이는 것을 막는다. 관계를 새로 만들지 않고 기존 binding만 확인한다.
- 역할 상태는 `provided`(조건을 만족한 observed/selected state), `unknown`, `absent`다.
  잘못된 kind/format/recordType이나 다른 판본을 가리키는 state는 기록 자체를 거절한다.
  필수 역할이 provided가 아니면 `CONTEXT_REQUIRED_MISSING`이다.

차단 위치:

1. `folio_resource_query context` 미리보기는 역할별 상태와 `ready`를 반환한다. 저장하지 않는다.
2. `context-package` 보관과 Input closure는 필수 역할마다 provided state가 실제 item으로
   들어갔는지 검사한다. 예산 때문에 잘린 필수 item도 누락이다.
3. 요구가 있는 `usage-context`를 Input에 직접 넣어도 필수 역할이 provided가 아니면 차단한다.
4. 필수 structure binding 누락은 기존 `STRUCTURE_BINDINGS_INCOMPLETE`로 Input 준비에서 차단한다.

유지하는 규칙: 묶음은 정확한 판본만 가리키며 원본의 새 판본을 자동 반영하지 않는다.
변경은 기존 review impact로 후속 결과에 전파한다. 이야기/경로 격리는 package 전체의
typed reference에 대해 기존 `assertContextIsolation`이 검사한다. 권리 기록의 연결·필수
충족은 외부 보고의 존재이며 법적 승인·작업 승인·자기검토 승격이 아니다.

## 통합 흐름

`examples/chroma-continuity.js`가 실제 stdio MCP 하나의 작업 공간에서 실행한다.

1. 호스트 다운로드 폴더의 합성 공급자 응답(Runware/MiniMax/선언형)·이미지·영상을
   `importFile`로 보관하고 원본 파일을 삭제한다.
2. P0: 응답 map이 보관 이미지/영상 판본에 연결된다. 선언형 응답은 선언 판본을 포함한다.
3. P1: ComfyUI workflow의 LoadImage 입력은 Runware map이 해석한 결과 ID를 쓰고 그 이미지
   판본과 custom node 계약·model 파일을 연결한다. 작업 1 출력 frame은 연결 이미지 hash와
   workflow 구조 값을 소비한다.
4. P2: OTIO 편집이 작업 1의 frame과 MiniMax 영상을 연결한다. 작업 2 출력 cut은 clip 구간과
   연결 파일 hash를 소비한다.
5. P3: project-manifest가 cut과 DB snapshot(외부 상태 증거)을 연결한다. 작업 3 출력
   deliverable은 cut hash와 DB 값을 소비한다.
6. P4: deliverable에 대한 brief/rights/release와 release에 대한 performance를 원문 증거와 연결한다.
7. MCP 재시작 후 그래프에서 deliverable을 가리키는 map을 찾아 사용자가 명시적으로
   usage-context 역할에 넣는다. 미리보기 → package 보관 → package 하나로 Input.
8. 작업 4는 Input에서 읽은 요구사항·권리 보고·지표·file ID·DB 값·구간을 소비하고 작업 5는
   작업 4 출력을 소비한다.

## 수용 기준

- 원본 파일 삭제와 중간 재시작 뒤에도 보관 바이트를 읽고 원래 bytes와 같다.
- package 하나의 Input에 응답·선언·연결 파일·편집/프로젝트/배포 map·증거·release가
  정확한 집합으로 포함되고 usage-context(provenance)는 포함되지 않는다.
- 필수 역할 unknown/누락/예산 절단, 필수 binding 누락, 잘못된 역할 자료, 다른 결과물
  판본의 권리 기록을 각각 차단한다.
- 공급자 원문, 편집 의존 영상, 프로젝트 DB 증거, 권리 증거, 성과 기록의 변경이 각각
  작업 4·5의 재검토 사유로 나타난다.
- 모든 변경 뒤 과거 Input을 검증하면 판본과 contentHash가 그대로다.
- 중첩 P3/P4 map의 증거로 다른 경로 context를 넣으면 `CONTEXT_SCOPE_MISMATCH`.
- 위조 package·위조 structure-map·다른 identity의 performance·Input 용량 초과를 거절한다.
- 구버전 parser map을 담은 package는 새 작업 시작에서 거절하되 과거 Input은 검증된다.
  requirements 없는 기존 usage-context/package는 그대로 동작한다.

실제 모델 생성·공급자 호출·미디어 재생·편집기/엔진 복원·외부 게시·법률 판단은
검증 대상이 아니며 결과에 false로 명시한다.

## 독립 리뷰 반영

### Standards

문서화된 규칙 위반 0건. 판단 사항 smell 9건 중 6건을 반영했다. requirements 행과
package item의 대조를 `coverRequirements` 하나로 모았고(collect/package 중복·상태 재해석),
delivery recordType 목록은 parser의 `DELIVERY_RECORD_TYPES`를 공유한다. throw 목적 호출은
`verifyRequirementRecords`로 이름을 드러냈고 state 판본 선택은 `usageStateRevisionId`로
export했다. usage-context를 closure에서 한 번 더 읽는 비용, 검사 목록 중복, 기존 관례와 같은
브랜치 blob 링크는 유지한다. requirements는 선언하지 않으면 꺼지는 선택 필드이며 필수 차단은
잠금 성격이라 별도 on/off 설정을 두지 않는다.

### Spec

`bindsRole`이 evidence slot의 같은 판본으로도 통과하는 오류 1건과, deliverable state를
둘 두어 다른 결과물 기록을 통과시키는 변형을 재현했다. subject binding만 비교하고 대상
역할 state를 정확히 하나로 제한했다. bindsRole은 delivery-record accepts를 요구한다.
필수 binding이 빈 역할 map이 미리보기에서 `ready:true`였던 부분도 `incomplete`로 바꾸어
package 보관부터 차단한다. 역할 선언이 없거나 중첩 map이 비면 기존 Input closure가 차단한다.
text 발췌 절단은 Input에 전체 bytes가 들어가므로 provided로 두고 문서화했다. 목적별 선언은
usage-context 단위 선언으로 정리하고, 선언 없는 ad-hoc package는 차단이 없음을 명시했다.
