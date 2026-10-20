# 공통 자산 순환과 모션 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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
- [ ] RED: hero→pose→shot 的 실제 임시 Resource/Operation fixture에서 hero 선택 변경 뒤 pose/shot 모두 reviewRequired, 기존 판본 inputRefs 유지, 재검토/원고 재작성 없음.
- [ ] RED: 같은 pose 판본을 두 워크플로우가 재사용해 upstream/downstream 모두 조회, 미선택 후보와 거절 결과 구별, depth/limit 명시적 truncated.
- [ ] GREEN: 검증된 revision catalog·operation/result/receipt·publication 입력으로 그래프를 만들고 정확 revision의 전이 영향 계산. 전체 리소스 그래프를 새 정본으로 저장하지 않음.
- [ ] Verify: node --test test/resources/lineage.test.js test/operations/publication.test.js test/resources/input-snapshots.test.js 및 npm test.
- [ ] Commit: feat(resources): connect lineage graph and transitive review impact.

## Task 2: 파일 등록·기존 관리 자산의 안정적 재사용

**Files:** core/resources/intake.js; core/resources/asset-import.js; server/tools/resources.js; resource-contracts.js; test/resources/intake.test.js; test/server/resources-e2e.test.js.
**Interfaces:** importResourceFile(root,{resourceId,kind,path,mediaType,parents?,schemaRef?,contentHash?}) -> ResourceRevision; importManagedAsset(root,{assetId,expectedRev}) -> ResourceRevision with same logical asset ID and stable source schemaRef. Existing ID collision with unrelated Resource rejects.
- [ ] RED: 정확 hash 파일 등록·동일 파일/같은 ID 재시도 동일 revision, source 선택 자동 생성 없음; 링크/상대 경로/8MiB 초과/hash 불일치 거부.
- [ ] RED: 기존 approved managed PNG 자산 인계는 같은 assetId를 보존하고 원본 자산/승인/사용처 불변. 오래된 expectedRev/Resource ID 충돌 거부.
- [ ] GREEN: 안전한 단일 파일 읽기와 기존 Resource propose 재사용. 새 자산 저장소/정본/승인 경로 금지.
- [ ] Verify: 새 집중 테스트와 실제 stdio resources import 호출 및 npm test.
- [ ] Commit: feat(resources): import local and managed assets with stable identities.

## Task 3: 공통 Operation 위의 모션 팩·로컬 렌더

**Files:** packs/motion/schema.js, plan.js, index.js; core/motion/operation.js; adapters/motion/ffmpeg.js, filters.js; server/tools/motion.js; definitions.js; handlers.js; resource-contracts.js; output-contracts.js; test/motion/plan.test.js, render.test.js.
**Interfaces:** planMotion(root,{inputSnapshotId}) -> {status:ready|needs_assets,specRevisionId,plan,missing}; renderMotion(root,{inputSnapshotId,idempotencyKey,actor,grantId?},{render?}) -> {status:submitted|needs_assets,operationIds?,resultRevisionIds?,missing?}; assembleMotion with the same call shape accepts a selected compiled timeline plus selected shots/audio and returns one submitted final video. Each shot has its own operation; compilation produces a separate timeline Resource. Outputs remain candidates until existing review/selection calls. Exactly one selected kind motion-project Resource in snapshot; its version:1 JSON pins outputResourceId, width/height/fps, shots:[{durationSeconds,backgroundColor,layers:[{revisionId,x,y,width,dx?,dy?,bob?}]}], audio:[{role:voice|music|sfx,revisionId:null|string,required:boolean,startSeconds?,gain?}]. Limits: width/height 16..1920, fps1..60, total1..120seconds, shots1..20, layers<=8/shot; finite numeric values; file references only exact pinned input revisions.
- [ ] RED: two pose shots compile exact input IDs; optional audio missing allowed; required missing returns needs_assets; unpinned/invalid types/NaN/time out of bounds reject.
- [ ] GREEN: ordinary JSON Resource carries project; compiled timeline and output MP4 are separate common Resource candidates linked by existing Operation. Never auto approve/select.
- [ ] RED: real local FFmpeg test with synthesized tiny PNG/WAV renders pose/position change and optional audio; ffprobe confirms duration/dimensions/audio; result hashes registered.
- [ ] GREEN: host-side Adapter only, shell:false argument arrays, no model/network; scratch cleared; output stays within existing 8MiB contract. Already submitted operation returns same result without new render; interrupted pre-submit stages are recoverable or remain explicitly pending.
- [ ] Verify: node --test test/motion/*.test.js and npm test. FFmpeg absence is explicit unavailable, not fake render.
- [ ] Commit: feat(motion): render cutout scenes through shared resource operations.

## Task 4: 公開 MCP·같은 그래프 화면·합성 수용 예제

**Files:** core/view/resource-graph.js; core/view/index.js; server/view/api.js; viewer/src/screens/Graph.jsx; viewer/src/components/ResourceLineage.jsx; viewer/src/lib/workspace.js; examples/motion.js; docs/motion.md; docs/resources.md; skill/folio/references/motion.md; skill/folio/SKILL.md; test/server/motion-e2e.test.js; test/view/resource-graph.test.js.
**Interfaces:** folio_resource_query op graph delegates queryResourceGraph; folio_resources op importFile/importAsset; folio_motion op plan/render uses Task3 signatures; GET /api/resource-graph returns same verified graph. Existing character/manuscript graph remains usable and common resource-only workspace can inspect lineage.
- [ ] RED: actual stdio source registration→pose reuse→motion render→new video/timeline IDs→same graph query→upstream source change marks descendants. Second consumer is a narration project using the identical pose revision; shots/timeline are selected with synthetic decisions before final assembly.
- [ ] GREEN: one common graph view, no motion-private IDs/store; UI distinguishes source/candidate/submitted/approved/rejected and truncation; renderer technical result is not creative approval.
- [ ] GREEN: executable synthetic example imports existing pose unchanged into a second workflow, emits verification summary and cleans all synthetic outputs. Host guide describes actual MCP args, pending/review and limits.
- [ ] Verify: npm run check; npm --prefix viewer test; npm --prefix viewer run build; node examples/motion.js; git diff --check; every changed file<=300 lines.
- [ ] Commit: feat(motion): expose shared lineage workflow and document host execution.

## Execution and review

- Native execution in this session; task-start/task-done and progress ledger preserve TDD evidence and rulings.
- User approval covers supplied designs and implementation order; no repeated design permission requested. Routine implementation details are implementer calls.
- Fresh reviewer checks complete diff and concrete failure cases; critical/important fixes receive RED→GREEN and full verification. Same host role separation is not independent creative perception.
- Worktree is managed/detached from codex/production-ready e7516d1. Preserve it for review; no merge/push/publication without separate authorization.

## 실행 중 구체화

- 컷 선택 뒤 compile 단계를 분리했다. 타임라인 자체도 실제 컷 판본을 공통 Input으로 고정해야 하므로 render→컷 검토/선택→compile→타임라인 검토/선택→assemble 순서다. JSON 안의 컷 이름만으로 계보를 대신하지 않는다.
- 다른 제작 흐름은 별도 낭독 pipeline 정의와 프로젝트를 사용한다. 동일 포즈 revision을 공유하고 음성은 합성 fixture로만 검증한다.
