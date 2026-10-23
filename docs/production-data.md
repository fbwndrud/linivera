# 생성 도구의 결과를 다음 작업으로 연결하기

이 기능은 [공통 자원](resources.md)과 [모션 제작](motion.md)의 저장·입력·검토 구조를 이어 쓴다. 생성 결과 파일, 실제 요청, 실행 관측, 후보별 검토를 같은 Resource/Operation으로 연결한다. core는 모델이나 네트워크를 호출하지 않는다.

도구별 자동 해석·수동 연결·파일 보관 범위는 [Chroma 지원표](chroma-support.md),
workflow/3D/자막 내부 참조를 다음 Input에 고정하는 절차는 [구조 연결](structure-links.md)을 따른다.
편집 타임라인과 커스텀 패키지·3D 확장 참조는 [편집·확장 의존성](editing-dependencies.md)을 따른다.

## 확인된 실행 예제

```sh
node examples/production-continuity.js
```

Node 지원 버전과 FFmpeg가 필요하다. 합성 PNG/WAV와 가짜 공급자 transport를 사용하고 실제 stdio MCP 서버에 연결한다. 외부 생성 호출이나 API 키는 필요 없다. 다음 경로를 검증하고 임시 데이터를 지운다.

1. 선택된 prompt/발화문과 generation-request를 Input에 고정한다.
2. fal 이미지와 ElevenLabs 음원·문자 정렬을 공통 실행 기록에 회수한다.
3. 서버를 재시작하고 같은 작업 ID의 관측 상태를 읽는다. 생성 POST를 재전송하지 않는다.
4. 각 후보의 파일과 manifest 전체 hash를 검토하고 합성 사용자 결정을 기록한다. 파일 반입만으로 승인되거나 입력으로 선택되지는 않는다.
5. 보존한 이미지·음원을 기존 모션 작업에 입력해 샷→타임라인→음성 포함 영상으로 만든다.
6. 최초 prompt를 바꾸면 생성 이미지와 후속 샷·타임라인·영상에 재검토 필요가 전파된다.

예제의 승인·선택은 폐기되는 합성 프로젝트의 결정이다. 기존 작품에 대한 사용자 승인으로 재사용하지 않는다.

## 파일과 묶음

`folio_resources importFile`은 로컬 일반 파일을 최대 2GiB까지 보존한다. 8MiB 이하의 기존 파일은 v1 envelope와 기존 hash를 유지하며, 큰 파일은 v2 envelope와 스트림 복사·내용 검증을 쓴다. `propose/read`의 인라인 한도는 8MiB다.

`describe {revisionId}`는 판본·내용 hash·크기·검증 수준을 반환한다. `materialize {revisionId,output}`은 **새 절대 경로의 파일 하나**로 복사한다. 기존 출력 파일을 덮지 않고 `.folio` 관리 상태 안에는 쓸 수 없다. 반입할 파일의 symlink 경로도 거절한다. 묶음을 materialize하면 manifest JSON을 복사한다. 전체 프로젝트를 자동 복원하지 않으므로 각 멤버 판본을 별도로 materialize한다.

SRT/VTT/XML/AAF, 모델·텍스처·rig/clip, 소스·build 등도 파일로 보존할 수 있다. `validation.bytes: verified`, `validation.format: opaque`는 바이트 일치 검증이며 해당 편집기/3D 엔진에서 열리는지를 보증하는 표시가 아니다.

`importBundle` 예:

```json
{
  "op": "importBundle",
  "root": "/absolute/work",
  "resourceId": "scene-source",
  "manifest": {
    "version": 1,
    "bundleType": "editing-project",
    "members": [
      {"resourceId": "scene-xml", "relativePath": "project.xml", "role": "project", "required": true},
      {"resourceId": "voice", "revisionId": "sha256:…", "relativePath": "media/voice.wav", "role": "audio", "required": true}
    ]
  },
  "pathMappings": [
    {"relativePath": "project.xml", "path": "/absolute/export/project.xml", "mediaType": "application/xml"}
  ]
}
```

