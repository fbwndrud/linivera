# 첫 원고 만들기

먼저 [README](../README.md)의 설치와 MCP 등록을 마친다.
모델 없이 연결부터 확인하려면 `npm run examples`를 실행한다.
다음은 실제 호스트와 함께 단일 장면을 쓰는 흐름이다.

자연어 요청부터 추적 인터뷰·개별 위임·원고 채택·기록 보충까지 따라 하려면
[사람용 추적 안내](tracking.md)를 먼저 읽는다. 아래는 연결 확인을 위한 기술 참고다.
모델 없이 추적 통신을 확인하려면 `node examples/tracking.js`를 실행한다.

## 호스트에게 요청하기

Linivera MCP에 연결하고 기본 지침과 `linivera://guides/skill`을 읽은 호스트에서 다음처럼 요청한다. 호스트가 MCP resources를 지원하지 않으면 `skill/folio/`를 해당 프로그램 방식으로 등록한다. 연결 방법은 [연결 안내](connect.md), 생성 파일과 다음 제작은 [문서 안내](README.md)를 따른다.

> `/absolute/path/to/my-story` 폴더에 단일 장면 소설을 만들어 줘.
> 제목은 ‘첫 장면’이고, 닫힌 가게 앞에서 오래된 편지를 발견하는 이야기야.
> 계획과 본문을 보여 주고, 내 승인을 받은 뒤 기록해 줘.

경로는 작가가 선택한 폴더여야 한다. Windows에서는 `C:\\Users\\name\\my-story`처럼
실제 절대 경로를 사용한다. 아래 JSON은 도구 호출의 내용이며, 터미널 명령이 아니다.

## 도구 호출로 살펴보기

1. `folio_init`으로 작품을 만든다.

   ```json
   { "root": "/absolute/path/to/my-story", "title": "첫 장면", "preset": "scene", "packs": ["novel"] }
   ```

   `created: false`면 이미 있는 작품을 그대로 연 것이다. 초기화로 덮어쓰지 않는다.

2. `folio_structure`로 첫 장면을 만든다.

   ```json
   { "root": "/absolute/path/to/my-story", "op": "add", "level": "scene", "id": "scene-1", "title": "돌아온 편지" }
   ```

3. `folio_run`을 호출한다.

   ```json
   { "root": "/absolute/path/to/my-story", "node": "scene-1" }
   ```

4. `needs_model`이면 호스트가 각 요청의 `payload.instructions`와 답 형식을 따른다.
   요청에 실제로 나온 `runId`와 모든 `requestId`를 사용해 `folio_resume`에 답한다.

   ```json
   {
     "root": "/absolute/path/to/my-story",
     "runId": "실제로 받은 runId",
     "answers": { "실제로 받은 requestId": "요청에 맞춰 작성한 답 문자열" }
   }
   ```

   계획·본문은 글 문자열이다. 사건·자식·검사 답도 JSON을 **문자열로** 직렬화한다.
   검사는 `checked`에 요청받은 모든 검사 id를 적는다.
   `occurrences.wanted`·`evidence.wanted`가 true면 요청된 추출을 수행한다.
   정확한 형식은 [호스트 스킬](../skill/folio/SKILL.md)의 ‘답하는 법’을 따른다.

5. `needs_user`이면 본문과 지적을 작가에게 보여 준다. 작가가 승인하면 `folio_decide`를 호출한다.

   ```json
   { "root": "/absolute/path/to/my-story", "runId": "실제로 받은 runId", "action": "approve" }
   ```

   수정 요청은 `request_revision`과 `feedback`, 포기는 `skip`과 `reason`을 사용한다.
   hard 충돌은 승인할 수 없다. block을 넘기려면 작가의 이유가 필요하다.
   참고 의견은 수정 명령이 아니다.

6. `done`이면 커밋이 끝났다. `folio_find`로 저장된 본문을 확인한다.

   ```json
   { "root": "/absolute/path/to/my-story", "query": "node", "id": "scene-1" }
   ```

   응답의 `node.body`가 본문이고 `node.path`는 작품의 `tree/`를 기준으로 한 상대 경로다.
   다음 `folio_run`이 `idle`이면 현재 구조에서 할 일이 없다.

## 교재와 자료 책

`packs: ["knowledge"]`와 `preset: "guide"`로 안내서를 만들 수 있다.
루트 노드는 `level: "chapter"`이며, 아래 절은 계획의 children 단계가 만든다.
실행 가능한 예시는 [guide.json](../examples/guide.json)에 있다.

자료 책은 `packs: ["knowledge", "sources"]`, `preset: "sourcebook"`을 쓴다.
자료 추가와 주장 연결은 [자료 안내](../skill/folio/references/sources.md)를 따른다.
용어 정의 파일은 `entities/term/<id>.md`에 둔다.

대화가 끊겼으면 `folio_status`의 `pending`에서 이어간다.
설정·팩이 바뀌어 `ANSWER_STALE`이 나오면 옛 답을 재사용하지 말고
`folio_run`을 다시 호출해 새 요청을 받는다.

## 추적 도구 참고

`folio_tracking`의 `get`으로 현재 계획과 coverage를, `query`로 대상·관찰·근거·이력을 읽는다.
`query`의 type은 `entities|observations|evidence|history`이고 기본은 history다.
각 페이지는 `entries,nextCursor`를 반환한다. 새 계획은 제안 뒤 실제 사용자 결정을 받아 확정한다.
확정 원문의 기록 보충은 `folio_run {root,node,mode:'tracking-backfill'}`이다.
`tracking_metadata` 질문의 승인은 이번 기록에만 적용된다.
`mode:'recheck'`는 추적 stale을 해소할 수 있지만 보충 coverage를 완료시키지 않는다.
입력과 오류 처리의 정본은 [호스트 추적 참조](../skill/folio/references/tracking.md)에 있다.
