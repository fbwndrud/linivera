# Chroma 도구 데이터를 연결하는 공통 관리 계약

2026-10-22. [구현 계획](2026-10-22-chroma-data-implementation-plan.md)의 상세 설계 제안이다. 아래 필드·MCP op·파일은 새로 구현할 대상이며 현재 호출 가능한 계약이 아니다. 기존 용어는 PR #2의 `CONTEXT.md`를 따른다.

## 1. Resource와 불변 판본을 모든 데이터의 식별 기반으로 유지한다

- 논리 ID, 판본 ID, 내용 hash, 공급자 작업 ID는 서로 다른 값이다. 같은 bytes는 저장 공간만 공유할 수 있고 별개의 논리 자산을 합치지 않는다.
- 수정본은 같은 Resource의 새 revision과 `parents`로 연결한다. 별도 포즈·캐스팅·독립 후보는 별도 Resource로 등록하고 작업/사용 맥락으로 연결한다.
- 기존 envelope v1의 바이트·hash·영수증은 그대로 검증한다. 큰 파일용 envelope v2를 추가하고 reader가 버전별로 검증한다. 기존 판본을 v2로 덮어쓰지 않는다.
- v2도 `storageStatus: owned_snapshot`, `contentHash`, `byteLength`, `mediaType`를 사용한다. 저장은 기존 content-address 공간의 검증 가능한 파일이며 외부 URL은 별도 출처 단서다.
- 큰 파일은 읽기→hash→임시 사본→불변 저장을 스트리밍한다. 원본 파일을 그대로 hardlink하지 않는다. 8MiB inline 제한은 유지하며 별도의 파일 전송 계약을 둔다.
- 첫 운영 기본값 제안은 단일 파일 2GiB, 묶음 8GiB·4,096개 멤버다. 한도는 조절 가능하되 hash·영수증·권한 검증은 항상 수행한다. 입력 예산은 실제 멤버 내용까지 계산한다.

**형식 등록:** MIME, 확장자, 바이트 관측 수준, 선택적 기술 속성 추출기를 구별한다. 허용된 형식이라고 실제 내용을 디코딩·감상한 것으로 표시하지 않는다.

| 데이터 | 보관 대상 | 추가로 연결할 정보 |
|---|---|---|
| 그림·프레임·마스크 | PNG/JPEG/WebP/AVIF 및 필요한 원본. HDR EXR 등은 opaque 파일로 보존 | 참조 역할, 프레임 위치, 크롭/마스크, 색공간·알파 관측 |
| 영상·오디오 | MP4/MOV/WebM, MP3/WAV/AAC/FLAC/PCM 등 확인된 출력 | codec·sample rate·시간 기준·track·구간, 원본과 변환본 관계 |
| 정렬·자막 | JSON, SRT, VTT, CSV | 원문/정규화 발화문, 문자·단어·화자 ID, 시간 단위·원점 |
| 3D·리그 | GLB/glTF/OBJ/FBX/USD 계열 파일과 material·texture·animation | 묶음 내부 상대경로, 역할, 실제 확인한 좌표·단위·animation 이름 |
| 편집·workflow | AAF/EDL/XML, workflow JSON, 문서화된 native project, 원본 미디어 | 편집 가능한 원본과 렌더 파일 구분, 버전/fingerprint, 외부 의존 |
| 코드·게임 | source tree·lockfile·build·실행/공유 주소, spritesheet·atlas | source/build 관계, 엔진 버전, frame/asset 참조, 실행 가능 여부 관측 |
| 실시간 | 보존하기로 한 미디어 구간과 시간순 입력/명령·session 기록 | 시퀀스 번호, 시각·구간, 중단·누락 범위, session/model 설정 |

형식 목록은 구현 시 조사표의 확인된 export와 맞춘다. 불명확한 native 파일은 opaque 보관으로 표시하고 편집/복원 지원을 약속하지 않는다. 게임 코드·XML·archive 반입 자체로 실행·외부 참조 열기를 수행하지 않는다.

