---
name: folio
description: Linivera MCP로 새 작품·이어쓰기·그림책·동화·게임북·지식 책·번역 판본을 계획하고 쓴다. 그림 생성·등록·검토, 추적 인터뷰·위임·기록 보충, 원본·입력·결과 관리, 검토 화면·내보내기와 Vibelore 가져오기를 다룬다.
---

# Linivera — 작품 쓰기

제품 이름은 Linivera(리니베라)다. 기존 지침 호환을 위해 스킬 ID/폴더는 folio, MCP 도구 ID는 folio_*를 유지한다. 저장된 작품을 이름 변경 때문에 변환하지 않는다.

## 사용자에게 설명할 때

사용자 화면과 작업 이름은 쉬운 영어를 쓴다. `commit`은 **Finalize**, `recommit`은 **Review and finalize changes**, `receipt`는 **Review record**, `recheck`는 **Review again**, `stale`은 **Review needed**, `drift`는 **Edited since review**, `node`는 **Section**, `entity`는 **Definition**으로 설명한다. `hard`는 **Must fix**, `block`은 **Needs your decision**, `advisory`는 **Suggestion**이다. 대화 설명은 사용자 언어를 따르되 이 이름을 기준으로 한다. 실제 도구 이름·인자·파일 형식·오류 코드는 그대로 전달하고, 오류의 뜻과 다음 행동을 먼저 설명한다. 상세 오류 코드는 문제 해결에 필요할 때 함께 보여 준다. Finalize는 검사·승인한 버전의 기록이며 초안 저장이나 인터넷 공개와 구분한다.

## 원칙

- 순서와 잠금은 엔진이 지킨다. 이 스킬은 안내만 한다. 엔진이 거부하면 우회하지 말고 오류 `code`를 작가에게 그대로 설명한다.
- 모델 작업(계획·원고·사건 추출·검토)은 호스트(나)가 한다. 엔진은 `needs_model` 요청만 준다.
- 사람의 결정(승인·수정 요청·넘김)은 작가가 한다. 작가에게 묻지 않고 `folio_decide`를 부르지 않는다.
- 같은 호스트가 한 검토를 "독립 검토"라고 부르지 않는다. 참고 의견(advisory)을 근거로 원고를 고치지 않는다.
- 그림 생성·편집도 호스트가 한다. 그림 요청·등록·교체·승인은 [자산 흐름](references/assets.md)을 읽고 수행한다.
- 추적 인터뷰·위임·대상 추가·과거 기록 보충·추적 stale을 다루거나 요청에 `payload.tracking`이 있으면 [추적 흐름](references/tracking.md)을 읽는다. 추적 동작과 권한의 정본은 그 참조다.
- 작품 파일을 손으로 고쳐 커밋을 흉내 내지 않는다. 커밋은 실행(`folio_run`)만 한다.
- `.folio/`(내부 상태)는 절대 손으로 고치지 않는다. 쓰기는 도구가 한다.

## 사람에게 설명하기

- 처음 쓰는 사람에게는 결과·지금 할 일·확인할 기준을 쉬운 말로 설명한다.
  작품은 제목과 현재 부분으로 지칭하고, 경로·도구 입력 형식은 필요한 연결 단계에서만 설명한다.
- "ELI5", "그림으로", "더 쉽게", "처음부터" 요청은
  [쉬운 설명](references/plain-language.md)을 읽고 따른다. 외부 ELI5 플러그인 없이 수행한다.
- 작가를 5세로 가정하지 않는다. 작품의 독자·문체는 작가가 정한다.
  그림책·동화책 요청은 [어린 독자 작품](references/storybooks.md)을 읽는다.
- 연결되지 않았으면 연결 단계임을 설명하고 [연결 안내](references/connection.md)로 안내한다.
  로컬 저장과 클라우드 저장, 그림 설계와 실제 삽화를 실제 기능에 맞게 설명한다.

## 도구

