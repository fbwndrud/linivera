# 공통 자산 순환과 모션 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 공통 Resource ID/판본의 등록·다른 제작 흐름 재사용·전이 변경 영향과 그래프 조회를 먼저 완성하고, 그 계약을 사용하는 로컬 컷아웃 모션 제작 팩을 연결한다.

**Architecture:** 기존 Resource/Input/Operation/Publication을 정본으로 유지한다. 그래프는 검증된 불변 기록의 파생 뷰이고, 변화 영향은 정확한 판본 의존을 따른다. 모션 팩은 선택한 JSON 프로젝트와 이미지/오디오 입력을 해석하고 외부 로컬 FFmpeg Adapter가 실행하며, 결과 타임라인/영상은 공통 후보로 등록·제출한다.

**Tech Stack:** 기존 ESM JavaScript, Node 24, node:test, MCP stdio, 기존 React viewer, 선택적 로컬 FFmpeg/ffprobe.

**Spec:** docs/plans/2026-10-21-creative-resource-lineage.md 및 docs/plans/2026-10-21-motion-production-extension.md. 사용자가 해당 구조의 구현과 공통 자산→모션 순서를 명시 승인했다.

## Global Constraints

- 모듈 하나에 책임 하나. 파일이 300줄을 넘으면 나눈다.
- core/는 모델·네트워크를 부르지 않는다.
- 잠금 규칙(hash 일치, 영수증, hard 차단, 추가만 되는 기록장, 자기검토 표기, soft 비자동수정)은 설정으로 끌 수 없어야 한다.
- 테스트 데이터는 합성 fixture만. 실제 작품·생성 결과물을 커밋하지 않는다.
- 소통은 한국어, 코드 식별자는 영어. 사용자 화면·상태·작업 이름은 docs/user-language.md의 쉬운 영어를 따른다.
- 원본 cwd/다른 worktree의 미커밋 변경, ai-content-studio, vibelore, 승인 작품을 변경하지 않는다.
- 외부 유료 생성·크레딧·로그인·업로드·게시·법적 확인을 수행하지 않는다.
- Resource inline 미디어 한도 8MiB를 유지한다. 큰 파일을 경로 메모만으로 검증 완료 처리하지 않는다.

## Review Focus

- 손상 bytes/심볼릭 링크/잘못된 결과 결속은 빈 그래프가 아니라 오류여야 한다(Task 1/2).
- 여러 생산 작업·순환·페이지 제한에서 무한 탐색/조용한 누락이 없어야 한다(Task 1).
- 입력 선택과 품질 승인·정본 채택을 섞지 않고 후보/거절 상태를 보존한다(Task 1/3).
- 같은 idempotencyKey 재개는 같은 작업/입력/출력을 보존하고 다른 설정 결과로 바꾸지 않는다(Task 3/4).
- 선택 음성/음악 없음은 허용하되 필수 누락·실제 관찰 불가는 완료로 표시하지 않는다(Task 3/4).

## Task 1: 공통 파생 그래프와 전이 변경 영향

**Files:** core/resources/catalog.js; core/query/resource-graph.js; core/projections/review-impact.js; core/projections/metadata.js; server/tools/resource-query.js; resource-contracts.js; output-contracts.js; test/resources/lineage.test.js; test/support/lineage.js.
**Interfaces:** listResourceRevisions(root) -> ResourceRevision[]; queryResourceGraph(root,{resourceId?,direction?:upstream|downstream|both,depth?:integer,limit?:integer}) -> {nodes,edges,checkpoint,truncated}; applyReviewImpact(entries) -> entries with reviewRequired/reviewReasons. Graph node IDs use revision identity and operation identity; edges input/output/revision name actual pinned/submitted relationships.
- [x] RED: hero→pose→shot 的 실제 임시 Resource/Operation fixture에서 hero 선택 변경 뒤 pose/shot 모두 reviewRequired, 기존 판본 inputRefs 유지, 재검토/원고 재작성 없음.
- [x] RED: 같은 pose 판본을 두 워크플로우가 재사용해 upstream/downstream 모두 조회, 미선택 후보와 거절 결과 구별, depth/limit 명시적 truncated.
- [x] GREEN: 검증된 revision catalog·operation/result/receipt·publication 입력으로 그래프를 만들고 정확 revision의 전이 영향 계산. 전체 리소스 그래프를 새 정본으로 저장하지 않음.
- [x] Verify: node --test test/resources/lineage.test.js test/operations/publication.test.js test/resources/input-snapshots.test.js 및 npm test.
- [x] Commit: feat(resources): connect lineage graph and transitive review impact.