## 2. 복수 파일은 manifest Resource로 묶고 멤버를 독립 식별한다

`kind: artifact-bundle`, JSON version 1의 제안 필드:

```text
bundleType: audio-with-alignment | model-with-textures | editing-project | game-project | live-session | generic
members[]: {resourceId, revisionId, relativePath, role, required}
entrypoints[]: {revisionId, role}
unavailable[]: {role, reason}
```

- manifest는 정확한 멤버 판본을 가리킨다. 모델+texture, audio+alignment, XML+원본 미디어가 사례다. 같은 파일을 다른 묶음에서 재사용해도 ID를 복제하지 않는다.
- manifest 내용만 입력에 넣어 내부 파일의 선택·scope·예산 검사를 건너뛰지 않는다. `prepare`가 실제 제공할 멤버를 펼쳐 고정하고 전체 권한·내용을 검증한다.
- 디렉터리 반입은 정규화 상대경로와 파일별 hash를 남긴다. 절대경로·상위 이동·심볼릭 링크·중복 경로를 거절한다. ZIP은 원본 archive 보존과 검사된 멤버 추출을 구별한다.
- 필수 멤버가 빠지면 `incomplete`다. 완전성은 보관/기술 상태이며 품질 승인과 별개다. 선택 멤버 생략은 이유와 범위를 남긴다.
- `completeness`는 선언된 파일의 보존 여부다. `dependencyCoverage`와 `restorability: verified|partial|unknown`을 따로 둔다. plugin·font·runtime·DB·외부 texture를 확인하지 않은 source/native package는 파일이 모두 있어도 복원 가능을 보장하지 않는다.
- 같은 생성의 manifest+members는 같은 Operation의 출력으로 등록한다. 별도 조합·변환일 때만 실제 선택한 멤버를 입력으로 새 조립 Operation을 만든다. 묶는다는 이유로 모든 생성 멤버의 추가 사용자 선택을 먼저 요구하지 않는다. 생성→파생 관계와 manifest의 `contains` 관계를 구별한다.
- 묶음 내부를 참조했다는 사실만으로 모델의 실제 생성 입력이었다고 추정하지 않는다. 후속 작업은 실제 제공한 멤버만 생성 입력으로 결속한다.

## 3. 작업 의도는 입력 Resource, 실행 관측은 추가 전용 기록으로 관리한다

`kind: generation-request`, JSON version 1의 제안 필드:

```text
provider, product, endpoint, capability, model?, schemaVersion
parameters: 공급자별 설정/문자열; 미지원 필드는 넣지 않음
inputBindings[]: {fieldPath, revisionId, role, transformRevisionId?}
outputSpec: {groupPolicy: fixed | dynamic, groups?[], groupRules?, slotsSchema}
iteration?: {baseRevisionIds[], preserveRefs[], changeRequestRevisionId}
```

이 Resource도 사용자 선택과 기존 Input snapshot으로 고정한다. 요청 자체에 모든 바이너리를 다시 삽입하지 않는다. `role`은 identity/style/first-frame/last-frame/mask/voice/dialogue/workflow-bin 등 해당 endpoint의 의미와 결속한다. `schemaRef` 문자열만으로 검증됐다고 하지 않고 capability validator를 호출한다.

`inputBindings`와 iteration·사용 맥락·workflow 안의 실제 공급 입력 참조가 봉인 입력의 폐쇄 집합에 포함되는지 검사한다. 전송 직전 native mapping의 각 파일/field가 이 집합의 정확한 판본 또는 명시적 변환 결과와 일치해야 한다. 호스트가 실제 공급자 전송을 보고했다는 수준은 별도로 남긴다.

fixed 출력은 후보 ID·개수·각 slot을 사전에 지정한다. dynamic 출력은 허용 output bin/action 종류, 안정적인 group key 구성 필드, 최대 그룹 수·slot schema를 사전에 봉인한다. 실행 중 관측한 native run/action/item/artifactKey를 이 규칙에 따라 groupId로 대응시키고 `group-discovered` event로 추가한다. 새로운 출력 형식이나 실행 목적을 발견 event로 임의 허용하지 않는다. 공급자의 최종 열거·관측 누락 범위를 별도로 표시한다.

