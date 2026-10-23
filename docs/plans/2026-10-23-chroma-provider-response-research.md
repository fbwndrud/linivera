# P4 공급자 응답 계약 조사

확인일: 2026-10-23. 공식 문서 열람만 수행했다. API 실행·유료 호출·실제 결과물 수집은 수행하지 않았다. 아래 JSON은 전부 합성 fixture 제안이다. 이 문서는 조사 결과와 구현 권고이며 구현 완료를 뜻하지 않는다.

## 채택 범위

자동 판별 대신 호출자가 고정 format을 선택하고 해당 응답 계약을 검증하는 순수 구조 파서를 권고한다. JSON만으로 어느 계정·endpoint에서 왔는지 인증할 수 없다.

| 제안 format | 고정 계약 | 제외 범위 |
| --- | --- | --- |
| `runware-image-response` | Models API `POST https://api.runware.ai/v1`의 `imageInference`, `data[]`/`errors[]` envelope | Runware 전체 모델·video/audio/3D·Serverless·SDK 반환 배열·webhook·polling 상태 |
| `minimax-video-query` | `GET https://api.minimax.io/v1/query/video_generation`의 기존 단일 task 조회 | H3 등 별도 새 endpoint, 생성 요청, files/retrieve 응답, speech |
| `kling-video-query` | legacy `GET https://api-singapore.klingai.com/v1/videos/text2video/{task_id}` 단일 조회 | 최신 text-to-video API, image2video, omni-video, list 조회, callback |

