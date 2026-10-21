# 회차별 선택과 다음 작업으로 이어 쓰기

같은 얼굴 자산의 예전 판본을 8화에 고정하고, 9화에서는 새 판본을 사용할 수 있다. 전역 원본 선택, 회차의 입력 선택, 결과 품질 승인은 각각 별도의 기록이다. [생성 데이터 관리](production-data.md)의 Resource·Input·Operation·실행·검토 구조를 그대로 사용한다.

## 실행으로 확인하기

```sh
node examples/scoped-continuity.js
```

지원 Node 버전과 FFmpeg가 필요하다. 합성 PNG/WAV만 사용하며 외부 모델을 호출하지 않는다. 실제 stdio MCP에서 다음 순서를 검증하고 임시 자료를 정리한다.

1. 같은 Resource의 두 얼굴 판본을 각각 8화 고정 선택과 9화 전역 기준 선택으로 유지한다.
2. 호스트를 종료하고 새 호스트에서 8화의 얼굴·목소리·해당 경로의 외투 상태와 미확인을 복구한다.
3. 예산에 맞는 지식 묶음 후보를 읽고 별도 Resource로 보존한다. 사용자 지시에 따라 다음 입력으로 선택한다.
4. 이전 선택·유지할 소재·수정 지침을 iteration으로 봉인하고 실제 제공 자료를 새 작업에 전달한다.
5. 회수·검토한 수정 후보를 v2 입력으로 기존 모션 샷→타임라인→음성 포함 영상에 사용한다.
6. 8화의 이전 선택을 복원해도 9화는 바뀌지 않으며, 과거 snapshot도 검증된다.
7. 최초 디자인 원본을 바꾸면 고정 판본의 생성 계보를 통해 수정 후보와 후속 영상까지 재검토 필요가 전파된다.

예제의 모든 선택·승인은 폐기되는 합성 프로젝트의 사용자 결정이다. 다른 작품에 적용할 승인 절차가 아니다.

## 회차별 입력 선택

`folio_inputs getSelection {scopeId,checkpoint?}`으로 현재 또는 특정 기록 지점의 선택을 읽는다. 없는 scope는 null이다. 선택을 변경할 때는 최신 `scopeSelectionRevision`을 CAS 인자로 사용한다. 과거 선택 복원도 옛 bindings를 읽은 뒤 **현재 marker를 expected로** 새 사용자 선택을 기록한다. 기록장을 되돌리거나 덮어쓰지 않는다.

```json
{
  "op": "select",
  "root": "/absolute/work",
  "scopeId": "episode-8",
  "expectedScopeSelectionRevision": null,
  "actor": "user",
  "reason": "Reuse episode-one face",
  "profileRevisionId": "sha256:…",
  "pipelineRevisionId": "sha256:…",
  "policyRevisionId": "sha256:…",
  "bindings": [
    {"bindingKey": "face", "role": "identity", "resourceId": "hero", "revisionId": "sha256:…", "mode": "fixed"}
  ]
}
```

scopeId와 bindingKey는 안전한 ID다. 경로/회차 설명은 별도의 맥락에 둔다. 실제 사용자 지시 없이 호스트가 `actor:user`를 만들어 내지 않는다. policy의 `select-source` 권한, 현재 정의 선택, 만료와 scope도 검사한다.

| mode | 입력 선택과 직접 변경 영향 |
|---|---|
| fixed | 이 정확한 판본을 선택한다. 이후 전역 선택 변경만으로 직접 stale이 되지 않는다. 해당 판본을 만든 **상위 입력의 변경 영향은 유지**한다. |
| global | 현재 전역 원본 선택과 정확히 일치해야 한다. 전역 선택이 바뀌면 해당 입력 결과의 재검토가 필요하다. |
| scoped | 이 회차의 binding을 따른다. `sourceScopeId/sourceBindingKey`를 주면 다른 scope의 정확한 binding을 따른다. 무관한 binding 변경은 직접 재검토 이유가 아니다. |

다른 scope를 따를 때 원본 binding이 fixed여도, 그 scope의 binding이 다른 판본으로 바뀌면 자식의 scoped 의존은 재검토 대상이다. 동일 Resource의 두 판본은 서로 다른 bindingKey·역할로 비교할 수 있다.

`folio_inputs prepare {version:2,scopeId,scopeSelectionRevision,bindingKeys?,profileRevisionId,pipelineRevisionId,policyRevisionId,externalMode?}`로 고정한다. revisionIds는 선택된 bindings에서 계산한다. bindingKeys를 생략하면 모두 포함한다.

v2는 실제 내부 참조를 펼쳐 내용·scope·선택 근거·예산을 검사한다. 명시적 binding의 고정 근거는 내부 참조에도 재사용한다. 그 밖의 내부 원본은 정확한 전역 사용자 선택이 있어야 한다. bytes는 동일 판본을 중복 계산하지 않는다. `verify`는 봉인 당시 checkpoint에서 재생한다. 모션의 `restrictInput`도 이 고정 근거를 유지한다.