멤버별 ID·판본·상대 경로·역할을 보존한다. 기본 상한은 4096개 멤버와 8GiB다. 필수 파일 누락은 `incomplete`로 남고 다음 Input 준비를 막는다. 필수 멤버가 외부 URL 판본뿐이면 보존 파일로 세지 않으며 `reference-only`도 이 차단을 우회하지 않는다. `a`, `a-b`, `a/child`처럼 다른 이름이 끼어 있어도 파일·디렉터리 경로 충돌을 거절한다. `completeness`, `dependencyCoverage`, `restorability`는 별개다. 선언 파일을 모두 보존해도 숨은 외부 의존이나 편집 재개 가능성을 자동 확정하지 않는다.

중첩 묶음은 모든 멤버의 선택·scope·실제 파일 크기를 Input에서 검사한다. 묶음 하나를 선택했다는 이유로 내부 파일의 선택·권한·예산 검사를 건너뛰지 않는다.

## 요청·실행·후보

`kind: generation-request`인 JSON Resource의 version 1 계약은 `provider`, `product`, `endpoint`, `capability`, `schemaVersion`, `parameters`, `inputBindings`, `outputSpec`을 담는다. `inputBindings`는 `{fieldPath,revisionId,role}`로 실제 입력 판본을 가리킨다. 해당 판본은 Input snapshot 안에 있어야 한다.

`folio_operations start`에 `operationContractVersion:2`, `requestRevisionId`를 함께 전달한다. 이 계약 버전과 요청 판본은 Operation hash에 결속된다. v2는 기존 `submit/review/decide` 경로를 사용할 수 없으며, v1은 후보 그룹 API를 사용할 수 없다.

실행 기록은 `recordExecution {operationId,executionId,expectedExecutionHead,event}`로 추가한다. `expectedExecutionHead`는 최초 `null`, 이후 정확한 `{seq,hash}`다. `inspect`는 실행 상태와 페이지 단위 이벤트를 반환한다. `executionHead`를 지정하면 과거의 검증된 prefix를 읽는다.

상태는 `prepared → submitting → accepted/running → outputs-observed → complete`를 기본으로 한다. 실패·취소·부분 회수·응답 불명은 별도로 남는다. `complete` 보고만으로 승인되지 않으며 선언한 모든 출력 slot이 있어야 complete가 성립한다. 원래 공급자 상태, 관측하지 못한 필드, 가린 필드 경로도 보존한다. 모든 실행 증거의 수준은 `host-reported`다.

완료 후 같은 파일을 다시 관측하면 complete를 유지한다. 새 파일 때문에 출력 개수가 달라지면 현재 실행은 partial이 되며 complete 재보고도 거절한다. 이미 봉인한 후보의 과거 execution prefix와 영수증은 그대로 검증한다.

고정 후보는 `outputSpec.groups`에 미리 선언한다. 동적 복합 실행은 `groupRules`의 native key 필드·최대 그룹·종류와 `slotsSchema`를 고정하고, `group-discovered` 이벤트로만 새 그룹을 발견한다. 현재 fal·ElevenLabs·Meshy 공급자 Adapter는 고정 후보를 사용한다.

완전한 후보만 `submitGroup`으로 제출한다. 제출은 입력 snapshot·실행 ID·실행 prefix·request digest·후보 ID·파일·manifest를 함께 고정한다. `reviewGroup`은 manifest를 포함한 모든 출력 hash를 검토하고 `decideGroup`은 해당 영수증과 현재 checkpoint에 결속한다. 한 후보의 hard 지적은 그 후보의 승인을 차단한다. 다른 후보에 대한 별도 검토와 부분 결과 보존은 가능하다.

아직 제출하지 않은 회수 파일도 producer 입력 계보를 가진다. 그래프의 `observed-output`은 승인 출력과 구별한다. source 선택 변경은 이 경로를 통해 후속 제작에도 재검토 필요를 전파한다.