**Operation 계약 고정:** `startOperation`에 `operationContractVersion:2`와 봉인 입력에 포함된 `requestRevisionId`를 추가하고 requestId hash에 함께 결속한다. 기존 필드만 가진 옛 요청은 v1로 해석하되 bytes/hash를 바꾸지 않는다. v2 generation-request는 v2 start만 허용한다. 모든 submit/review/decide/재개가 요청의 계약 버전을 다시 검사하여 v2 작업의 legacy 경로, v1 작업의 그룹 경로, 두 publication 경로의 중복 등록을 거절한다. Adapter나 설정으로 이 검사를 끌 수 없다.

**실행 관측 제안 필드:** `operationId`, `executionId`, `sequence`, `previousEventHash`, `type`, `providerJobId?`, `providerRunId?`, `remoteInputBindings?`, `requestDigest?`, `nativeRecordRevisionId?`, `artifactRevisionIds?`, `reportedCost?`, `unavailableFields`, `observation`.

- 실제 전송한 요청과 공급자 응답은 필요한 부분을 versioned JSON Resource로 보존하고 관측 기록이 가리킨다. 인증 header·비밀키·signed URL의 비밀 query는 제외한다. 생략한 경로는 명시한다. 원문을 가린 필드를 완전 재현 가능한 literal request라고 표시하지 않는다.
- `remoteInputBindings`는 로컬 판본/hash와 업로드 ID·URI·공급자 fieldPath의 대응이다. 업로드가 변환을 포함하면 새 Resource/Operation으로 기록한다.
- 확인 가능한 결속과 호스트의 실행 보고를 구별한다. provider request ID가 존재해도 모델 내부에서 어떤 의미를 반영했는지 증명하지 않는다.
- 기존 `reportedTrace`는 호환용 최종 요약이다. 진행 상태·부분 결과를 mutable JSON 한 개에 덮어쓰는 용도로 쓰지 않는다.
- 기록은 operation별 실행 ledger에 hash chain으로 추가하고 기존 작업 잠금 안에서 검증한다. 원본·승인 기록장의 두 번째 정본을 만들지 않는다. 모든 event는 정확한 Operation에 종속된 관측이다.
- typed transition은 `prepared → submitting → accepted/running → outputs-observed → complete`를 기본으로 하고 `submission-unknown`, `failed`, `canceled`, `partial`을 구별한다. 공급자 자체 상태도 원래 값으로 보존한다.
- 공급자 failed run의 부분 산출물도 등록한다. 아직 최종 제출 전인 산출물은 `observed-output` 계보로 실제 요청·입력과 연결하여 이후 입력으로 선택해도 producer를 잃지 않는다. 승인·최종 제출과는 다른 상태로 조회한다.

### 후보별 출력·승인 단위

v1 `submit/review/decide`는 한 Operation 전체 출력의 기존 계약을 그대로 유지한다. 새 `generation-request` 계약에서는 출력 그룹을 선언하고, v2 `submitGroup/reviewGroup/decideGroup`으로 각 그룹을 불변 제출·검토·결정한다. 그룹은 후보 하나의 영상+정렬처럼 함께 검토해야 할 산출물 단위다. 별도 후보 A와 B를 같은 그룹으로 승인하지 않는다.

`submitGroup`은 `{operationId,groupId,inputSnapshotId,executionId,executionHead,requestDigest,resultRevisionIds,groupManifestRevisionId}`를 검사한다. sealed request의 출력 명세·동일 후보 ID·모든 필수 slot·해당 실행의 관측 파일/hash와 정확히 일치해야 한다. 한 파일을 다른 후보의 정렬과 조합하면 거절한다. 완전한 그룹만 제출하며 부분 후보는 관측 상태로 남긴다.