| 도구 | 언제 |
|---|---|
| `folio_init` | 새 작품. `{ root, title, preset, language }`. `language`는 인터뷰에서 합의한 본문 언어 태그(예: `en`, `ko`)다. 소설 팩: `serial`(아크→회차), `novel`(권→장→장면), `scene`(장면), `picturebook`(책→펼침면), `fairytale`(장→장면). 지식 책은 `packs: ['knowledge']`와 `textbook`·`history`·`guide`([references/knowledge.md](references/knowledge.md)). 이미 있으면 `created: false` |
| `folio_status` | 지금 상태. `next`(다음 노드), `activeRun`과 `pending`(떠 있는 질문), `stale`·`recheck`·`flagged`·손수정(`drift`), `trackingStale`·`backfillPending`, 등장 위치(`occurrences.stale`)·근거 연결(`evidence.stale`) |
| `folio_run` | 다음 노드(또는 `node`)를 돈다 |
| `folio_resume` | `needs_model` 요청에 답한다 |
| `folio_decide` | `needs_user` 질문에 작가 결정을 전한다 |
| `folio_structure` | 구조 바꾸기(`add`·`move`·`wrap`). 열린 실행이 있으면 거부된다 |
| `folio_find` | 노드·엔티티 정의, 엔티티가 나오는 곳(`usages` + 기록된 등장 위치 `marks`), 사건 이력(`events`), 표면의 이름 후보(`candidates`), 이름 바꾸기 계획(`rename`, 읽기 전용) |
| `folio_view` | 로컬 뷰어 주소(`url`)를 작가에게 준다. 읽기·엔티티·영수증·단계·관계도·떡밥 보드·검사 세트·근거·블록 화면, 정적 내보내기. [references/viewer.md](references/viewer.md) |
| `folio_occurrences` | 등장 위치 제출(`submit`), 작가가 승인한 이름 바꾸기 적용(`rename`). [references/occurrences.md](references/occurrences.md) |
| `folio_sources` | 자료 넣기(`add`: 글 또는 작가가 고른 파일 하나), 목록(`list`), 자료와 걸린 주장(`get`), 커밋된 노드의 주장 잇기(`link`). [references/sources.md](references/sources.md) |
| `folio_config` | 고급. 레벨별 단계·검사 세트·검사 목록, `workKind`·`node`로 추천, 사용자 검사 초안 검증. 읽기 전용 |
| `folio_assets` | 설명서·결과 인계·버전·사용 위치·자기검토·작가 결정과 조회. [references/assets.md](references/assets.md) |
| `folio_lore` | 작가 승인 세계관 판본·근거·미해결 질문. [정본 흐름](references/lore.md) |
| `folio_interview` | 원문 답·해석·작가 확인의 저장과 재개. [인터뷰 흐름](references/interview.md) |
| `folio_tracking` | 추적 계획·대상·관찰·근거·이력. 입력·위임·보충 규약은 [추적 흐름](references/tracking.md) |
| `folio_image` | 그림 한 장(`start`·`resume`·`decide`·`pending`). 노드 실행과 따로 돈다. [references/image.md](references/image.md) |
| `folio_import_vibelore` | vibelore 작품 폴더를 새 작품으로 가져온다(원본은 읽기만). 노드는 모두 `imported`. [references/import.md](references/import.md) |

`root`는 언제나 작가가 고른 작품 폴더의 절대 경로다. 가져오기에서는 아직 없는 새 폴더여야 하고, 부모는 이미 있어야 하며 원본 안에 둘 수 없다. 엔진에 폴더 허용 목록은 없으니 작가가 고르거나 확인해 준 경로만 넘긴다. 짐작한 경로나 작품과 상관없는 폴더를 넘기지 않는다.

## 흐름

