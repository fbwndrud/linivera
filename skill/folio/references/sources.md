# 자료와 근거 (sources 팩, `folio_sources`)

엔진은 주장을 스스로 찾지 않는다. 호스트가 주장 문장과 그것을 받치는 자료 인용을 내고, 엔진은 둘 다 정말 있는지만 대조한다.

## 준비

- 작품 `packs`에 `sources`를 둘째 팩으로 둔다: `packs: [knowledge, sources]`(소설이면 `[novel, sources]`). 자료 책은 `folio_init { preset: 'sourcebook', packs: ['knowledge', 'sources'] }`([knowledge.md](knowledge.md)).
- 검사 세트는 작가가 고른다: `sources.citations`(결정론 셋), `sources.review`(모델 둘). 둘 다 실험·참고 의견이다. 기본 세트는 없다.
- 기능 토글(work.yaml `features`): `sources`(도구와 요청의 자료), `evidence`(근거 연결), `evidenceInExtract`(추출 요청이 주장을 묻는다). 끄는 것은 작가가 정한다. 잠금은 어떤 토글과도 상관없다.
- 추출 요청의 `evidence.wanted`는 `evidenceInExtract`가 켜져 있고 **`packs`에 `sources`가 있을 때만** true다. `sources` 팩이 없는 작품(소설 등)은 이 토글이 켜져 있어도 주장을 묻지 않는다 — 볼 검사가 없기 때문이다.

## 자료 넣기 — `folio_sources { root, op: 'add', id, title?, date?, reliability?, spans?, text | path }`

- `text`: 글을 그대로 `sources/<id>.txt`로 쓴다. `path`: 작가가 고른 파일 하나를 `sources/<id>.<확장자>`로 복사한다. 절대 경로, 링크가 아닌 보통 파일, 10MiB까지다. 결과 `read`에 읽은 경로·바이트 수·hash가 온다 — 작가가 고른 파일만 넘기고, 읽은 것을 작가에게 알린다.
- 원본은 한 번만 쓴다. 같은 id가 있으면 `SOURCE_EXISTS`다. 고칠 수 있는 것은 설명서(`sources/<id>.yaml`)뿐이고, 설명서를 바꾸면 그 자료를 쓴 노드가 "다시 확인 필요"가 된다.
- `reliability`: `low`·`medium`·`high`. `low` 자료에만 기댄 주장은 `sources.reliability`가 알린다.
- `spans`: `[{ id, quote }]` 인용 구간. 글 자료(.txt·.md)는 인용이 글에 있어야 한다. 글이 아닌 자료(PDF 등)는 엔진이 글을 읽지 않으니 **spans의 인용만** 근거로 쓸 수 있다.
- 노드가 자료를 쓰게 하려면 그 노드(또는 윗노드) 앞머리에 `sources: [id, ...]`를 적는다(작가가 파일을 고친다). 그러면 요청 payload의 `sources`에 설명과 spans가 실린다. 원본 글은 `folio_sources { op: 'get', id }`로 읽는다.

## 주장 잇기

1. **쓰는 중**: 추출 요청에 `evidence.wanted: true`가 있으면 답 JSON에 `claims`를 넣는다: `[{ "quote": 원고의 주장 문장, "sources": [{ "sourceId", "quote": 자료 인용 }] }]`. 받치는 자료가 없으면 `"sources": []`. 커밋이 끝나면 기록된다.
2. **커밋된 노드**: `folio_sources { root, op: 'link', nodeId, claims }`. 대조 대상은 지금 파일 본문이다. 한 노드의 새 목록이 앞 목록을 대신한다. 빈 목록은 "주장 없음"이다.
- 주장 인용은 원고(코드 블록 밖)에 그대로 한 번 있어야 한다. 여러 번 있으면 `before`·`after`로 좁힌다.
- 틀린 인용이 하나라도 있으면 아무것도 기록되지 않는다(`EVIDENCE_INVALID`, `details.errors`의 `index`·`link`·`code`). 추출 답이면 다시 묻는다.
- 자료에 없는 근거를 지어내지 않는다. 근거가 없으면 없다고 적고, 엔진의 참고 의견을 작가에게 보여 준다.