v2 영수증·결정·`result-group-publication` marker는 groupId·불변 group hash·정확한 출력 hash와 결속한다. A의 hard 지적은 A 승인을 막고 B에 대한 별도 검토는 가능하다. 외부 요청 전체를 승인한 것으로 승격하지 않는다. 후속 실행 event가 추가돼도 이미 봉인한 그룹의 execution prefix와 출력은 유지한다.

`readOperationLineage`, graph, metadata가 v1 결과와 v2 그룹·미제출 관측 산출물을 각각 읽는다. 관측 산출물은 원인 입력을 보수적으로 따라 영향 전파하지만 승인 metadata에는 넣지 않는다. 같은 결과의 관측/최종 edge는 중복 provenance로 표시하지 않는다. 개별 공급자 action의 실제 입력이 확인될 때만 그룹 입력을 줄이고, 미확인인 복합 run은 전체 제공 입력 의존과 불명 범위를 유지한다.

실행 기록·출력 그룹에 대한 판단은 core가 저장된 request/snapshot/record를 재검증해 수행한다. 호스트가 전달한 `complete`·`approved` 문자열을 승인 근거로 사용하지 않는다. 관측 당시 결과 파일과 나중의 파일이 다르면 새 판본/불일치로 남기며 제출된 그룹을 바꾸지 않는다.

**호환:** 실행 기록은 사용자의 선택이나 품질 승인을 생성하지 않는다. 변경 입력에서 새 생성은 새 Operation이며 기존 제출 그룹을 대체하지 않는다. 기존 publication 검사를 느슨하게 고쳐 부분 승인처럼 쓰지 않는다.

## 4. 공급자별 연결은 같은 Interface를 구현한다

네트워크를 수행하는 호스트/Adapter용 제안 Interface:

```text
prepare(pinnedRequest, pinnedArtifacts) -> nativeRequest + inputMapping
submit(nativeRequest) -> providerHandle | submissionUnknown
inspect(providerHandle) -> nativeStatus + availableArtifacts
collect(providerHandle, artifactKeys) -> localFiles + nativeRecords
```

동기 응답은 `submit`에서 바로 결과를 반환할 수 있다. 최초 구현 두 Adapter는 fal의 queue 결과 회수와 ElevenLabs의 audio+alignment다. 파일 반입 경로는 웹 UI와 사용자 파일도 같은 자원 계약으로 관리한다. 자동 생성 호출 기능과 파일/데이터 관리 지원을 구별한다.

- `providerHandle`은 `{provider, accountAlias, endpoint, jobId}`로 범위를 잡는다. provider ID를 Resource ID로 그대로 쓰지 않는다. artifactKey를 포함한 안정 대응으로 재회수 시 같은 논리 ID를 유지한다.
- 통신 재시도와 새 생성을 구별한다. 공급자 idempotency가 확인된 경우만 그대로 사용한다. 생성 POST의 응답이 유실되고 조회로 조정할 수 없으면 `submission-unknown`으로 남기며 자동 재전송하지 않는다.
- 업로드·poll·download는 호스트가 수행한다. 만료 URL은 실행 중에 회수하고 파일을 hash로 보존한다. 이후 네트워크 단절에서도 보존한 결과를 다음 작업에 쓸 수 있어야 한다.
- 외부 작업 취소와 로컬 수집 실패는 다르다. 다시 다운로드할 수 있으면 재생성 없이 수집을 재개한다.
- live session은 위의 유한 작업에 억지로 넣지 않는다. 시작/구간 관측/종료/누락을 기록하고 보존 구간과 commands를 묶음으로 만들되 제어 실행은 별도 Adapter 후속 범위다.
- 후속 공급자 Adapter는 해당 제품/endpoint의 schema version을 고정해 추가한다. 동일 회사의 legacy·새 endpoint·웹 멤버십을 하나의 스키마로 합치지 않는다.

## 5. 작업별 판본 선택과 비교를 지원한다

현재 v1 snapshot은 전역 source 선택과 일치하는 자원별 판본 하나만 받는다. 기존 의미를 유지하고 **v2 snapshot과 명시적 작업 범위 선택**을 추가한다.

