# 범용 원본·입력·결과·메타데이터

이 경로는 기존 novel/picturebook/source/asset/tracking 파일과 독립이다. 기존 자료를 자동 반입하지 않는다. UTF-8 text/plain, application/json, 정규 MIME을 선언한 opaque 파일, 미관측 외부 URI 참조와 metadata 조회를 지원한다. 인라인 미디어는 bytes 대신 canonical base64(상호 배타, 최대8MiB)로 등록하고 read는 base64/encoding을 반환한다. 큰 파일은 importFile로 보존하고 describe/materialize로 회수한다. text/JSON의 작은 read 계약은 그대로다. [생성 데이터·묶음·실행·후보별 승인 안내](production-data.md)와 선택 원본의 [로컬 text/image Vector 검색](embeddings.md)을 제공한다. 공통 판본·작업 그래프와 변경 영향 추적을 제공한다. CSV/PDF 내용 파싱, Wiki 생성, 자동 외부 관측은 제공하지 않는다. 모든 MCP 인자는 `root` 절대 경로와 `op`를 포함한다. 실제 사용자 지시 없이 host가 `actor:user` 결정이나 authority 진술을 만들면 안 된다. 로컬 caller 진술은 인간 인증/ACL이 아니다.

## MCP 순서와 정확한 인자

| 도구·op | root/op 외 인자 |
|---|---|
| folio_resources propose | resourceId, kind, parents? (기본 []), schemaRef?, owned:{bytes:UTF-8문자열,mediaType:text/plain 또는 application/json} 또는 owned:{base64:canonical문자열,mediaType:지원MIME}(상호 배타·8MiB) 또는 external:{uri,reportedRevision?} |
| folio_resources importFile | resourceId, kind, path:정규 절대경로, mediaType, parents?, schemaRef?, contentHash?; 링크 제외 단일 파일 최대2GiB. 승인·선택 자동 생성 없음 |
| folio_resources describe/materialize | revisionId, materialize에는 output:새 절대경로 추가. 큰 파일의 메타데이터 또는 새 파일 사본 |
| folio_resources importBundle | resourceId, manifest, pathMappings?, parents?, schemaRef?; 역할·상대경로·판본을 고정한 복수 파일 묶음 |
| folio_resources importAsset | assetId, expectedRev; 기존 관리 PNG/JPEG/WebP/GIF를 같은 ID로 반입. 동일 자산 판본 재시도는 같은 revision. 원본 자산 상태 불변 |
| folio_resources read | revisionId; `{revision,content}` 반환, external content=null; 후보도 읽을 수 있음 |
| folio_resources decideSource | revisionId, expectedSelectionRevision:null 또는 마지막 selectionRevision, action:{type:select 또는 deselect,actor:user,reason?}; deselect 이유 필수 |
| folio_inputs prepare | revisionIds, profileRevisionId, pipelineRevisionId, policyRevisionId, externalMode?:reject 또는 reference-only |
| folio_inputs verify | inputSnapshotId |
| folio_policy issue | grantId, policyRevisionId, profileRevisionId, pipelineRevisionId, actor:host, actions:[create-candidate 또는 publish], resourceIds, expiresAt:양의 정수, expectedCheckpoint, authority:{actor:user,attested:true} |
| folio_policy revoke | grantId, expectedCheckpoint, authority:{actor:user,attested:true} |
| folio_policy status | grantId; 현재 위임 또는 null |
| folio_operations start | inputSnapshotId, idempotencyKey, actor:user 또는 host, grantId? |
| folio_operations submit | operationId, requestId, inputSnapshotId, resultRevisionIds, reportedTrace?:JSON객체 |
| folio_operations review | operationId, outputHashes (출력 순서), findings:[{severity:hard 또는 soft 또는 info,message,...}], reviewer:user 또는 host; receiptId 반환 |
| folio_operations decide | operationId, receiptId, expectedCheckpoint, action:approve 또는 reject, actor:user 또는 host, grantId? |
| folio_resource_query refresh | checkpoint?; 지정 없으면 현재 상태. 완성 ProjectionManifest 반환 |
| folio_resource_query query | resourceId?, selector?, freshness? |
| folio_resource_query graph | resourceId?, direction?:upstream/downstream/both, depth?:0..100(기본20), limit?:1..5000(기본1000); nodes/edges/checkpoint/truncated/scope |

정의도 owned JSON 후보 등록 후 사용자 선택한다. profile은 `{version:1,scope:[resourceId],maxInputBytes:양의정수}`, pipeline은 `{version:1,steps:[{id,capability:transform 또는 analyze}]}`, policy는 `{version:1,mode?:Balanced 또는 Strict,scope:[resourceId],allowedActions:[create-candidate,publish,select-source,issue-grant,revoke-grant 중 필요한 것],expiresAt?,maxInputBytes?}`이다. 자료와 세 정의의 모든 봉인 bytes가 예산에 포함된다. 외부 참조 길이는 unknown이다. 과거 입력 verify 성공이 현재 host 권한을 의미하지 않는다. 위임은 정확한 세 정의 판본과 정의 hash, scope/action/만료/철회에 결속한다.

## Query와 최신성

`selector` 정확한 형태는 `{type:'current'}` (기본), `{type:'atRevision',revisionId}`, `{type:'atCheckpoint',checkpoint:{seq,hash}}`이다. 다른 필드·selector는 거부한다. freshness 기본은 `requireCurrent`, 다른 값은 `allowStale`다.

