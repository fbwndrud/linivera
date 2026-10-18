# 검사 관리

## 원칙

- 귀찮은 검사 관리는 AI가 한다. 무엇을 돌릴지는 작가가 정한다.
- 강제는 엔진이 한다. 엔진이 거부하면 우회하지 말고 오류 코드를 작가에게 그대로 설명한다.
- work.yaml과 `checks/` 파일은 작가가 승인한 뒤에만 쓴다. 쓰기 전에 바뀔 내용을 diff로 보여 준다.

## 도구

- 세트 설명·추천·검사 목록·단계: `folio_config { root }` — `checkSets`(세트, 골랐는지 `selected`, 기본 세트 `default`, 이 작품에 없는 검사 `missingChecks` — 비어 있지 않으면 고를 수 없고 추천에도 나오지 않는다), `recommended`(작품 단위 추천과 이유), `checks`(검사마다 지금 `config`), `stages`. `workKind`(작가가 답한 작품 종류)를 주면 `recommended`에 그 이유가 더해진다. `node`(노드 id)를 주면 `nodeRecommendations`(그 노드 레벨·역할·위치에 맞는 세트)가 더해진다.
- 사용자 검사 초안 검증: `folio_config { root, checkDraft }` — 결과 `checkDraft: { ok, spec, errors }`.
- 되채우기 목록: `folio_status { root }`의 `recheck`, 막힌 노드는 `flagged`, 다시 확인 필요는 `stale`.
- 재검사 실행: `folio_run { root, node: <id> 또는 'next-recheck', mode: 'recheck' }`.
- 이 밖의 도구 이름을 지어내지 않는다.

## work.yaml에서 다루는 곳

아래 `serial.*` 세트 id는 설명용 예시다. 실제 id는 `folio_config`의 `checkSets`에서 가져온다.

```yaml
checkSets: [serial.continuity, my-voice]   # 키가 없으면 팩 기본 세트, [] 이면 세트 없음
userCheckSets:
  my-voice: { title: 내 문체, checks: [voice-samples, no-cliche] }
checks:
  no-cliche: { words: [숨이 멎을 듯, 심장이 쿵], severity: advisory, experimental: true }
  voice-samples: { samples: checks/voice-samples/, severity: advisory, experimental: true, requireQuote: true }
  serial.word-count: { mode: off }
  serial.length: { config: { target: 5500 } }   # 팩 검사 설정을 작품마다 겹친다(키는 folio_config 의 checks[].config)
options:
  includeAllHardChecks: false
```

- 사용자 검사 id와 세트 id는 둘 다 `core.`이나 팩 접두어(예: `novel.`)로 시작할 수 없다(검사는 `USER_CHECK_ID_RESERVED`, 세트는 `USER_CHECK_SET_ID_RESERVED`).
- 규칙 파일과 예시 폴더는 `checks/` 안에만 둔다.
- 팩 검사 줄(`checks.<팩 검사 id>`)에는 `mode`(`on`·`off`), `severity`, `config`만 적는다. 다른 필드나 팩 설정에 없는 키는 `CONFIG_INVALID`로 거부된다(조용히 무시하지 않는다). hard 검사와 잠긴 코어 검사는 `config`를 받지 않는다. 설정 키와 값은 팩별 안내([novel.md](novel.md), [brand.md](brand.md))에 있다. 작가가 원하지 않으면 `features.checkConfig: false`로 작품별 설정을 막는다.

## 1. 첫 설정 인터뷰 (짧게)

대상·고정 사실·관찰을 추적하려면 [추적 인터뷰](tracking.md)를 함께 수행한다.
추적 기준 선언과 여기의 검사 세트 선택은 별도다. 검사 재실행을 기록 보충 완료로 설명하지 않는다.

질문은 한 번에 하나씩, 모두 합쳐 네 개 안쪽으로 한다. 기능(features)도 이때 보여 준다 — 기본값과 뜻은 [occurrences.md](occurrences.md)의 표. 바꾸고 싶은 것만 folio_init의 features로 넘긴다.

1. 어떤 작품인가: 장편 소설, 연재, 교재, 게임북 등.
2. 가장 신경 쓰는 것은: 설정 모순, 시간 순서, 인물 말투, 분량 등.
3. 쓰면 안 되는 표현이 있나: 단어, 상투구, 호칭.
4. 문체 예시가 있나: 작가가 직접 쓴 짧은 글 두세 개.