## 호스트 Adapter 연결

다음 모듈은 `prepare/submit/inspect/collect` Interface를 제공한다. 자격정보와 네트워크 구현은 호출 호스트가 주입한다. 기본 네트워크 transport나 자동 과금 실행은 제공하지 않는다.

| 모듈 | 확인한 대표 endpoint | 주입 transport |
|---|---|---|
| `adapters/production/fal.js` | `fal-ai/flux/schnell` 이미지 queue | `submit(endpoint,{input})`, `status(endpoint,{requestId,logs})`, `result(endpoint,{requestId})`, `download(url)` |
| `adapters/production/elevenlabs.js` | `/v1/text-to-speech/{voice_id}/with-timestamps` | `convertWithTimestamps(voiceId,body,query)` |
| `adapters/production/meshy.js` | `/openapi/v2/text-to-3d` preview, refine은 별도 작업 | `submit(endpoint,input)`, `get(endpoint,jobId)`, `download(url)` |
| `adapters/production/manual-capture.js` | 로컬 사용자 파일 | transport 없음, 명시적 capture ID와 파일 bytes |
| `adapters/production/versioned-export.js` | 임의 파트너의 확보한 파일·역할·bundle | 호스트/브로커가 bytes 또는 절대 로컬 path를 명시. 공급자 전용 파서 불필요 |