기존 v1의 선택 의미와 과거 hash는 유지한다. context/iteration/audio-alignment/normalization-map/generation-request를 새 v1 입력으로 준비하면 내부 참조 전체를 검사하고 `referenceClosureVersion:1`을 봉인한다. 옛 snapshot을 읽는 것과 새 작업에 다시 사용하는 권한은 구별한다. 이 typed 참조가 들어간 오래된 v1은 새 작업 시작 전에 fresh prepare 또는 v2 prepare를 사용한다. 이미 시작한 작업의 재개는 유지한다.

## 수정 의도 보존

kind `iteration`의 owned JSON:

```json
{
  "version": 1,
  "scopeId": "episode-8",
  "baseRevisionIds": ["sha256:…"],
  "preserveRefs": ["sha256:…"],
  "changeRequestRevisionId": "sha256:…",
  "previousSelection": {"scopeId": "episode-8", "scopeSelectionRevision": "sha256:…"}
}
```

수정 지침은 실제 text/plain Resource여야 한다. previousSelection을 명시하면 그 scope의 실제 사용자 선택 기록과 base 판본의 포함을 검사한다. iteration은 자동 수정이나 결과 승인을 수행하지 않는다. propose→별도 입력 선택→prepare→새 Operation 순서를 따른다.

## 사용 맥락과 지식 묶음

kind `usage-context`는 `{version:1,scopeId,pathId?,timeLabel?,states}`를 담는다. 상태 항목은 `role`, `artifactRevisionId?`, `evidenceRevisionIds:[]`, `status:selected|observed|unknown`, `value?`, `unknown?`, `nodeRef?`, `subjectRef?`다. unknown에는 이유를 남긴다. 관측이나 선택을 세계관의 확정 진실로 바꾸지 않는다.

`folio_resource_query context` 인자:

```json
{
  "op": "context",
  "root": "/absolute/work",
  "scopeId": "episode-8",
  "purpose": "Prepare the next shot",
  "pathId": "path-main",
  "budget": {"maxTextBytes": 4096, "maxItems": 12, "maxManifestBytes": 32768}
}
```

contextRevisionId를 생략하면 scope의 선택된 context binding에서 찾는다. 경로·시간을 명시하면 다른 상태를 섞지 않는다. revisionIds는 별도 자료 후보를 추가할 때 사용하며 관측된 회차 상태로 승격하지 않는다. 반환값은 `{scopeId,purpose,package,coverage}`이며 query만으로 Resource·사용자 선택·품질 승인을 만들지 않는다.

package를 kind `context-package`로 propose하고 명시적으로 다음 입력에 선택한다. 실제 제공된 items와 referenceRevisionIds만 생성 입력 closure가 된다. text excerpt를 제공해도 다음 Input의 예산은 해당 원본 판본 전체 크기를 계산한다. 미디어는 파일 metadata와 참조를 제공하며 전체 base64를 문맥에 넣지 않는다.

coverage의 missing/unknown/truncated를 확인한다. item/text/manifest 예산으로 제외한 항목은 누락 근거로 남기며 실제 제공한 원본으로 표시하지 않는다. sourceContextRevisionId는 맥락 출처이고 실제 입력 참조와 구분한다. package 반입은 원문·hash·원래 상태·excerpt·tracking 근거를 재검증한다. 요약을 만들려면 별도의 파생 Resource/Operation과 근거를 보존한다.

kind `resource-usage`는 실제 artifact/context 판본과 역할·구간을 연결한다. 초/문자/프레임 단위·원점을 명시하고 프레임에는 fps가 필요하다. 기존 원고/추적 대상은 node ID·body hash·보존 Resource의 판본으로 bridge를 검증한다. 현재 원고가 달라졌거나 근거가 없으면 unknown으로 남기며, 과거 package의 보존된 검토 근거를 새 원고의 현재 관측이라고 표시하지 않는다. 과거 입력과 package는 보존 본문·불변 추적 batch·영수증으로 검사하므로 현재 원고의 편집 오류에 의존하지 않는다. 새 맥락 반입에는 현재 원고와의 bridge 검증을 유지한다.

audio-alignment는 정확한 audioRevisionId/textRevisionId, alignmentKind와 timebase를 가진다. normalizedTextRevisionId/normalizationMapRevisionId를 제공하면 두 텍스트와 Unicode code point 인덱스를 직접 검사한다. 대응표를 관측하지 못하면 unknown이다. 다른 음원·텍스트 판본의 정렬을 붙이거나 normalized 문자 인덱스를 원문 단어 인덱스로 추정하지 않는다.

## 추가 데이터 유형