`folio_init`은 프리셋의 검사 세트를 work.yaml에 이미 켜 두었다(`folio_config`의 `checkSets`에서 `selected: true`). 인터뷰는 이 시작점에서 무엇을 더 켜고 끌지 정하는 것이다. `folio_config { root, workKind: <1번 답> }`로 보여 준다.

- 지금 켜진 세트: `checkSets`에서 `selected: true`인 것들(프리셋이 이미 켠 것). 그대로 둘지 뺄지 작가에게 확인한다.
- 작품 단위 추천: `recommended`. `workKind`(1번 답)를 넘기면 그 종류에 맞는 이유(`default`, `workKind`, `level`)가 한 줄씩 붙는다.
- 특정 노드에 맞는 세트가 궁금하면 `folio_config { root, node: <노드 id> }`의 `nodeRecommendations`(레벨·역할·위치 기준)를 본다.
- 3·4번 답이 있으면 아래 2절의 사용자 검사 초안을 함께 제안한다.
- hard 팩 검사를 아예 끌 수 없게 하고 싶다면 `options.includeAllHardChecks: true`를 제안할 수 있다(기본은 `false`). 작가가 원할 때만 켠다.

작가가 고른다. 고른 결과를 work.yaml diff로 보여 주고, 승인받은 뒤에만 쓴다. 추천 세트를 작가 확인 없이 더하지 않는다.

## 2. 새 검사 만들기

세 형태 중 하나로 초안을 만든다.

| 형태 | 작가가 준 것 | 초안 | 엔진에서 |
|---|---|---|---|
| 규칙 | "주인공은 존댓말만 쓴다" | `source: checks/<id>.md` (또는 짧으면 `rule`) | 모델 검사, 인용 필수 |
| 예시 | 문체 예시 글 | `samples: checks/<id>/` 폴더 | 모델 검사, 인용 필수 |
| 패턴 | 금지 단어·정규식 | `words: [...]` 또는 `pattern` | 결정론 검사 |

순서는 다음과 같다.

1. 초안(id, title, description, 형태별 필드)과 `checks/<id>.md` 본문을 보여 준다.
2. `folio_config { root, checkDraft }`를 부른다. `checkDraft.ok`가 false면 `errors`를 설명하고 고쳐서 다시 부른다. `stage`는 `stages`에 있는 그 종류의 단계만 된다.
3. 작가가 승인하면 `checks/<id>.md`(또는 예시 폴더)를 쓰고, 돌려받은 `spec`을 work.yaml `checks.<id>`에 넣는다. 세트로 묶기를 원하면 `userCheckSets`에도 넣고 `checkSets`에 그 세트를 더한다.
4. 켠 뒤에는 4절의 되채우기를 제안한다.

지킬 것은 다음과 같다.

- 새 검사는 언제나 `experimental: true`, `severity: advisory`로 시작한다.
- `block`으로 올리는 것은 작가가 직접 요청할 때만 한다. 먼저 권하지 않는다.
- `hard`는 사용자 검사에 없다. 요청받으면 할 수 없다고 말한다.
- 패턴 검사는 작가의 예문 한두 개로 무엇이 걸리는지 먼저 보여 준다.

## 3. 검사 끄기

- 팩·사용자 검사는 `checks.<id>: { mode: off }`로 끄고, 세트는 `checkSets`에서 뺀다.
- hard 팩 검사도 작가가 원하면 `mode: off`로 끌 수 있다. 단, `includeAllHardChecks: true`면 엔진이 거부한다(`HARD_CHECK_OVERRIDE`). hard 검사에는 `severity` 필드를 아예 적을 수 없다 — 낮추든 올리든 값을 적기만 해도 거부된다(`HARD_CHECK_SEVERITY_LOCKED`). 등급을 바꾸는 유일한 길은 끄는 것(`mode: off`)뿐이다.
- 실행 도중 끄면 남은 단계에서 그 검사는 돌지 않는다. 영수증에는 "통과"가 아니라 `skipped`(source `work.yaml`)로 남는다고 알려 준다. 질문이 떠 있었다면 다음 `folio_resume`이 `ANSWER_STALE`로 거부된다 — `folio_run`을 다시 부른다.
- 끈다고 이미 커밋한 원고를 다시 볼 일은 없다.

## 4. 검사 켜기와 되채우기