## Task 2: 파일 등록·기존 관리 자산의 안정적 재사용

**Files:** core/resources/intake.js; core/resources/asset-import.js; server/tools/resources.js; resource-contracts.js; test/resources/intake.test.js; test/server/resources-e2e.test.js.
**Interfaces:** importResourceFile(root,{resourceId,kind,path,mediaType,parents?,schemaRef?,contentHash?}) -> ResourceRevision; importManagedAsset(root,{assetId,expectedRev}) -> ResourceRevision with same logical asset ID and stable source schemaRef. Existing ID collision with unrelated Resource rejects.
- [x] RED: 정확 hash 파일 등록·동일 파일/같은 ID 재시도 동일 revision, source 선택 자동 생성 없음; 링크/상대 경로/8MiB 초과/hash 불일치 거부.
- [x] RED: 기존 approved managed PNG 자산 인계는 같은 assetId를 보존하고 원본 자산/승인/사용처 불변. 오래된 expectedRev/Resource ID 충돌 거부.
- [x] GREEN: 안전한 단일 파일 읽기와 기존 Resource propose 재사용. 새 자산 저장소/정본/승인 경로 금지.
- [x] Verify: 새 집중 테스트와 실제 stdio resources import 호출 및 npm test.
- [x] Commit: feat(resources): import local and managed assets with stable identities.

## Task 3: 공통 Operation 위의 모션 팩·로컬 렌더