metadata generation은 `refresh`로 명시적으로 생성한다. current는 가장 최근 완성 generation, atRevision은 요청 판본이 선택 원본/승인 결과로 들어 있는 가장 최근 generation, atCheckpoint는 지정한 검증된 기록장 prefix와 정확히 같은 generation을 사용한다. 후보를 atRevision으로 요청해도 확정 조회에 나타나지 않는다. 해당 generation이 없으면 PROJECTION_NOT_CURRENT이며 refresh가 필요하다. atCheckpoint 조회는 그 prefix의 선택/발행과 일치한다. **freshness는 역사적 selector에서도 최신 workspace checkpoint와 비교한다.** 따라서 과거 checkpoint는 allowStale로 조회한다. 무관한 위임 marker 변경도 보수적으로 generation을 stale로 만든다.

반환은 `{entries,selector,checkpoint,currentCheckpoint,freshness,manifest,coverage,evidence}`다. checkpoint는 사용한 generation의 판본, currentCheckpoint는 응답 잠금 안에서 검증한 최신 판본이다. freshness는 current/stale/unknown이며 미관측 외부 원본은 최신 generation에서도 unknown이다. requireCurrent는 stale/unknown을 PROJECTION_NOT_CURRENT로 거부한다. allowStale은 손상된 bytes/영수증을 허용하지 않는다. coverage는 metadata 계층, 생성 범위 resourceIds, 반환 returnedRevisionIds, missing, unknown을 명시한다. 자원 미선택/미승인은 entries=[]와 missing 사유로 반환한다.

source entry는 ResourceRevision에 role:source, sourceCheckpoint, selectionRevision을 더한다. output entry는 `{revisionId,resourceId,contentHash,mediaType,role:output,operationId,requestId,inputSnapshotId,receiptId,publicationCheckpoint,selfReview:true,findings,inputRefs,inputCheckpoint,reviewRequired,reviewReasons}`다. inputRefs는 봉인한 자료의 판본/hash/관측 상태다. reviewReasons는 입력 선택 marker가 지금 바뀐 자원의 resourceId/inputRevisionId/inputSelectionRevision/currentRevisionId/reason을 명시한다. **generation이 current여도 A 입력 결과는 A→B 뒤 reviewRequired=true다.** 과거 generation 조회에서도 reviewRequired는 응답의 currentCheckpoint 선택과 비교한다. manifest.outputHashes는 저장된 generation entries의 hash이며, 반환 entries의 현재 reviewRequired/reviewReasons 표시는 현재 선택에서 다시 계산한 값이다. refresh는 결과를 자동 수정하거나 승인하지 않는다.

evidence는 반환 entry별 정확한 revisionId/contentHash와 sourceCheckpoint/selectionRevision 또는 receiptId/publicationCheckpoint/inputSnapshotId/inputCheckpoint/inputRefs를 포함한다. source 선택, 요청, 실제 결과 bytes, input, review, intent, decision, 최종 marker를 다시 검증한다. candidate/prepared/intent/reject는 accepted metadata에 나타나지 않는다. raw read의 후보 접근과 다르다.

## 저장 계약

`.folio/projections/metadata/<generation hex>.json`은 추가 전용 `{manifest,entries}`다. generationId는 generationId 필드를 뺀 `{manifest,entries}`의 canonical JSON sha256이다. manifest는 `{version:1,projectionId:metadata,kind:metadata,generationId,inputManifestId,workspaceCheckpoint,generatorRevision:folio-metadata-v3,definitionRevision:null,parametersHash,status:complete,coverage,outputHashes}`다. inputManifestId는 검증된 prefix markers hash, parametersHash는 빈 설정 hash, outputHashes는 canonical entries hash 목록이다. builtAt은 생성 identity의 재현성을 위해 포함하지 않는다. 미완성 generation 공개와 mutable HEAD는 없으며 기존 generation을 지우지 않는다. source/result/grant만 workspace marker를 추가하고 refresh는 checkpoint를 바꾸지 않는다.

v3 generation에는 checkpoint에 결속된 선택·승인 entry와 직접 영향만 저장한다. 전이 영향은 조회할 때 검증된 모든 제출 Operation에서 계산한다. 제출 자체에는 workspace marker가 없으므로, 같은 checkpoint에서 뒤늦게 추가된 생산 이력 때문에 과거 generation이 손상으로 오판되지 않게 한다. `freshness`는 선택/발행 checkpoint의 최신성이다. 반환하는 review 상태는 현재 검증 가능한 모든 제출 이력을 보수적으로 반영한다. 요청의 입력 연결과 host-reported 제출은 실제 모델 내부 사용의 인증과 구분한다.

현재 단일 로컬 사용자/기록자 슬라이스이며 fsync·정전 내구성, 원격 접근 권한, 제공자 비용 검증을 보장하지 않는다. 보고 trace는 host-reported이며 비공개 모델 추론을 관측했다고 주장하지 않는다.

## 공통 그래프·전이 영향·모션 확장

그래프는 공통 revision과 Operation을 검증해 input/output/revision 연결로 돌려준다. 미선택 후보·제출·거절도 포함하며, 선택 여부와 품질 승인 상태를 구분한다. 제한으로 잘린 관계는 truncated:true다. reviewRequired는 정확한 판본 의존과 미승인 중간 결과를 지나 후속 결과까지 전파된다. 프로필·파이프라인·정책 정의도 공통 입력 연결에 포함한다. 원본 변경은 결과 bytes나 영수증을 자동 교체하지 않는다. 메타데이터 v1/v2는 기존 계산 방식으로 검증해 allowStale로 읽을 수 있으나 current를 위해 v3 refresh가 필요하다.

[모션 확장](motion.md)은 이 자원·입력·작업 계약으로 컷, 타임라인, 영상을 만든다. 포즈는 다른 파이프라인에서도 같은 ID/판본으로 재사용한다. 로컬 뷰어와 정적 내보내기의 Connections에서 공통 그래프를 확인할 수 있다.