Endpoint는 각사의 [Runware 인증 문서](https://runware.ai/docs/models-api/authentication), [MiniMax 조회 문서](https://platform.minimax.io/docs/api-reference/video-generation-query), [Kling legacy 단일 조회 문서](https://kling.ai/document-api/api/video/3-0-omni/text-to-video/legacy)에서 확인했다. format 이름과 제외 범위는 Linivera의 구현 경계 제안이다.

## Runware imageInference

공식 Models API 응답은 `data` 배열에 task 결과를 담는다. 결과별 `taskType`, `taskUUID`로 요청과 대응하며 여러 결과가 독립적으로 도착할 수 있다. 응답 한 개만 보고 전체 batch 완료를 추론하면 안 된다. [공식 공통 응답](https://runware.ai/docs/models-api/introduction)

공식 Z-Image 응답 계약의 `taskType: "imageInference"`, `taskUUID`, `imageUUID`는 required로 표기된다. `imageURL`, `imageBase64Data`, `imageDataURI`는 선택 출력 표현이며 `seed`, `NSFWContent`, `cost`도 선택 필드다. `cost`는 요청의 `includeCost`에 따라 포함된다. 이 특정 응답에는 `status`가 required로 표기되지 않는다. [공식 이미지 응답 필드](https://runware.ai/docs/models/z-image)

`errors[]`에는 `code`, `message` 및 선택적인 `parameter`, `taskType`, `taskUUID`, `retryAfter`, `documentation` 등이 온다. 인증 오류 예에는 task UUID가 없다. batch 일부 실패가 다른 task의 성공을 막지는 않는다. 오류 형식은 공급자마다 변동 가능하다고 명시한다. [공식 오류 문서](https://runware.ai/docs/models-api/errors)

파서 권고:

- `data` 또는 `errors` 배열 중 하나 이상을 요구한다. `data[]`의 다른 taskType을 이미지로 해석하지 않는다. 성공 배열이 비어 있고 오류만 있는 응답도 유효한 관찰 결과다.
- `/data/0`은 결과 unit, `/data/0/imageURL`은 image 파일 연결 slot이다. UUID는 문자열 식별자이며 파일 hash가 아니다. 같은 taskUUID의 서로 다른 imageUUID를 합치지 않는다.
- base64/dataURI만 있는 결과도 원본 JSON 보관은 가능하다. 자동 decode를 지원하지 않으면 그 표현을 unknown으로 남기고, `/data/0` 출력 unit에 실제 retained image 판본을 수동 연결한다. URL 부재를 성공 부재로 바꾸지 않는다.
- 상태 없는 완성 image item과 polling item을 혼동하지 않는다. `status: "processing"`만 있고 imageUUID가 없는 acknowledgement는 이 고정 계약의 완성 image item이 아니다. 별도 polling 계약은 후속 범위다. [공식 polling 계약](https://runware.ai/docs/models-api/task-polling)

합성 최소 성공·부분 오류 envelope:

```json
{
  "data": [{
    "taskType": "imageInference",
    "taskUUID": "11111111-1111-4111-8111-111111111111",
    "imageUUID": "22222222-2222-4222-8222-222222222222",
    "imageURL": "https://example.invalid/synthetic-image.png"
  }],
  "errors": [{
    "taskType": "imageInference",
    "taskUUID": "33333333-3333-4333-8333-333333333333",
    "code": "syntheticFailure",
    "message": "Synthetic failure"
  }]
}
```

JSON Pointer 예는 이 fixture를 대상으로 한다. 오류의 문장에 포함된 URL은 출력 파일 slot으로 간주하지 않는다. 본 응답에는 원본 prompt·입력 파일 hash·입력 ResourceRevision ID가 없으므로 taskUUID만으로 기존 Input의 인과를 증명할 수 없다. 별도 원본 요청과 실행 영수증이 확보되면 그 판본을 수동 연결한다. 이는 응답 필드에서 도출한 한계이며 공급자의 출처 인증 기능을 부정하는 주장이 아니다.

## MiniMax 기존 video task 조회

조회 query parameter `task_id`는 required string이다. 응답은 `task_id`, `status`, `base_resp`를 가지며 상태 enum은 `Preparing`, `Queueing`, `Processing`, `Success`, `Fail`이다. 성공 시 `file_id`(string), `video_width`, `video_height`가 반환된다. 공식 응답 필드에는 요청 query와 같은 required 표기가 없으므로 아래 필수성은 Linivera의 엄격한 수용 규칙이다. [공식 조회 계약](https://platform.minimax.io/docs/api-reference/video-generation-query)

`file_id`는 URL이 아니다. 별도 `GET /v1/files/retrieve?file_id=...`의 응답 예가 `file.file_id`, `file.filename`, `file.purpose`, `file.download_url`을 제공한다. retrieve query schema는 int64지만 조회 결과 file_id는 string이므로 JS Number로 왕복하지 않는다. 이 별도 응답은 이번 3개 파서 범위 밖이며 원본 Resource로 수동 보관·연결할 수 있다. [공식 다운로드 계약](https://platform.minimax.io/docs/api-reference/video-generation-download)

파서 권고:

- 정상 조회 응답에서 nonempty `task_id`, 알려진 `status`, `base_resp.status_code` 정수를 요구한다. `base_resp.status_code !== 0`이면 API 오류 관찰로 보관하고 성공 output을 만들지 않는다. 오류 envelope에 task/status가 없을 수 있는지는 본 페이지로 확정하지 못했으므로 성공 schema를 강요하거나 task를 지어내지 않는다.
- `Success`는 nonempty string `file_id`를 요구한다. `/file_id`를 required video 파일 연결 slot으로 만들고 저장된 video 판본에 수동 binding한다. 경로나 URL처럼 fetch하지 않는다.
- pending/Fail에는 완성 output을 추론하지 않는다. `status_msg`는 운영 오류 설명이며 배포 성과·권리 승인·실행 성공 영수증이 아니다.
- 응답의 `task_id`가 기존 Operation ID와 같다고 가정하지 않는다. query snapshot끼리의 비교도 공급자·계약·task_id가 함께 일치해야 하며 과거 snapshot을 갱신하지 않는다.

합성 성공:

```json
{
  "task_id": "synthetic-task-1",
  "status": "Success",
  "file_id": "90071992547409931234",
  "video_width": 1280,
  "video_height": 720,
  "base_resp": {"status_code": 0, "status_msg": "success"}
}
```

합성 pending/실패 테스트는 위 객체에서 `status`를 각각 `Processing`/`Fail`로 바꾸고 `file_id`, 크기 필드를 제거한다. `base_resp.status_code: 0`인 조회가 곧 생성 성공을 뜻하지 않는다는 경계 테스트다. 조회 응답만으로 prompt·model·seed·참조 이미지의 실제 사용 여부를 입증할 수 없다. 원본 요청/영수증/참조 파일 판본은 별도 데이터다.

## Kling legacy 단일 text2video 조회

공식 legacy 조회 응답 예는 envelope `code`, `message`, `request_id`, 객체형 `data`를 사용한다. task는 `data.task_id`, `data.task_status`이며 enum은 `submitted`, `processing`, `succeed`, `failed`다. 실패 이유는 `data.task_status_msg`; 생성 결과는 `data.task_result.videos[]`의 `id`, `url`, `watermark_url`, `duration`이다. duration은 초 단위 string이다. 생성 URL은 30일 후 제거된다고 안내한다. `task_info.external_task_id`는 사용자가 지정한 상관 ID이며 공급자 task_id와 다르다. [공식 legacy 단일 조회](https://kling.ai/document-api/api/video/3-0-omni/text-to-video/legacy)

파서 권고:

- 명시 format과 객체형 `data`로 제한한다. 배열형 list 조회와 최신 `/text-to-video/kling-3.0` 계약은 받지 않는다. 페이지의 예시가 optional 필드 필수성을 완전히 정의하지 않으므로 request_id/메시지/시각/가격을 무조건 필수로 만들지 않는다.
- `code`는 정수. `code !== 0`이면 envelope API 오류를 표시하고 task/result를 성공으로 수용하지 않는다. `code === 0`이면 nonempty `data.task_id`, 알려진 task_status가 필요하다. `succeed`에는 nonempty videos 배열과 각 video id/url을 요구하는 엄격한 subset을 권고한다.
- `/data/task_result/videos/0/url`은 required video slot, watermark_url이 있으면 별도의 watermarked-video slot으로 둔다. 둘을 같은 파일로 자동 binding하지 않는다. `duration`은 원문 string 유지; 유한한 숫자 문자열일 때만 추가 수치 관찰을 허용한다.
- pending/failed에서는 output 배열을 임의 생성하지 않는다. 응답 내 taskID·external_task_id만으로 기존 입력 판본·권리·모델 실행 진실성을 입증하지 않는다.

합성 성공:

```json
{
  "code": 0,
  "request_id": "synthetic-query-1",
  "data": {
    "task_id": "synthetic-kling-task-1",
    "task_status": "succeed",
    "task_result": {"videos": [{
      "id": "synthetic-video-1",
      "url": "https://example.invalid/synthetic-video.mp4",
      "duration": "5"
    }]}
  }
}
```

검증 한계: 직접 open에서는 JS shell만 나왔으나 동일 공식 URL의 검색 색인에서 Query Task (Single)의 전체 응답 예를 확인했다. 최신 API 호환성은 검증하지 않았다. 위 subset 밖의 필드·callback·다른 모델 endpoint는 unknown으로 남긴다.

## 원본·비밀·URL·인과관계의 경계

아래 내용은 공급자 기능에 대한 사실 주장이 아니라 기존 Linivera Resource·structure-map에 연결하는 설계 판단이다.

1. 원본 JSON은 내용 hash가 있는 ResourceRevision으로 보관하고 구조 map은 해당 exact revision을 참조한다. 출력 slot binding은 확보한 파일의 revision/hash를 참조한다. URL 문자열 일치는 byte 동일성 증명이 아니다.
2. 정규화·inspect는 URL을 가져오지 않는다. 파일 확보는 기존 broker/사용자의 명시적 작업을 거치고, bytes를 별도 Resource로 보관한 후 binding한다. 공급자 taskID와 실행 Operation의 연결은 명시적 선언이며 parser가 생성 성공을 증명하는 receipt를 만들지 않는다.
3. URL에는 서명 query·user info·fragment 등이 포함될 수 있다. 구조 map·로그·그래프·오류·표시용 locator에 URL 비밀 성분을 복제하지 않는다. JSON Pointer를 안정적인 binding key로 쓰고 표시값은 query/fragment/user info를 제거하거나 URL 전체를 생략한다. path에도 token이 들어갈 수 있으므로 query 제거만으로 완전한 비밀 제거를 주장하지 않는다.
4. 원본 bytes를 보존하면 JSON 안의 비밀도 보존된다. derived map에서 숨겼다고 원본에서도 제거했다고 설명하지 않는다. 인증 header/API key를 담은 debug dump는 보관 전에 명시적으로 비밀을 제거하고 그 copy를 별도 원본으로 가져온다. 이미 보관한 immutable bytes를 parser가 몰래 바꾸지 않는다. 원본 접근 제어와 map 표시 제한은 별개다.
5. 미지 필드·미지원 embedded 출력·애매한 상태·누락 slot은 unknown/미해결로 표시한다. 미해결 required output이 있으면 다음 Input을 완비 취급하지 않는다. 실패/pending snapshot은 그 상태의 자료로 보관할 수 있지만 생성된 영상으로 바꾸지 않는다.
6. 브리프·권리 자료·공개처·성과 데이터는 각각의 원본 Resource를 유지하고 이번 응답/map/파일 판본에 명시적으로 연결한다. 공급자의 success/cost/URL은 이용권·공개 승인 증명이 아니며 성과 수치도 자동 권리 판단에 사용하지 않는다.

위 3개 계약 밖 공급자·모델은 전용 파서가 없어도 원본 JSON/CSV/파일을 보관하고 수동 연결할 수 있다. native schema 자동 해석을 구현했다고 주장하지 않는다.

## 합성 테스트에 필요한 경계

- Runware: 여러 imageUUID, 같은 taskUUID의 여러 출력, data/errors 부분 실패, taskUUID 없는 인증 오류, 다른 modality, base64-only, 중복 imageUUID, 빈 envelope.
- MiniMax: 5개 상태, 성공 file_id 누락, status/base_resp 불일치, 큰 string ID, file_id를 URL로 오인하지 않기, 이전 snapshot 불변성.
- Kling: 4개 상태, code 비 0, object/list 혼동, succeed videos 누락, watermarked 별도 slot, 최신 schema 오수용 방지.
- 모든 계약: query/userinfo/fragment 합성 URL의 비밀이 map에 복제되지 않기, 원본 hash 보존, binding 대상 실제 파일 판본 검증, 재시작 후 next-input closure, 파일/원본/권리 자료의 새 판본이 후속 결과를 재검토 대상으로 만드는 흐름.