1. **새 작품**: 작가에게 제목·형식·본문 언어를 확인하고 `folio_init`의 `language`에 합의한 언어 태그를 전달한다. Studio UI 언어는 별도다. 저장 위치가 현재 대화에 없으면 작가가 선택·확인하도록 연결 환경에 맞게 안내한다. 제목만으로 작품 위치를 추측하지 않는다. 지식 책은 [references/knowledge.md](references/knowledge.md). 검사 세트는 [references/checks.md](references/checks.md)의 첫 설정 인터뷰로 맞춘다.
   작품을 만든 뒤 [인터뷰 흐름](references/interview.md)으로 실제 원문 답과 확인을 보관한다. 재개할 때는 저장된 답을 먼저 읽고 pending만 묻는다. 세계관 설정 채택은 [정본 흐름](references/lore.md)을 따르며 추적 관찰을 자동 채택하지 않는다.
2. **큰 틀**: 맨 위 노드를 `folio_structure { op: 'add', level, id, title }`로 만든다(예: `arc-1`). 아래 노드는 위 노드의 `children` 단계가 만든다.
3. **쓰기 루프**: `folio_run { root }` → 결과에 따라
   - `needs_model`: `requests`마다 아래 "답하는 법"대로 답을 만들어 `folio_resume { root, runId, answers: { requestId: 답 } }`. 추출(extract) 요청의 `occurrences.wanted`가 true면 답에 등장 위치를 넣는다([references/occurrences.md](references/occurrences.md)). `evidence.wanted`가 true면 주장과 자료 인용(`claims`)을 넣는다([references/sources.md](references/sources.md)).
   - `needs_user`: `question`(원고·지적·참고 의견)을 작가에게 보여 주고 결정을 받아 `folio_decide`. `kind: tracking_metadata`는 [추적 흐름](references/tracking.md)의 보충 결정으로 설명한다.
   - `done`: 한 노드가 커밋됐다. 작가에게 알리고 다음 `folio_run`.
   - `skipped`: 두 경우가 있다. `reason`을 그대로 작가에게 보여 주고, 둘을 섞어 말하지 않는다.
     - `folio_run`의 재검사(`mode: recheck`)가 커밋된 원고가 손으로 바뀐 것(손수정, `drift`)을 발견해 건너뛰었다.
     - `folio_decide`의 `skip`으로 작가가 이 실행을 버렸다(`{ status: 'skipped', runId, nodeId, reason }`, `reason`은 작가가 준 이유). 손수정이 아니다.
   - `idle`: 할 일이 없다. 구조를 더하거나 끝낸다.
4. **이어서 하기**: 대화가 끊겼으면 `folio_status`의 `pending`이 떠 있는 질문이다. 거기서 이어간다.
   - `folio_status`의 `drift`에 `code: 'COMMITTED_WITHOUT_RECORD'`인 노드가 있으면: 앞머리는 커밋됨인데 커밋 기록이 없어 아직 확정되지 않은 노드다(커밋 도중 멈춘 실행을 버렸거나 앞머리를 손으로 고침). 작가에게 이렇게 설명하고 `folio_run { root, node: <그 nodeId> }`로 그 노드를 다시 돌린다. 그전까지 위 가지는 `CHILDREN_PENDING`으로 막힌다.
   - `folio_status`의 `warnings`에 `code: 'TX_INTERRUPTED'`가 있으면: 여러 파일을 한 번에 쓰던 작업(이름 바꾸기)이 중간에 끊겼다. `valid: true`면 다음 도구 호출이 알아서 되돌린다. `valid: false`면 엔진이 추측으로 되돌리지 않고 모든 쓰기를 막는다 — journal이 망가졌거나(`TX_JOURNAL_INVALID`), 끊긴 뒤 작가가 고친 파일이 있어 되돌리면 그 글을 덮어쓰게 되는 경우다(`TX_CONFLICT`, `details.paths`에 그 파일들). 작가에게 알리고, 작가가 파일을 `.folio/tx`의 백업과 비교해 확인한 뒤 `dir`(`.folio/tx`)을 손으로 지우게 한다. 호스트가 대신 고르거나 지우지 않는다([references/occurrences.md](references/occurrences.md)).
   - `folio_status`의 `drift`에 `code: 'CHANGED_DURING_RUN'`인 노드가 있으면: 열린 실행이 기다리는 사이 그 노드 파일이 손으로 바뀌었다. 그 실행은 `NODE_TEXT_CHANGED`(다시 커밋이면 `RECOMMIT_TEXT_CHANGED`)로 막히니 작가에게 알리고 `skip`을 받는다. 중단된 커밋은 불변 저장 의도의 bytes와 다르면 `COMMIT_TARGET_CONFLICT`로 멈춘다. 이 경우에도 작가의 손수정을 보존한다.
   - `folio_status`의 `drift`에 `recommit: true`가 있으면 작가에게 알리고, 작가가 원하면 `folio_run { root, node, mode: 'recommit' }`으로 지금 본문을 검사해 다시 커밋한다. `occurrences.stale`이 있으면 그 표면의 등장 위치를 다시 제출한다([references/occurrences.md](references/occurrences.md)). `evidence.stale`이 있으면 그 노드의 주장을 `folio_sources { op: 'link' }`로 다시 잇는다([references/sources.md](references/sources.md)).
