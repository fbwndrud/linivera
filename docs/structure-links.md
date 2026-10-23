# 보관한 구조를 다음 작업에 연결하기

[Chroma 지원표](chroma-support.md)에서 도구별 자동 해석·수동 연결·파일 보관을 확인한다.
[편집·확장 의존성](editing-dependencies.md)은 XMEML/OTIO와 커스텀 패키지·3D 확장의 상세 계약이다.
`folio_resources`의 다음 두 동작은 기존 Resource/Input/Operation 경로를 사용한다.

1. `importFile` 또는 `propose`로 원본과 필요한 소재 파일을 보관한다.
2. `inspectStructure {revisionId,format}`으로 `structure.units`, `links`, `references`,
   `coverage.unknown`을 읽는다. reference의 `key`는 원본 안의 연결 위치다.
3. reference의 `hint`를 확인하고, 실제 보관한 파일 판본을 명시해 후보를 만든다.

```json
{
  "op": "normalizeStructure",
  "resourceId": "scene-structure",
  "sourceRevisionId": "sha256:<retained-source-revision>",
  "format": "comfy-api",
  "structureBindings": [
    {"referenceKey": "/1/inputs/image", "revisionId": "sha256:<retained-image-revision>"}
  ]
}
```

4. 반환된 `structure-map`과 원본·연결 파일을 사용자 의도에 따라 `decideSource` 또는
   `folio_inputs select`로 선택한다. `folio_inputs prepare`에 map을 넣으면 이 의존성도
   함께 봉인된다. 필수 reference 미연결, 미선택 판본, scope 초과, 용량 초과는 차단된다.
5. 다음 작업은 기존 `folio_operations start/submit/review/decide`를 사용한다.
   실제 입력·출력 파생 관계와 구조상의 링크는 서로 다른 관계로 조회된다.

map은 `{version:1,sourceRevisionId,sourceContentHash,format,parserVersion,structure,bindings,unresolvedReferenceKeys}`다.
커스텀 선언을 사용하면 `dependencyManifestRevisionId`도 포함하며 다음 Input에 함께 고정된다.
`unresolvedReferenceKeys`는 선택적 슬롯을 포함한 모든 미연결 위치를 표시한다.
직접 `propose`한 map도 원본에서 재계산해 일치해야 한다. 기존 parserVersion의 해석은
과거 입력 검증을 위해 유지한다. 구조 반입은 생성 실행·선택·승인을 대신하지 않는다.
조회 그래프의 `Structure source`, `Linked structure file`은 실제 원본·소재 판본을 가리킨다.
원본 선택 변경은 기존 후속 Operation 결과를 전이적으로 재검토 대상으로 표시한다.

| format | 해석 범위 | 연결할 자료 / 남은 의미 |
|---|---|---|
| comfy-api | keyed nodes, class_type, inputs의 node/slot 연결 | 기본 loader 파일 슬롯. v2는 명시적 dependency manifest의 커스텀 패키지/파일 슬롯도 연결 |
| comfy-ui | nodes, links의 노드/슬롯 연결 | v2는 cnr_id/ver·선언 widget 위치·기본 loader의 위치 미정 필수 슬롯을 연결 |
| martini-run | run/actions/items, bins·variables, outputAssetId, replacesItemId, revision.inputRefs | asset ID는 실제 파일로 연결. 외부 이전 take는 해당 기록 파일로 연결. savedWorkflow 정의는 선택적 연결 |
| gltf / glb | glTF 2 기본 객체 + v2의 압축/대체 텍스처/재질/instancing 의존성 | 외부 URI는 실제 파일에 연결. data URI·GLB BIN은 원본에 포함. codec·렌더링 검증은 unknown |
| srt | UTF-8 SubRip cue의 순서·초 단위 시작/끝·문구 | `media` key로 음원/영상 선택적 연결. 오디오 정렬·편집 트랙·스타일 해석은 별도 |
| xmeml | XMEML 5 sequence·트랙·클립·파일·전환·효과 관측 | 미디어 파일 ID/URI를 판본에 연결. 편집기 효과 실행·복원은 별도 |
| otio | OTIO JSON 트랙·클립·gap·transition과 원본/parent 시간 | 미디어 reference를 실제 파일로 연결. retime/visible range 평탄화는 별도 |

JSON/SRT 구조 원본은 6MiB까지 해석한다. GLB는 파일당 2GiB 범위 안에서 전체 hash를
스트림 검증하고 6MiB 이하 JSON chunk만 메모리에 읽는다. 구조는 최대 4,096 units,
8,192 links, 4,096 reference slots이며 초과 시 부분 결과를 완전한 것으로 반환하지 않는다.
파서가 모르는 의미는 원본 바이트와 `coverage.unknown`에 남는다. `required`는 발견한
슬롯에 대한 조건이며, 미지원 형식 내부의 숨은 의존성이 없다는 보장은 아니다.

XMEML/OTIO 이외의 전용 편집 형식·압축 프로젝트·FBX/OBJ/splat·게임 DB/배포 복원은 현재 수동
자료 묶음과 관측 기록을 사용한다. 별도 파서가 필요한 다음 우선순위다. 파일 보관은
손실 없이 다음 작업을 준비하는 기반이며 편집기나 게임 실행 환경 복원을 보장하지 않는다.

실제 stdio·재시작·다음 작업·원본 교체·과거 Input 검증은
`node examples/structure-continuity.js`로 합성 데이터만 사용해 확인할 수 있다.