**Files:** packs/motion/schema.js, plan.js, index.js; core/motion/operation.js; adapters/motion/ffmpeg.js, filters.js; server/tools/motion.js; definitions.js; handlers.js; resource-contracts.js; output-contracts.js; test/motion/plan.test.js, render.test.js.
**Interfaces:** planMotion(root,{inputSnapshotId}) -> {status:ready|needs_assets,specRevisionId,plan,missing}; renderMotion(root,{inputSnapshotId,idempotencyKey,actor,grantId?},{render?}) -> {status:submitted|needs_assets,operationIds?,resultRevisionIds?,missing?}; assembleMotion with the same call shape accepts a selected compiled timeline plus selected shots/audio and returns one submitted final video. Each shot has its own operation; compilation produces a separate timeline Resource. Outputs remain candidates until existing review/selection calls. Exactly one selected kind motion-project Resource in snapshot; its version:1 JSON pins outputResourceId, width/height/fps, shots:[{durationSeconds,backgroundColor,layers:[{revisionId,x,y,width,dx?,dy?,bob?}]}], audio:[{role:voice|music|sfx,revisionId:null|string,required:boolean,startSeconds?,gain?}]. Limits: width/height 16..1920, fps1..60, total1..120seconds, shots1..20, layers<=8/shot; finite numeric values; file references only exact pinned input revisions.
- [x] RED: two pose shots compile exact input IDs; optional audio missing allowed; required missing returns needs_assets; unpinned/invalid types/NaN/time out of bounds reject.
- [x] GREEN: ordinary JSON Resource carries project; compiled timeline and output MP4 are separate common Resource candidates linked by existing Operation. Never auto approve/select.
- [x] RED: real local FFmpeg test with synthesized tiny PNG/WAV renders pose/position change and optional audio; ffprobe confirms duration/dimensions/audio; result hashes registered.
- [x] GREEN: host-side Adapter only, shell:false argument arrays, no model/network; scratch cleared; output stays within existing 8MiB contract. Already submitted operation returns same result without new render; interrupted pre-submit stages are recoverable or remain explicitly pending.
- [x] Verify: node --test test/motion/*.test.js and npm test. FFmpeg absence is explicit unavailable, not fake render.
- [x] Commit: feat(motion): render cutout scenes through shared resource operations.

## Task 4: 公開 MCP·같은 그래프 화면·합성 수용 예제

**Files:** core/view/resource-graph.js; core/view/index.js; server/view/api.js; viewer/src/screens/Graph.jsx; viewer/src/components/ResourceLineage.jsx; viewer/src/lib/workspace.js; examples/motion.js; docs/motion.md; docs/resources.md; skill/folio/references/motion.md; skill/folio/SKILL.md; test/server/motion-e2e.test.js; test/view/resource-graph.test.js.
**Interfaces:** folio_resource_query op graph delegates queryResourceGraph; folio_resources op importFile/importAsset; folio_motion op plan/render uses Task3 signatures; GET /api/resource-graph returns same verified graph. Existing character/manuscript graph remains usable and common resource-only workspace can inspect lineage.
- [x] RED: actual stdio source registration→pose reuse→motion render→new video/timeline IDs→same graph query→upstream source change marks descendants. Second consumer is a narration project using the identical pose revision; shots/timeline are selected with synthetic decisions before final assembly.
- [x] GREEN: one common graph view, no motion-private IDs/store; UI distinguishes source/candidate/submitted/approved/rejected and truncation; renderer technical result is not creative approval.
- [x] GREEN: executable synthetic example imports existing pose unchanged into a second workflow, emits verification summary and cleans all synthetic outputs. Host guide describes actual MCP args, pending/review and limits.
- [x] Verify: npm run check; npm --prefix viewer test; npm --prefix viewer run build; node examples/motion.js; git diff --check; every changed file<=300 lines.
- [x] Commit: feat(motion): expose shared lineage workflow and document host execution.

## Execution and review

- Native execution in this session; task-start/task-done and progress ledger preserve TDD evidence and rulings.
- User approval covers supplied designs and implementation order; no repeated design permission requested. Routine implementation details are implementer calls.
- Fresh reviewer checks complete diff and concrete failure cases; critical/important fixes receive RED→GREEN and full verification. Same host role separation is not independent creative perception.
- Worktree is managed/detached from codex/production-ready e7516d1. Preserve it for review; no merge/push/publication without separate authorization.

## 실행 중 구체화

- 컷 선택 뒤 compile 단계를 분리했다. 타임라인 자체도 실제 컷 판본을 공통 Input으로 고정해야 하므로 render→컷 검토/선택→compile→타임라인 검토/선택→assemble 순서다. JSON 안의 컷 이름만으로 계보를 대신하지 않는다.
- 다른 제작 흐름은 별도 낭독 pipeline 정의와 프로젝트를 사용한다. 동일 포즈 revision을 공유하고 음성은 합성 fixture로만 검증한다.

## 최종 검증과 검토 기록 (2026-10-21)

- `npm run check`: lint/타입 검사 성공, 전체 1,731/1,731 통과 (수정 후).
- `npm --prefix viewer test`: 38/38 통과. `npm --prefix viewer run build`: 성공; 기존 큰 Graph chunk 경고는 유지.
- `node examples/motion.js`: actual MCP stdio, 두 pipeline의 같은 pose revision 재사용, 샷/타임라인/영상 등록, 음성, 전이 영향 확인. 합성 결과는 자동 삭제.
- 실제 로컬 렌더의 frame hash 변화·ffprobe 길이/크기/오디오와 FFmpeg 부재·재시도·권한 철회·잘못된 재개 결과·DASH 외부 참조를 검증했다.
- 그래프의 미승인 중간 결과·복수 생산자·순환·truncation·bytes 손상·심볼릭 링크, v1/v2 역사적 캐시 읽기와 v3 refresh/늦은 제출을 검증했다.
- 첫 전체 통합 실행은 1,723/1,725였다. 실패 두 건은 기존 22-tool 개수 기대값이어서 23으로 갱신했다. 수정 후 전체 실행은 모두 통과했다.
- `git diff --check` 성공. 변경 파일은 모두 300줄 이하다. 실제 작품·생성 결과물은 커밋하지 않았다.

### 수행 중 판단 (발생 순서)

1. 공통 Resource 구현이 있는 e7516d1에서 새 managed worktree를 만들었다. 원본 cwd와 기존 다른 작업 트리의 미커밋 변경을 보호한다. 기준이 다르면 나중에 통합 비용이 생긴다.
2. 샌드박스의 로컬 포트 EPERM은 루프백 테스트 실행 권한으로 해결했다. 제품의 검사/권한을 우회하지 않았다. 제한된 환경에서는 같은 실행 권한이 필요하다.
3. 처음 전이 영향 도입은 metadata v2와 v1 stale 호환으로 분리했다. 아래 7번에서 전체 제출 이력을 다루기 위해 최종 v3로 구체화했다. 기존 캐시는 명시 refresh가 필요하다.
4. 각 컷을 독립 Resource/Operation으로 남기고, 제작/조립 사이의 검토·입력 선택을 실제 사용자 결정으로 유지했다. 중간 인계가 추가된다.
5. 타임라인 자체의 정확한 컷 계보를 위해 compile을 컷 선택 이후 독립 단계로 나눴다. 입력 선택 인계가 한 번 더 필요하다.
6. 모션 도구·뷰어의 공통 계약 변경은 집중 테스트로 각각 확인하고 최종 전체 검증은 합쳤다. 최종 회귀에서 발견한 카탈로그 기대값까지 수정해 재실행했다.
7. v3는 checkpoint의 직접 기록만 generation에 고정하고, 모든 제출 Operation의 전이 영향을 읽을 때 계산한다. 같은 checkpoint의 늦은 제출이 역사적 캐시를 손상시키지 않게 한다. 비용은 한 번의 refresh와 제출 진술에 근거한 보수적 영향 표시다.
8. 창작 감상·8MiB 초과 저장·원격 생성형 영상은 명시한 후속 범위로 유지했다. 실제 관찰과 공통 저장/Adapter 확장이 별도로 필요하다.
9. 미승인 결과의 명시 입력 선택은 공통 계약대로 허용했다. 새 승인 gate 대신 해당 중간 결과를 통과하는 영향 추적을 고쳤다. 호스트는 품질 검토 상태를 정확히 전달해야 한다.

### 마지막 검토

새 맥락의 gpt-6-astra 검토자가 Important 4건을 재현했고, 각각 실패 테스트를 확인한 뒤 한 수정 단계에서 해결했다. 미승인 중간 계보, pending 실행 전 권한, 재개 출력 계약, FFmpeg 외부 참조 차단이다. 추가 캐시/순환 회귀도 통과했다. 새 검토자를 다시 호출하지 않았으며 창작 품질의 독립 감상을 주장하지 않는다.

후속 Minor: ReactFlow 기본 최소 줌 때문에 긴 그래프가 첫 화면에서 잘릴 수 있다. 이동/확대/노드 목록은 사용할 수 있고, 더 낮은 최소 배율과 초기 전체 맞춤은 후속 개선이다.

작업 트리는 managed detached 상태로 보존한다. 원본 체크아웃 변경·병합·push·외부 게시를 수행하지 않았다.

## Linivera PR 통합 (2026-10-21)

위 검증과 판단은 최초 Folio 구현 시점의 기록이다. 이후 사용자가 `fbwndrud/linivera` PR 생성을 요청해 원격 `main`의 `656e437` 위에 구현 5개 커밋을 이식했다. 원래 구현은 로컬 `codex/resource-motion`에 보존하고, PR 작업은 `codex/resource-motion-pr`에서 진행한다.

- Studio의 Graph/App/탐색/테스트 네 파일 충돌은 최신 main의 정의별 집필 참조 화면·언어 전환·Examples 탐색을 유지하며 자산 계보를 추가하는 방식으로 해결했다.
- 새 계보 화면의 제품 문구도 기존 한국어/영어 전환에 연결했다. 원작자가 입력한 자산 ID와 내용은 그대로 표시하는 회귀 테스트를 추가했다.
- 현재 제품이 의도적으로 보존하는 `folio_*` MCP 도구 ID와 저장 형식을 유지한다. `linivera` 실행 파일에서도 새 도구가 같은 카탈로그에 노출된다.
- 최신 main의 첫 사용 카탈로그 검사는 추가 도구를 포함한 23개로 갱신했다. 번역 및 첫 사용 RED→GREEN을 확인했다.
- Studio 테스트 72/72와 배포 빌드가 통과했다. 최신 main 기반 전체 회귀 결과는 PR 본문에 별도로 기록한다.