5. **단계 설정**: 레벨마다 단계를 켜고 끄는 법은 [references/steps.md](references/steps.md).
6. **소설 검사**: 소설 세트(기본·웹소설 연재·문체 유지), 작가가 채우는 엔티티 필드, 추출 사건 모양은 [references/novel.md](references/novel.md).
7. **회사 문서**: 제품 소개서·브로셔의 브랜드 어조·금지 표현·수치 대조 세트(`packs: ['knowledge', 'sources', 'brand']`)는 [references/brand.md](references/brand.md).
8. **블록·각주·참고문헌·색인**: 그림·표·식 앵커(`{#fig-1-1}`), 블록 참조(`[[block:id]]`), 각주(`[^id]`), 자료 인용(`[[source:id]]`)과 `folio_find`의 `blocks`·`bibliography`·`terms`는 [references/blocks.md](references/blocks.md).
9. **순서 없는 작품**: 사전·매뉴얼(`order: none`, 지식 책 `reference` 프리셋), 노드 링크(앞머리 `links`), `folio_find`의 `links`, `folio_status.links`는 [references/order.md](references/order.md).
10. **그림**: 웹툰·삽화의 그림 한 장(설명서 → 점검 → 그림 → 검토 → 승인 → 영수증), 기준 그림, 본문에 놓기(`![[asset:id]]`)는 [references/image.md](references/image.md).
11. **vibelore 가져오기**: 옛 연재를 옮기고, 가져온 노드를 recommit으로 Linivera 검사에 거는 법은 [references/import.md](references/import.md).
12. **판본**: 번역·개정·요약을 만들거나 `folio_status.variants`를 설명할 때는 [references/variants.md](references/variants.md).

## 답하는 법 (`needs_model`)

요청의 `payload.instructions`(팩 프롬프트)를 먼저 따른다. 답 형식:

| 요청 | 답 |
|---|---|
| `purpose: generate`, `produces: plan` | 계획 글 |
| `produces: draft` | 원고 본문만 |
| `produces: events` | JSON `{ "events": [...], "appearances": [...], "mentions": [...] }` |
| `produces: children` | JSON `{ "children": [{ "id", "title", "brief" }] }` — 개수는 `childLevel.range` 안 |
| `purpose: check` | JSON `{ "checked": [검사 id 모두], "findings": [{ "checkId", "code", "message", "quote" }] }` — `requireQuote` 검사는 원고 문장을 그대로 인용 |
| `purpose: revise` / `user_revision` | 고친 원고 전체. `blocking`(또는 작가 `feedback`)만 고친다 |

요청에 `retryReason`이 있으면 앞 답을 읽을 수 없었다는 뜻이다. 형식을 고쳐 다시 답한다.