공식 schema 근거는 각 Adapter의 `*_SCHEMA_SOURCE`, [fal API](https://fal.ai/models/fal-ai/flux/schnell/api), [ElevenLabs timestamps API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)에 있다. 저장소의 `docs/plans/2026-10-22-chroma-data-implementation-plan.md`에는 전체 조사와 후속 계획을 기록했다. 한 endpoint를 지원한다는 뜻이며 해당 회사의 모든 모델·웹 기능을 지원한다는 뜻은 아니다.

`prepare(request,pinnedArtifacts)`는 text/plain 판본 bytes와 실제 prompt/text가 일치하는지 확인한다. 실제 전송용 `nativeRequest`에는 민감한 값이 있을 수 있다. 저장용 `nativeRecords`는 비밀키·인증 문자열·signed URL query 등을 가리고, `requestDigest`는 가린 저장본의 canonical JSON hash다. 가린 저장본을 완전 재현 가능한 원문이라고 해석하지 않는다.

`collect`는 `{artifacts,nativeRecords,observation,unavailableFields}`를 반환한다. 파일 ID는 provider/accountAlias/endpoint/jobId/artifactKey로 안정 대응한다. signed URL에서 이미 회수한 파일은 이후 URL 만료와 무관하게 보존된다. 실패한 다운로드 재시도는 같은 job을 회수하며 새 생성과 구별한다.

fal의 `download`는 6MiB 이하 Uint8Array 또는 `{path,contentHash?}`를 반환한다. base64 인코딩과 JSON 여유를 고려한 전송 한도이며 Resource 자체의 8MiB 인라인 저장 한도와 구별한다. 큰 결과는 정규화된 절대 로컬 경로로 전달하고 기존 `importFile` 경로에서 스트리밍으로 보관·검증한다. 큰 bytes를 인라인 MCP 메시지로 보내기 전에 거절하므로 같은 job을 파일로 다시 회수할 수 있다.

ElevenLabs는 6MiB 초과 음원을 위해 `transport.captureAudio(bytes)`를 제공한다. 호스트가 임시 일반 파일에 기록하고 `{path,contentHash?}`를 반환하면 Adapter는 원래 응답의 hash를 고정하고 MCP가 파일을 검증·보관한다. 경로 파일은 호스트가 보관 완료 후 정리한다. sink가 없거나 실패해도 동기 응답과 handle은 살아 있는 Adapter에 유지되므로 새 생성 POST 없이 같은 응답을 다시 회수한다. 수 MB의 정상 base64 음원은 재귀성 정규식 없이 검사한다.

`server/production/recorder.js`의 `createProductionRecorder({call,root,operationId,executionId})`가 이 관측을 기존 MCP 도구로 보존한다. `call`은 raw tool result를 반환하는 호스트 함수다. 사용 예는 실행 예제를 따른다. 준비와 제출 양쪽에서 실제 MCP에 봉인된 generation-request 및 text Resource를 다시 읽고, 공급자 전송 payload의 prompt/text와 대조한다. 준비 뒤 payload를 바꾸는 경우도 제출 전에 거절한다.

fal·ElevenLabs는 inputBindings가 비어 있어도 모든 native parameter를 봉인 요청에서 계산한 값과 대조한다. 호스트는 실제 전송값을, core는 가린 저장본을 검사한다. 이 순수 프로젝션과 redaction은 `packs/production/`에 있으며 네트워크를 호출하지 않는다. 임의 custom provider의 의미를 추정해 검증했다고 표시하지 않는다.

`prepared` 후 `submit(adapter,prepared)`은 저장된 상태가 prepared인지 검사한 뒤 submitting을 먼저 기록한다. 응답 유실이나 프로세스 종료로 submitting/submission-unknown이 남으면 자동 재전송을 거절한다. provider job을 별도로 확인했다면 같은 실행에 accepted를 기록하고 회수한다. 새 생성은 새 Operation이다. `collect`는 이전 부분 관측과 합쳐 완전한 그룹만 제출하고 `incompleteGroups`에 누락 역할을 반환한다. 같은 후보를 다시 회수하면 기존 불변 제출을 재사용한다.

ElevenLabs는 동기 응답이므로 호스트가 살아 있을 때 audio와 alignment를 회수·보존해야 한다. 로컬 서버 재시작과 공급자 응답을 가진 호스트 종료는 다르다. 응답을 잃은 호스트에서 같은 음원을 재조회할 API가 있다고 가정하지 않는다. 공급자 ID가 응답에 없으면 로컬 상관 ID로 구별해 보존하고 `providerJobId`는 unavailable로 남긴다. 정렬은 정확한 audioRevisionId와 textRevisionId에 결속하며 normalized text를 원문 단어 정렬로 바꾸지 않는다.

manual capture는 보존 시점의 파일을 관측할 뿐이다. 원래 생성 도구의 입력·seed·prompt를 알 수 없다면 unknown으로 남긴다. 이후 리니베라 작업에 입력한 이력은 기록할 수 있다.
[파서 없는 파트너 자료와 프로젝트 의존성](project-data.md)은 공통 브로커 반입에서
코드·씬·sprite atlas·DB/환경/배포 증거를 다음 작업에 연결하는 방법을 설명한다.
[응답·브리프·권리·배포 성과](delivery-data.md)는 공급자 출력과 적용 조건·배포판·지표를
정확한 원본/증거 판본에 연결하는 P4 계약이다.

공식 Meshy MCP 재사용은 위 transport 경로와 별도로 호스트가 제공한 구현·판본·도구 schema의
지원 교집합을 확인한다. 부분 다운로드는 같은 작업에서 회수하며 전체 필수 파일을 확보해야
보관 완료로 센다. 절차와 지원 제한은 [연결 준비](connection-readiness.md), 입력 대조와
필수 맥락은 [기능 준비](capability-readiness.md)·[맥락 묶음](context-bundles.md)을 따른다.

## 이번 범위

A–C는 큰 파일/묶음, 실행·후보 관리, 대표 공급자와 수동 반입, 후속 모션 소비를 구현한다. 후속 D–F의 작업별 판본 비교·수정 의도·사용 맥락·지식 묶음·추가 데이터 유형은 [회차 연결 안내](continuity.md)에 있다. 외부 공급자 검증은 합성 응답과 주입 transport 계약 검사이며 실제 계정·유료 생성·공급자 가용성을 검증한 결과는 아니다.
