# 공급자 응답·브리프·권리·배포 성과 연결

확보한 JSON/문서/CSV/미디어는 [공통 반입](production-data.md)으로 보관한다. 이어서 기존
`folio_resources inspectStructure/normalizeStructure`로 읽은 reference key를 실제 자료 판본에
연결한다. [프로젝트 연결](project-data.md)과 같은 Resource/Input/Operation을 사용한다.
파일을 자동 선택하거나 외부 URL을 가져오지 않는다.

## 공급자 응답

| format | 확인한 고정 응답 | 파일 슬롯과 의미 |
|---|---|---|
| runware-image-response | Runware Models `/v1` imageInference의 data/errors envelope | imageURL → image. embedded-only는 /data/i/@image에 별도 추출 파일 연결. 같은 task의 여러 imageUUID와 독립 오류를 유지. 응답 하나로 batch 완료를 추론하지 않음 |
| minimax-video-query | 기존 `/v1/query/video_generation` 단일 task | API code 0과 영상 Success는 다름. /file_id → 보관 영상. 큰 ID는 string 그대로이며 URL로 취급하지 않음 |
| kling-video-query | legacy `/v1/videos/text2video/{task_id}` 단일 조회 | succeed의 videos/i/url과 watermark_url을 별도 video/watermarked-video로 연결. list·최신 endpoint 계약은 제외 |
| provider-response | 아래 Linivera 선언으로 지정한 JSON 응답 | 정확한 JSON Pointer와 명시적 역할로 연결. 선언 판본도 Input에 포함 |