`answers`의 값은 모두 문자열이다. JSON으로 답해야 하는 요청(`produces: events`·`children`, `purpose: check`)도 JSON을 문자열로 직렬화해서 넣는다.

## 오류일 때

- `ANSWER_STALE`: 질문을 낸 뒤 설정(단계·검사·팩)이 바뀌어 옛 질문을 버렸다. `folio_run`을 다시 불러 새 질문에 답한다.
- `RUN_IN_PROGRESS`: 다른 노드의 실행이 열려 있다. `folio_status`로 그 질문을 이어가거나, 작가가 원하면 `skip`한다.
- `RUN_LEVEL_MISMATCH`, `RUN_KIND_MISMATCH`: 실행 파일과 노드가 레벨(또는 종류)에서 어긋난다. 이걸 바꾸는 도구는 없다 — 작가에게 알린다. 트리를 손으로 고쳤다면 작가가 그 수정을 되돌리거나, 되돌리지 않겠다면 작가의 이유를 받아 `folio_decide`의 `skip`으로 이 실행을 버린다. 호스트가 직접 트리 파일을 고치지 않는다.
- `LOCK_PIPELINE_MISMATCH`(`folio_run`): 커밋 도중 멈춘 실행의 영수증이 지금 설정과 맞지 않는다(영수증을 기록한 뒤 work.yaml이나 팩이 바뀜). 작가에게 알리고 고르게 한다: work.yaml을 되돌려 커밋을 끝내거나, 작가의 이유를 받아 `folio_decide`의 `skip`으로 이 실행을 버린다. 팩이 바뀐 것(업그레이드)이면 되돌릴 수 없으니 `skip`뿐이다. 버린 뒤 그 노드는 다시 돌린다.
- `STRUCTURE_RUN_OPEN`: 실행이 열려 있어 구조를 바꿀 수 없다. 먼저 그 실행을 끝내거나 넘긴다.
- `APPROVE_BLOCKED_BY_HARD`: hard 충돌은 승인할 수 없다. 작가에게 지적을 보여 주고 `request_revision`(고치기) 또는 `skip`을 고르게 한다.
- `OVERRIDE_REASON_REQUIRED`, `FEEDBACK_REQUIRED`, `SKIP_REASON_REQUIRED`: 작가에게 이유·요청을 받아 다시 부른다.
- `CONFIG_INVALID`: work.yaml이 틀렸다. `details.errors`를 작가에게 설명한다 — 단 `details`가 `{ truncated: true }`로 왔으면 오류 목록이 너무 커서 안 실린 것이다(아래 `details: { truncated: true }` 참고). 그럴 땐 목록을 대신 설명하지 말고 work.yaml을 다시 보게 한다.
- `YAML_INVALID`: work.yaml 등 YAML 파일의 문법이 틀렸다. `details.source`(어느 파일), `details.line`, `details.column`을 작가에게 알려 그 자리의 YAML 문법을 고치게 한다.
- `WORK_ROOT_INVALID`: 준 root가 폴더가 아니다. work.yaml이 있는 작품 폴더의 절대 경로를 작가에게 다시 받는다.
- `INTERNAL_ERROR`: 예상 밖의 오류다. `message`는 고정 문구이고 `details.errno`만 실린다 — 원문은 linivera-mcp 서버 로그(stderr)에만 남는다. 작가에게는 다시 시도해 보라고 하고, 반복되면 서버 로그를 확인한다.
- `details: { truncated: true }`: 어느 오류든 `details`가 이 모양으로 왔으면 원래 담길 내용이 너무 커서 대신 온 것이다(`CONFIG_INVALID`의 `details.errors`도 포함). 실제 값 대신 이 사실만 작가에게 알린다.
- `FEATURE_DISABLED`: 작가가 끈 기능이다. 켤지는 작가에게 묻는다 — 호스트가 직접 work.yaml을 고치지 않는다.
- `RENAME_PLAN_STALE`: 계획을 보여 준 뒤 작품이 바뀌었다. `folio_find { query: 'rename', ... }`으로 계획을 다시 받아 작가에게 다시 보여 준다.
- `RENAME_RUN_OPEN`: 이름 바꾸기가 바꿀 노드에 열린 실행이 있다. 그 실행을 먼저 끝내거나 넘긴다.
- `RECOMMIT_NOT_NEEDED`: 다시 커밋할 손수정이 없다. 그대로 알린다.
- `RECHECK_TEXT_DRIFTED`: 재검사하려는 노드의 원고가 손으로 바뀌었다. 재검사가 아니라 `folio_run { root, node, mode: 'recommit' }`으로 지금 본문을 검사해 다시 커밋한다(`recommit`이 꺼져 있으면 작가에게 알린다).
- `RECOMMIT_TEXT_CHANGED`: recommit 도중 본문이 또 바뀌었다. 승인할 수 없고 `skip`만 된다 — 건너뛰고 다시 `folio_run { mode: 'recommit' }`.
- `NODE_TEXT_CHANGED`(질문 `blocking`): 실행 도중(작가 결정을 기다리는 사이) 노드 파일을 손으로 고쳤다. 승인·고쳐쓰기는 안 되고 `skip`만 된다 — 파일은 작가 글 그대로 남는다. 작가 글을 원고로 쓰려면 다음 실행의 원고 답에 그 글을 준다.
- `OCCURRENCES_INVALID`: 제출한 등장 위치 중 하나라도 본문과 안 맞아 아무것도 기록되지 않았다. `details.errors`의 `index`마다 인용문을 고쳐 다시 낸다([references/occurrences.md](references/occurrences.md)).
- `TX_FAILED`: 이름 바꾸기 쓰기 도중 실패했다. 파일은 하나도 바뀌지 않았다 — 다시 시도한다.
- `EVIDENCE_INVALID`, `SOURCE_EXISTS`, `SOURCE_IMMUTABLE`, `SOURCE_PATH_INVALID`, `SOURCE_TOO_LARGE`, `SOURCE_SPAN_NOT_FOUND`, `SOURCE_NOT_FOUND`: [references/sources.md](references/sources.md)의 "오류일 때".
- `TX_CONFLICT`, `TX_JOURNAL_INVALID`, `TX_PENDING`, `RENAME_OCCURRENCES_NOT_RECORDED`, `RENAME_INCLUDE_UNKNOWN`, `RENAME_OPTIONS_INVALID`, `RECOMMIT_NO_CHILDREN`: [references/occurrences.md](references/occurrences.md)의 "오류일 때".

## 범용 원본·결과 요청

집필 원고 실행과 독립인 자원 등록·입력 봉인·복수 결과·판본 조회를 요청받으면 [references/resources.md](references/resources.md)를 읽고 그 경로를 사용한다.

선택 원본의 의미 검색·벡터 색인 요청은 [references/embeddings.md](references/embeddings.md)를 읽는다.
- `folio_view` 오류와 화면 안 오류: [references/viewer.md](references/viewer.md)의 "오류일 때".
- `folio_image` 오류와 그림 잠금 오류: [references/image.md](references/image.md)의 "오류일 때".
- `VARIANT_*`, `LOCK_ORIGINAL_CHANGED`: [references/variants.md](references/variants.md)의 "오류일 때".

## 선택 경로 게임북

게임북을 만들거나 분기 경로 요청을 받으면 [게임북 안내](references/gamebook.md)를 읽는다. `packs: ['gamebook']`, `preset: gamebook`으로 시작한다. 선택 연결과 진입·끝 표시는 작가가 앞머리에 적는다.

지면·웹·EPUB·인쇄 PDF 내보내기는 [references/export.md](references/export.md)를 먼저 읽는다. 원고와 기록장을 바꾸지 않는 출판 절차다.