## 본문이 바뀐 뒤

- 엔진이 주장 인용 + 앞뒤 문맥으로 다시 찾는다(등장 위치와 같은 규칙). 못 찾은 것은 `folio_status`의 `evidence.stale`에 나온다(다른 "다시 확인 필요"와 한곳에서 본다. `folio_sources { op: 'list' }`의 `evidence`도 같은 값). 그 노드의 주장을 다시 `link`한다. `evidence` 기능이 꺼져 있으면 `evidence`는 `null`이다.
- `folio_sources { op: 'get', id }`의 `links`는 그 자료에 걸린 주장과 상태(`located`·`relocated`·`stale`), 연결마다 `verified`(지금 자료에 그 인용이 있는가)를 준다.

## 검사

| 검사 | 종류 | 알리는 것 |
|---|---|---|
| `sources.claim-supported` | 결정론 | 확인된 근거가 없는 주장(`CLAIM_UNSUPPORTED`) |
| `sources.numbers-match` | 결정론 | 주장의 숫자·연도가 연결된 자료 인용에 없음(`NUMBER_NOT_IN_SOURCE`) |
| `sources.reliability` | 결정론 | `low` 자료에만 기댄 주장(`LOW_RELIABILITY_ONLY`) |
| `sources.conflict` | 모델 | 연결된 자료끼리 어긋남 |
| `sources.claims-found` | 모델 | 주장으로 표시 안 된 사실 문장(원고 인용 필요) |

- 모두 참고 의견(advisory)으로 시작한다. 참고 의견으로 원고를 고치지 않는다.
- 작가가 원하면 `checks: { sources.claim-supported: { severity: block } }`처럼 올린다(`hard`는 안 된다). 그러면 넘기려면 작가의 이유가 필요하다.
- 세트를 빼거나 `mode: off`로 끄면 그 검사는 돌지 않는다. `core.promise-order`·원고 hash·영수증 잠금은 그대로다.

## 오류일 때

- `EVIDENCE_INVALID`: 주장 하나라도 틀려 아무것도 기록되지 않았다. `details.errors`마다 고쳐 다시 낸다(`CLAIM_QUOTE_NOT_FOUND`·`CLAIM_AMBIGUOUS`·`CLAIM_DUPLICATE`·`CLAIM_SOURCE_UNKNOWN`·`CLAIM_SOURCE_QUOTE_NOT_FOUND` 등).
- `SOURCE_EXISTS`·`SOURCE_IMMUTABLE`: 그 id(또는 원본 이름)가 이미 있다. 다른 id로 더하거나, 설명서만 고칠지 작가에게 묻는다.
- `SOURCE_PATH_INVALID`·`SOURCE_TOO_LARGE`: 경로가 절대 경로의 보통 파일이 아니거나(링크·폴더·없음) 너무 크다. 작가에게 알린다.
- `SOURCE_SPAN_NOT_FOUND`·`SOURCE_SPANS_INVALID`·`SOURCE_INPUT_INVALID`: 입력을 고쳐 다시 낸다. 아무것도 쓰이지 않았다.
- `SOURCE_NOT_FOUND`·`SOURCES_ARGS_INVALID`: id나 인자를 확인한다.
- `FEATURE_DISABLED`: 작가가 끈 기능이다. 켤지는 작가에게 묻는다.
- `SOURCES_DIR_INVALID`·`SOURCE_FILE_INVALID`·`SOURCE_META_INVALID`: `sources/`가 링크거나, 원본이 링크(하드 링크 포함 — 이름이 둘 이상인 파일)거나, 설명서(yaml) 모양이 틀렸다. `openWork`가 `WORK_INVALID`로 던져 **작품 전체**가 열리지 않는다 — `features.sources: false`로도 풀리지 않는다. 작가에게 `sources/`를 보통 폴더·보통 파일로 고치라고 알린다.

세계관 주장 채택·관점·의존성·미해결 질문은 [정본 흐름](lore.md)의 별도 작가 승인 판본으로 관리한다. 자료 인용 연결이나 추적 관찰만으로 정본을 채택하지 않는다.