- 켜면(다시 켜도) 그 검사를 거치지 않은 커밋 노드가 `folio_status`의 `recheck`에 뜬다. 목록을 보여 주고 되채우기를 제안한다.
- 작가가 원하면 `folio_run { root, node: <id> 또는 'next-recheck', mode: 'recheck' }`로 돌린다. 재검사는 검사만 돈다. 원고는 바꾸지 않는다.
- 결과는 이렇게 설명한다.
  - 지적 없음: 그 노드의 되채우기가 끝난 것이다.
  - advisory 지적: 참고용으로 보여만 준다. 자동으로 고치지 않는다.
  - block 지적: 작가가 이유를 적어 넘길 수 있다(`folio_decide`의 `reason`, override 기록). 넘길지 고칠지는 작가가 정한다.
  - hard 지적: `folio_status`의 `flagged`에 뜨고 승인으로 넘길 수 없다(`canApprove: false`). 고치려면 그 노드를 보통 실행으로 다시 써야 한다고 알려 준다. 원고는 자동으로 바뀌지 않는다.
- 구조가 바뀐 가지(`stale`의 이유 `structure`)는 재검사로 풀리지 않는다. 그 가지를 보통 실행으로 다시 돌려야 한다. 다시 돌리면 계획 → 부합 검사(fit) → 승인 → 돌아보기(review) → 커밋을 다시 한다(자식은 새로 만들지 않는다). 즉 가지 계획을 다시 쓰고 작가에게 다시 승인을 받는다 — 돌리기 전에 작가에게 이렇게 알린다.
- 자식을 기다리는 가지(`waiting_children`)도 그 사이 팩이나 설정(work.yaml)이 바뀌면 부합 검사(fit)부터 다시 돌고, 승인을 다시 묻는다. 이미 만든 자식은 그대로다.

## 하지 않는 것

- 잠긴 코어 검사(`core.*`, 예: `core.promise-order`)를 끄거나 바꾸려 하지 않는다.
- 같은 호스트가 한 검토를 "독립 검토"라고 부르지 않는다.
- advisory 지적을 근거로 원고를 자동으로 고치지 않는다.
- 커밋을 흉내 내지 않는다. 커밋은 `folio_run`만 한다.
- 승인 없이 work.yaml이나 `checks/`를 쓰지 않는다.

## 예시 (합성)

### 예시 1 — 첫 설정

> 작가: 새 연재 「유리 등대」 검사 좀 맞춰줘.

- AI가 네 가지를 묻는다. 답은 "연재 / 설정 모순이 제일 걱정 / '운명처럼' 금지 / 예시 없음"이다.
- `folio_config`의 `recommended`를 보여 준다(예: 팩 기본 세트, 작품에 있는 레벨에 맞는 세트 — 실제 id는 그때 `checkSets`에서 확인한다).
- 금지어 검사 초안 `no-destiny`(`words: [운명처럼]`, advisory)를 `checkDraft`로 검증해 함께 제안한다.
- 작가가 추천 세트 하나와 no-destiny만 고른다. AI가 diff를 보여 주고, 승인받은 뒤 work.yaml을 쓴다.

### 예시 2 — 문체 검사를 만들고 되채우기

> 작가: 내 예전 글처럼 짧게 끊어 쓰는지 봐줘. 예시 붙일게.

- AI가 `checks/short-voice/`에 예시 세 편을 두고 초안 `{ id: 'short-voice', samples: 'checks/short-voice/' }`을 만든다.
- `folio_config`의 `checkDraft`가 `experimental`, `advisory`, `requireQuote`를 붙인 spec을 돌려준다. 작가 승인 뒤 work.yaml에 넣는다.
- `folio_status`의 `recheck`에 커밋된 12개 노드가 뜬다. 작가가 "3화까지만"이라고 해서 세 노드만 재검사한다.
- 결과는 advisory 지적 두 개이다. 인용과 함께 보여 주고 원고는 그대로 둔다.

### 예시 3 — 끄기 요청과 거부

> 작가: 죽은 인물 검사 너무 시끄러워. 끄고, 대신 등급도 advisory로 내려줘.

- 이 검사(예: 팩의 `dead-on-stage`류 hard 검사)는 hard 팩 검사라 `severity`를 아예 적을 수 없다고 설명한다(높이든 낮추든 `HARD_CHECK_SEVERITY_LOCKED`).
- 선택지는 둘이다. 그대로 두거나 `mode: off`로 끄는 것이다.
- 작가가 끄기를 고르면, 지금 열린 실행의 남은 단계에서는 skipped로 기록된다고 알려 준다.
- 작가가 `core.promise-order`도 꺼 달라고 하면, 잠긴 코어 검사라 끌 수 없다고 답한다.

프로필 원문 답·해석·작가 확인의 영속 저장은 [인터뷰 흐름](interview.md)을 따른다. 기존 설정과 반복 브리프를 새 답으로 만들지 않는다.