Native source는 아래 공식 계약을 기준으로 한다.
[Runware 공통 응답](https://runware.ai/docs/models-api/introduction),
[이미지 필드](https://runware.ai/docs/models/z-image), [오류](https://runware.ai/docs/models-api/errors),
[MiniMax 조회](https://platform.minimax.io/docs/api-reference/video-generation-query),
[Kling legacy](https://kling.ai/document-api/api/video/3-0-omni/text-to-video/legacy).
위 계약의 구조 해석이며 모든 모델·웹 기능·공급자 API 호출을 구현했다는 뜻은 아니다.

작업/결과 ID와 상태는 공급자 보고다. 응답만으로 원래 prompt·입력 hash·사용 권리·실행
영수증·내부 승인을 증명하지 않는다. 원래 실행의 결속은 기존 recorder/recordExecution에
확보한 원본 요청과 관측을 명시적으로 남긴다. 보관 응답 map과 파일은 이후 실제 사용한
Input/Operation에 연결할 수 있다. failed/pending snapshot도 해당 상태의 자료다.
성공인데 파일 위치가 없으면 필수 미연결 슬롯으로 남겨 완전한 다음 Input을 차단한다.

## 전용 응답 파서가 없는 경우

다음 선언 JSON을 Resource로 보관한 뒤 `format: provider-response`와
`dependencyManifestRevisionId`에 그 판본을 지정한다.

```json
{
  "version": 1, "provider": "synthetic-partner", "endpoint": "/result", "schemaVersion": "report-v1",
  "taskIdPointer": "/task/id", "statusPointer": "/task/state",
  "outputs": [{"pointer": "/results/0/url", "role": "image", "required": true}]
}
```

taskIdPointer/statusPointer는 생략하면 unknown이다. outputs는 명시한 순서·역할을 사용한다.
포인터는 RFC 6901의 정확한 위치이며 `~0`/`~1` escape를 지원한다. wildcard/JSONPath/코드를
실행하지 않고 prototype을 탐색하지 않는다. 누락은 unresolved/unknown, 복합 출력 값·중복
포인터·잘못된 escape는 오류다. 출력 locator는 파일명/ID/URL 단서이며 byte 동일성을 뜻하지 않는다.
실제 파일을 연결하면 원본 응답·선언·파일의 정확한 판본이 다음 Input에 함께 들어간다.

map은 출력 URL 문자열을 복제하지 않고 원본 JSON Pointer를 남긴다. 알려진 인증 문자열은
표시용 텍스트에서 가린다. 이것이 원본의 비밀 제거를 뜻하지는 않는다. 원본 Resource는
그대로 보존하므로 인증 debug dump는 반입 전에 필요한 비밀을 제거한 별도 사본으로 준비한다.

## 브리프·권리·배포·성과 기록

`format: delivery-record`는 Linivera version 1 선언이며 공급자 native 문서 형식이 아니다.
공통 필드는 다음과 같다. 예제의 complete JSON은
[synthetic-delivery.js](../examples/support/synthetic-delivery.js)를 따른다.

```json
{
  "version": 1, "recordType": "brief", "recordId": "brief-1", "issuer": "synthetic-partner",
  "observedAt": "2026-10-23T00:00:00Z",
  "subjects": [{"role": "deliverable", "hint": "chosen video"}],
  "evidence": [{"role": "source-document", "hint": "brief.pdf"}],
  "details": {"requirements": [{"id": "title", "text": "Keep the title visible", "priority": "required", "evidence": [0]}]}
}
```

subjects와 evidence의 `/.../i/hint`를 정확한 보관 판본에 연결한다. 행의 evidence는
공통 evidence 배열의 인덱스다. 원문 증거가 없으면 필수 미연결 슬롯이 생긴다.
조건·권리 보고·지표는 자동 품질 검사나 내부 승인으로 바뀌지 않는다.

| recordType | details 계약 |
|---|---|
| brief | requirements[]: id, text, priority(required/preferred), evidence[] |
| rights | claims[]: id, status(reported-granted/reported-denied/reported-revoked/unknown), permissions[], territories[], channels[], validFrom/validUntil(UTC 또는 null), conditions(text 또는 null), attribution(text 또는 null, 생략 가능), evidence[] |
| release | identity:{platform,account,externalId}, status(reported-published/reported-scheduled/reported-removed/unknown), publishedAt(UTC 또는 null), url(HTTP URL 또는 null). 정확히 하나의 deliverable subject |
| performance | identity, period:{start,end,asOf,basis(interval/cumulative)}, metrics[]:{id,metric,value,unit,definition,dimensions:[{name,value}],evidence[],currency?}. 정확히 하나의 release subject |

권리는 특정 대상 판본에 적용된 외부 보고로 관리한다. 적용 범위·조건·표기·철회 보고와
근거를 보관하며 법적 유효성을 자동 판단하지 않는다. release의 외부 게시 상태도
리니베라 Publication과 구별한다. 여러 파일을 한 배포판으로 묶으려면 artifact-bundle을 쓴다.

성과 subject는 반드시 delivery-record의 release structure-map에 연결한다. 플랫폼·계정·
외부 ID가 하나라도 다르면 거절한다. 해당 map을 원본에서 다시 해석해 대조하고 Input은
release map·원문·게시 대상·증거까지 펼친다. URL이나 임의 문서만으로 이를 대신할 수 없다.

모든 시각은 명시적 UTC다. 성과 구간은 [start,end), start < end <= asOf <= observedAt이다.
cumulative이면 start는 해당 누적 보고의 명시한 시작점이다. 지표 정의·차원·단위가 다른
관찰을 합산하거나 중복 제거하지 않는다. unit이 currency일 때만 3자리 대문자 currency가
필수이며 통화 계산은 수행하지 않는다. 값은 유한한 JS 안전 범위의 number다.

## 후속 작업과 변경

선택한 map을 Input에 넣으면 원본·선언·실제 파일·증거·release까지 고정된다. 필수 미연결,
미선택·scope·예산 초과와 직접 위조한 map은 기존 검증에서 거절한다. 증거/보고/응답 선언의
새 판본을 선택하면 후속 결과를 재검토 대상으로 표시하고 과거 Input과 기록은 유지한다.

`node examples/delivery-continuity.js --change=rights`의 change는 rights, rights-proof,
performance, contract를 지원한다. 실제 stdio 재시작 후 읽은 요구사항·권리 보고·지표·file ID를
다음 결과와 후속 결과에 사용하고 두 단계 전이 재검토를 검증한다. 전부 합성 자료이며
영상은 opaque fixture다. 실제 공급자/법률 판단·미디어 재생·외부 게시 검증은 수행하지 않는다.