제안하는 workspace marker `input-selection`:

```text
scopeId, expectedScopeSelectionRevision, actor:user, reason
bindings[]: {bindingKey, role, resourceId, revisionId,
  mode: fixed | global | scoped, sourceScopeId?, sourceBindingKey?}
```

- marker payload에 자기 자신의 hash를 넣지 않는다. append 후 얻은 marker/hash와 binding의 의미 digest를 v2 snapshot의 `selectionDependencies`에 고정한다. 의존은 fixed, global(resourceId,marker), scoped(scopeId,bindingKey,marker)를 구별한다.
- 사용자의 실제 지시를 받았을 때만 기록한다. 호스트가 `actor:user`를 만들어 내지 않는다. 기존 source-selection과 품질 승인·세계관 정본 채택은 각각 유지한다.
- `scopeId`는 작업/회차/경로의 선택 범위다. 각 binding에 stable `bindingKey`를 준다. scoped 의존은 scope의 marker 전체가 달라졌다는 이유만으로 전부 stale로 만들지 않고 해당 binding의 판본·역할·의존 의미를 비교한다. 무관한 음악 선택 변경은 얼굴 입력 결과를 직접 stale로 만들지 않는다.
- global은 전역 source-selection, scoped는 해당 scope/binding의 선택을 따른다. fixed는 사용자 지시로 고정한 옛 판본 자체의 선택 drift를 면제한다. **그 판본의 상위 입력이 바뀌어 생기는 기존 전이 재검토는 fixed도 유지한다.** 현재 전역 기준과의 차이는 별도 정보다.
- profile/pipeline/policy 정의는 현재 선택·권한 계약을 계속 따른다. scope는 모든 실제 자원 ID를 포함하고 새 선택 marker로 위임·만료·철회를 우회하지 않는다.
- v2 `prepare`는 각 binding의 선택 근거와 정확 판본을 봉인한다. 비교 작업은 같은 Resource의 두 판본을 명시적 역할로 받을 수 있고, 입력 총량은 중복 없는 revision 집합과 정의 bytes를 합산한다. v1 중복 거절 규칙은 그대로다.
- `verifyInput`은 해당 checkpoint의 선택을 재현해 검사한다. 현재 선택과 다르다는 이유로 과거 snapshot을 손상으로 처리하지 않는다. 오래된 기준의 영향은 별도 `reviewRequired`로 계산한다.
- workspace-state fold·metadata 생성기를 새 marker/버전으로 확장한다. 신규 기록이 있는 저장소를 구버전이 읽지 못하면 명시 호환 오류와 업그레이드 안내를 내며 기록을 삭제하지 않는다.

**이유:** 8화가 1화의 얼굴 판본을 의도적으로 사용하거나, 같은 원고 수정 전후를 비교할 때 전역 원본 선택을 번갈아 바꾸지 않아도 되어야 한다. 원작의 전역 기준 변경과 특정 작업의 입력 선택을 분리한다.

## 6. 사용 맥락과 지식 묶음을 별도로 연결한다

`kind: resource-usage`, version 1 제안 필드:

```text
artifactRevisionId, subjectRef?, workRef?, nodeRef?, contextRevisionId
role, range?: {unit: seconds | frames | characters, start, end, timebase?}
```

- 인물/노드 참조는 기존 논리 ID와 판본/본문 hash를 보존한 bridge를 쓴다. `timeLabel/pathLabel`을 완전한 상태 계산 엔진으로 해석하지 않는다.
- `contextRevisionId`는 이번 회차·시점·경로에서 선택한 상태와 근거·미확인을 담는다. ‘8화의 젖은 외투’를 캐릭터 전역 기준으로 자동 반영하지 않는다.
- 사용/등장 관계와 실제 생성 입력 관계는 조회에서 구별한다. 전자는 맥락, 후자는 입력→결과 계보다.
- 정렬·자막의 range는 원본 텍스트와 timebase를 반드시 가리킨다. normalized text 문자 인덱스를 원문 단어 인덱스로 바꾸지 않는다. frame 값은 fps 없이 초로 추정하지 않는다.