| Adapter | 지원 범위 | 확인 근거 |
|---|---|---|
| Meshy | `/openapi/v2/text-to-3d` preview, 지정 model format과 texture 회수. refine는 별도 Operation이며 자동 호출하지 않는다. | [공식 문서](https://docs.meshy.ai/en/api/text-to-3d) |
| Rodin export | 사용자 제공 모델·재질 파일과 native 결과 목록 보존. task UUID와 subscription key를 구별한다. | [다운로드 계약](https://docs.hyper3d.ai/en/api-specification/download-results) |
| Floyo export | 편집 workflow와 실행 graph를 별도 파일·역할로 보존한다. | [공식 안내](https://docs.floyo.ai/floyo-api-quick-start) |
| Martini export | workflow source/run record/부분 파일과 item 교체·공급자 verdict를 관측 자료로 보존한다. | [공식 안내](https://www.martini.film/docs/workflows) |
| Game export | source/material/build를 보존하고 외부 DB·배포 플랫폼 상태는 미회수로 표시한다. | 로컬 capture 계약 |

확인일은 2026-10-22다. Rodin/Floyo/Martini/game은 **리니베라 자체 `linivera-manual-export-v1` 포착 계약**이다. 공급자의 공식 실행 스키마나 API 전체 구현이라는 뜻이 아니다. 파일이 모두 있어도 외부 의존/편집 재개/프로젝트 복원은 별개이며 restorability는 기본 unknown이다.

Meshy transport는 `submit(endpoint,input)`, `get(endpoint,taskId)`, `download(url)`을 주입한다. download는 작은 Uint8Array 또는 `{path,contentHash?}`를 반환한다. 8MiB를 넘는 파일은 로컬 파일 경로를 전달해 스트리밍으로 반입한다. 실제 credential·유료 호출은 호출 호스트가 별도로 관리한다.

수동 export의 prepare 두 번째 인자는 `{files:[{artifactKey,role,relativePath,mediaType,bytes|path,contentHash?,required?}],native?,unavailable?}`다. 원래 생성 입력은 unknown으로 남는다. 경로 파일도 prepare에서 실제 bytes를 스트리밍 hash로 고정하며 제공한 contentHash와 비교한다. 같은 captureId에 다른 내용은 제출할 수 없고, prepare 후 파일이 바뀌면 반입을 거절한다. JSON inline export는 자격 키를 가리고 sourceContentHash와 omittedPaths를 남긴다. 경로 JSON은 원본 파일 bytes를 보존한다. 실제 파일과 최종 bundle manifest는 같은 후보에 결속한다.

불완전 bundle은 관측 Resource로 보존하고 최종 output slot으로 봉인하지 않는다. 실제 부분 파일은 관측 출력으로 남는다. 같은 job의 나머지 파일을 회수하면 정확한 파일 판본으로 완전 manifest를 만들고 그 그룹만 제출한다. 다수 native 관측은 한 정제된 batch Resource로 연결해 첫 관측만 남는 것을 방지한다.

## 세션 관측

`folio_operations recordSession {sessionId,expectedSessionHead,event}`와 `inspectSession {sessionId,sessionHead?}`는 로컬 관측 기록이다. 외부 live 세션을 제어하거나 명령을 실행하지 않는다.

- 최초 event: `{type:"opened",version:1,timebase:{unit:"seconds",origin:0}}`.
- command: 순서·시각·보존된 명령 payload revisionId를 기록한다. 빠진 순서는 command-gap에 이유를 명시한다.
- media: trackId/start/end/revisionId/contentHash를 기록하고 실제 파일을 재검증한다.
- gap/observation-window: 관측 구간과 누락을 구별한다. 동일 track의 파일과 누락 구간이 서로 모순되면 거절한다.

정확한 ledger prefix를 kind `session-record` Resource로 보존하면 명령·미디어와 그래프에서 연결된다. 누락이 없다는 주장이나 완전 복원을 자동 확정하지 않는다.

## 하나의 그래프와 확인 범위

Resource history는 그림·음원·3D·코드·workflow·맥락·묶음을 자료 유형과 회차 선택으로 걸러 볼 수 있다. 입력/출력은 작업 파생 관계이고 contains/usage/context-evidence는 파일 포함·사용·근거 관계다. 영어·한국어 전환과 정적 viewer에서도 같은 구분을 유지한다.

`folio_resource_query graph`는 기본 전체 내용 hash 검증을 유지한다. resourceId/direction/depth/limit으로 조회하며 nextCursor로 다음 페이지를 읽는다. scope·기록 지점이 달라지면 cursor를 재사용하지 않는다. boundaryNodes/boundaryEdges가 페이지를 가로지르는 관계를 보존한다. boundaryLimit/edgeLimit을 초과한 연결은 omittedEdgeCount와 truncated에 드러난다.

`indexGraph`는 전체 검증 후 파생 탐색 index의 generationId를 반환한다. graph에 generationId를 **명시**하면 관련 판본을 먼저 찾고 반환 파일·관계를 원본에서 재검증한다. catalog가 달라졌으면 stale로 거절한다. 이 경로는 `returned-scope-verified`이며 전체 탐색의 완전성·내용 검사·전이 재검토 범위를 보증하지 않는다. 해당 coverage는 unknown이고 승인 상태를 index에서 가져오지 않는다. 전체 확인이 필요하면 generationId 없는 기본 graph를 사용한다. 파생 index는 정본이나 승인 기록을 대체하지 않는다.