정렬 자료의 typed JSON은 `audioRevisionId`, `textRevisionId`, `normalizedTextRevisionId?`, `normalizationMapRevisionId?`, `alignmentKind:character|word|speaker`, `timebase`, `segments[]`를 직접 결속한다. 입력 오디오/발화문 hash가 다른 정렬은 재사용할 수 없고 대응표를 관측하지 못하면 원문 인덱스 복원은 미확인으로 남긴다. 같은 bundle에 들어 있다는 사실만으로 호환 정렬로 판정하지 않는다.

지식 묶음 생성의 제안 입력은 작업 범위, 목적, 명시적 원본/사용 맥락, text/token·파일 manifest 예산이다. 출력은 선택한 정확 판본·근거·유지 기준·변경 의도·후보/검토 상태와 `missing/unknown/truncated`를 가진 JSON Resource다.

검색·추천 결과는 사용자 선택 후보로 제시하고 자동 정본으로 올리지 않는다. 요약을 쓰면 원문과 분리된 파생 Resource/Operation으로 만들고 근거를 유지한다. 큰 미디어는 본문/base64 대신 manifest와 필요한 프리뷰 참조를 반환한다. 실제 다음 생성은 선택된 지식 묶음과 실제 제공할 원본들을 다시 Input으로 고정한다.

## 7. MCP 표면과 조회를 작게 유지한다

모든 호출에는 기존처럼 `root` 절대경로가 필요하다. 추가 제안은 다음과 같다.

| 기존 도구 | 추가 op/인자 제안 | 결과 |
|---|---|---|
| `folio_resources` | `importBundle {manifest,pathMappings}`, `describe {revisionId}`, `materialize {revisionId,output}` | 정확한 판본·멤버·hash/크기, metadata 또는 새 출력 사본 |
| `folio_resources importFile` | 큰 파일의 stream 보관 | Resource v2. 기존 작은 파일 호출은 v1 유지 |
| `folio_inputs` | `select {scopeId,bindings,expectedScopeSelectionRevision,actor,reason}`, `prepare {version:2,scopeSelectionRevision,...기존 정의}` | 추가 전용 선택 marker와 고정 snapshot |
| `folio_operations` | `recordExecution {operationId,event,expectedExecutionHead}`, `inspect {operationId,cursor?,limit?}` | 검증된 실행 관측·부분 결과·다음 상태 |
| `folio_operations start` | `operationContractVersion:2, requestRevisionId` | 기존 request/입력/권한에 결속된 새 계약. v1/v2 경로 혼용 거절 |
| `folio_operations` | `submitGroup/reviewGroup/decideGroup` | v2 후보별 불변 출력 그룹·정확한 영수증·독립 결정 |
| `folio_resource_query` | `op:context {scopeId,purpose,budget,...}`, graph의 usage/contains 표시 | 지식 묶음 후보와 coverage, 구별된 관계 |

기존 `read`의 작은 파일 text/base64 응답은 유지한다. 큰 파일은 `describe` 후 `materialize`의 로컬 파일 사본을 사용하며 과대 base64 요청은 명시 오류다. output은 새 파일로 제한하고 기존 파일을 덮지 않는다. 원격 URL 다운로드를 core의 `read`에 섞지 않는다.

큰 데이터 조회는 페이지/cursor와 결과 예산을 갖는다. metadata checkpoint와 별개로 아직 발행되지 않은 실행 관측도 변하므로 실행 ledger head와 operation/result catalog digest를 coverage에 결속한다. metadata index는 파생 뷰이며 정본 기록을 대체하지 않는다.

## 8. 항상 유지할 구분

바이트 일치, 기술 형식 검사, 공급자 실행 보고, 창작 검토, 사용자 선택을 별도 표시한다. 공급자의 자동 approve는 리니베라의 품질 승인이 아니다. hard 차단·정확한 hash/영수증·추가 전용 기록·자기검토·soft 비자동수정은 설정이나 Adapter로 끌 수 없다.
