# Linivera 제작 하네스 감사·도입 결정

> 후속 관점 보정: 이 초기 감사는 기존 집필 흐름에 영상 하네스를 이식하는 문제로 범위를 좁게 보았다.
> 사용자가 의도한 공유 원본 기반의 새 제작 확장팩은 **추진할 가치가 있다**.
> [모션 영상 제작 확장팩 검토](2026-10-21-motion-production-extension.md)가 해당 제품 판단과 접합안을 보완한다.
> 아래의 실제 코드·검사·증거 한계는 당시 감사 기록으로 유지한다.

2026-10-21 한국 시간. **초기 이식 범위의 결정: 선택적 도입.** 현재 실행·기록·승인 구조는 유지한다.
실제 입력 보존, 참조 역할, 비용 큰 결정 전 작은 시안 검토, 결과 식별·복구 절차를
호스트 운영에 적용할 가치가 있다. Python 조정기·영상 12단계·전역 공급자 순위·4점
문턱의 전면 이식은 보류한다. 아래 시범 규약은 엔진에 새로 구현된 기능이 아니다.

## 1. 사실·범위·신뢰 경계

- 지정 대상: `/Users/lyoojk/folio`, `feat/n3-blocks`, HEAD `0bf95e1`, package `folio@0.0.0`.
  수정·미추적 파일 142개를 SHA-256으로 보존 확인했다. 기능 판단은 HEAD만이 아닌 현재 작업 트리 기준이다.
- 읽기 전용 소스: `/Users/lyoojk/ai-content-studio`, HEAD
  `60291fac9a5122667a67d30bbd3b7fca4d82e909`. 요청 기준과 일치한다.
  미추적 `projects/off-duty-pattern/`은 제외했다. `2b4dba9` 대비 변경도 확인했다.
  v1 10단계에서 v2 12단계와 프롬프트·출력 검토 계약을 추가한 상태다.
- **checkout 차이:** `git worktree list`와 [기존 전략](2026-10-18-linivera-ai-picturebook-strategy.md)의
  경로를 따라 `/Users/lyoojk/.codex/worktrees/dynamic-tracking/folio`도 읽기만 했다.
  `codex/production-ready`, HEAD `e7516d1`, package `linivera@0.1.1`이며 이곳 역시 미커밋 변경이 많다.
  이 작업 트리의 구현을 HEAD·배포본의 검증 완료 기능으로 단정하지 않는다. 전환·병합하지 않았다.
- `AGENTS.md`가 정본으로 지정한 착수 계획서 아티팩트는 기존 계획의 URL로 접근을 시도했으나
  열리지 않았다. 이번 기록은 정본을 대체하지 않으며 큰 구조 변경의 승인이 아니다.
- 아키텍처·프롬프트/매체·증거/게이트를 세 에이전트가 분담했다. **동일 호스트의 역할 분리
  검토이며 실제 독립 감상·청취나 외부 검증이 아니다.** 새 문서는 별도 비평자가 재검토했다.
- 소스 스킬, 지정 문서 4종, 주요 Python 4개, 설정 4개, 프롬프트 17개 전문과 테스트를 조사했다.
  역사 프롬프트는 faces-v8 4개·final-v7 6개·auditions-v3 6개, 총 16개 원문을 읽었다.
  이력 55개는 경로·현재 바이트 해시를 모두 대조했다. 55개 전문을 이번에 전부 재독한 것은 아니다.

## 2. 실제 작품 유형과 실행 경계

| 범위 | 지정 cwd의 실제 구현 | 제작·검토에서 필요한 것 |
|---|---|---|
| 소설·연재·단일 장면·동화 | `packs/novel/pack.yaml`의 계획→원고→추출→검사→작가 결정→커밋 | 인과·설정·문체·독자 반응. 영상의 3초 훅/무음 전달 강제 금지 |
| 그림책 | book→spread, 읽을 글/그림 설명, 별도 이미지 자산 | 글·그림 분담·페이지 넘김·최종 크기 확인. 원고 저장과 완성 책을 구별 |
| 교재·역사·안내서·자료 책 | `packs/knowledge/pack.yaml`, sources 팩 | 정의·선수 개념·학습 목표·인용·숫자·독자 행동. 귀여움/감동 점수 강제 금지 |
| 이미지 자산 | `folio_assets`, 이미지 MIME 6종, 파일 20MiB 이하 | 호스트 생성/시각 검토, 파일 사본·버전·사용 위치·작가 승인 |
| 음성·음악·영상 | 지정 cwd에 제작 경로 없음 | Fish/Suno/Remotion을 공통 필수 단계로 도입할 이유 없음 |

진입점은 `bin/folio-mcp.js`의 stdio MCP와 `skill/folio/SKILL.md`다.
`core/run/steps/common.js:39`는 모델 요청·digest를 저장하고 호스트에 돌려준다.
core는 모델·네트워크를 호출하지 않는다. 소스도 Codex 내장 이미지 생성, 지원 CUA,
로컬 렌더를 **호스트가** 실행하며 Python은 조정기다. API 키가 필요한 무인 제작 서비스가 아니다.

지정 cwd는 뷰어·Web/EPUB·직접 PDF 제작을 제공하지 않는다(`docs/compatibility.md`).
반면 별도 production-ready 작업 트리에는 `folio_image`, Studio, Web/EPUB 내보내기,
자료/입력/operation 관리가 있다. PDF는 직접 생성이 아닌 Web의 브라우저 인쇄 경로다.
원본 문서·구조화 데이터·이미지 리소스 지원과 음성/영상 제작 레시피 지원도 구별해야 한다.
따라서 지정 cwd의 한계만으로 Linivera 전체를 평가하거나 최신 기능을 다시 구현하면 안 된다.

## 3. 중복과 접합점

| 공통 후보 | 이미 있는 접합점 | 결정 |
|---|---|---|
| 브리프·선택 | `core/interview/`, `core/lore/`, `core/run/payload.js`의 확인 프로필·계획 | 기존 저장을 재사용. 매 작업마다 새 인터뷰/3안 승인 의무화 금지 |
| 티켓·답·재개 | `core/run/steps/common.js`, `runner.js`, requestId/digest/pending | Python `state.json`을 두 번째 정본으로 만들지 않음 |
| 자산·해시·수정 이력 | `core/assets/change.js`, `files.js`, `records.js` | 불변 사본과 추가만 되는 기존 기록장 유지 |
| 검토 범위·무효화 | `review-context.js`, `core/scope/`, `core/evidence/` | 원고·자산·엔티티·자료 revision을 재사용. 선형 영상 단계 전체 무효화로 대체하지 않음 |
| 승인·복구 | `core/run/commit-guard.js`, `commit-locks.js`, `docs/recovery.md` | hard/영수증/hash/자기검토/soft 비자동수정 잠금 유지 |
| 실제 서비스 필드·생성 이력 | 지정 cwd의 자산 `origin`은 provider/imageId/model만 허용 | 설명서를 실제 전송 프롬프트라고 보고하지 않음. 임의 중첩 필드 추가 호출 금지 |
| Resource·입력·operation | production-ready의 `core/resources/input-snapshots.js`, `core/operations/requests.js`, `trace.js` | JSON Resource로 실제 입력 보존→입력 snapshot→기존 operation에 결속하는 규약을 우선 검토 |

보조 작업 트리의 입력 snapshot은 선택 revision과 profile/pipeline/policy bytes·hash·checkpoint를
봉인한다. operation은 같은 `idempotencyKey`의 로컬 operationId를 재사용하고 다른 요청 충돌을
거절하며, 제출 때 request/input/output revision을 대조한다. `reportedTrace`는 호스트 보고다.
이 구조가 있으므로 신규 자산 레지스트리·범용 레시피 프레임워크·생성 영수증 엔진은 지금 만들지 않는다.
다만 이 기능을 지정 cwd에서 호출할 수 있다고 안내해서도 안 된다. 후속 구현 기준 checkout을 먼저 정한다.

## 4. 실제로 작품에 기여하는가

**사실:** 소스의 `docs/proven-production-process.md`와 umbrella-friend의 review-history,
v7 대사·v8 얼굴 수정 근거에는 사용자 피드백에 따른 인과·동작·음성·입 가시성 개선이 남아 있다.
짧은 오디션/동작 실험 후 양산하고, 실제 결과의 문제를 수정한 방법에는 재사용 가치가 있다.

**추론:** 잘못된 컨셉·참조·문체를 비싼 일괄 제작 전에 발견하면 재작업을 줄일 수 있다.
그림책은 전체 삽화 전 대표 펼침면 러프, 안내서는 대표 절의 독자 행동/근거 확인,
소설은 대표 장면의 인과·목소리 확인이 영상의 motion-probe/animatic보다 적합하다.

**미검증:** v2 새 작품 종단 제작, 새 프롬프트/서비스 A/B와 사용자 취향 보정은 없다.
46개 테스트·기존 작품 승인·정교한 표는 새 작품의 감동·독창성·최고 품질을 증명하지 않는다.
모든 노드에 12단계·복수 reviewer·4점 채점을 붙이면 기록 비용만 커질 가능성이 높다.
평가할 것은 입력 누락/실제 결함/재생성·재작업 시간/사용자 선호이고 문서량이 아니다.

## 5. 프롬프트 17개와 과거 선택의 효력

17개는 완성된 서비스 입력 모음이 아니라 **제작 지시 12개+서비스 계약 3개+critic 2개**다.
실제 literal fields는 호스트가 현재 도구에 맞게 채운다. 필드 문법/현재 서비스 기능은 이번에 재실행하지 않았다.

| `harness/prompts/` 파일 | 평가·Linivera 적용 범위 |
|---|---|
| preflight.md | 목적·독자·지각 가능 여부를 기존 인터뷰와 연결. 영상 길이/비율은 전역값 아님 |
| script.md | 서로 다른 선택과 인과 검토에 유용. 매 원고의 3안/3초 훅은 불필요 |
| lookdev.md | 실루엣·재질·참조 역할·최종 크기 기준을 삽화에 활용. 입/리그는 작업별 선택 |
| motion-probe.md | 접촉·가림·완전한 동작 주기 검토. 움직이는 매체 전용으로 보류 |
| story-lock.md | 선택/정확한 문장/행동/해시 결속은 유용. 기존 정본·revision 구조에 맞춰 사용 |
| voice-audition.md | 같은 문장·역할로 짧게 듣고 결정. 오디오 작업이 있을 때만 적용 |
| music-sketch.md | 구체 모티프와 혼합 청취. 기존 작품의 잔잔한 음악 선호를 공통값으로 옮기지 않음 |
| animatic.md | 양산 전 전체 저비용 시안. 그림책은 펼침면 러프의 연속 읽기로 치환 가능 |
| voice-production.md | canonical cue·선택 음색·재사용 관리. 현재 글/이미지 작업에는 불필요 |
| assemble.md | 좌표·입·대사/가사·믹스·전환. 영상 조립 전용 |
| final-review.md | 실제 인코딩 영화의 전체 3 pass는 타당. 글/이미지에 음성 검토 의무화 금지 |
| package.md | 실제 모델·기여·미확정 이용 범위 보존에 유용. 제출/공개 허용 판단과 분리 |
| service-image.md | 실제 전체 prompt/options·참조 역할·유지/변경·성공 기준. 가장 직접적인 도입 후보 |
| service-voice.md | voiceId/text/spokenText와 sfx 분리. 실제 전송 문자열 전체 검증에는 잔여 공백 |
| service-music.md | Styles/Lyrics/instrumental 분리. 현재 UI·모델/내보내기를 다시 관측해야 함 |
| prompt-critic.md | 생성 전 literal fields·참조·현재 정본·출력 테스트 검토. 비용 큰 선택 앞에 활용 |
| critic.md | 제작자 점수보다 실제 출력 먼저, 관찰불가 표기. 사람의 취향 판단은 대체하지 못함 |

v8의 편집 대상/identity 참조 분리와 유지·변경 범위는 좋은 방법이다. 특정 아빠/아이/빨간 친구,
좌측 입/픽셀 수, 목소리·곡은 공통 제약이 아니다. 이력 55개 해시는 일치했지만 이는 채택 효력을
뜻하지 않는다. `prompt-history.json`의 selected/replaced/unsuccessful과 최신 대사/편집을 읽어야 한다.
v3의 긴 대사 원문을 재사용하면 v7에서 '응!'만 남긴 편집을 되돌릴 수 있다.

## 6. 게이트의 실제 보장과 오판 가능성

- **오래된 증거:** 소스 v2는 요청·provider·참조/출력 bundle과 리뷰 해시를 결속하고 실제 매체
  디코딩·길이·검토 모드를 확인한다(`quality_contract.py`, `media_check.py`). 다른 출력·오래된
  packet·최종 영화 3 pass 중 누락/부분 구간은 검사로 거절한다. 이 보완은 v1보다 유효하다.
- **정직성:** `identity_review`는 ID가 다르고 실행 근거 JSON이 맞는지 검사한다. 파일을 쓴 주체가
  실제 다른 사람/에이전트인지, 실제 보고 들었는지 증명하지 않는다. actual 플래그·자기 점수·관찰
  문장도 선언이다. 악의적 재작성과 같은 로컬 권한의 기록장 전체 위조를 암호학적으로 막는 체계가 아니다.
- **재사용 선언:** `validate_prompt_use`는 `externalActions=0`이면 literal prompt 승인 검사를
  건너뛰고 receive가 reuseEvidence 파일을 요구한다. 실제 재사용인지·과거 생성 입력이 현재 목적에도
  적합한지는 호스트 보고에 의존한다. 출력 검토는 계속 필요하며 전체 게이트 우회를 뜻하지 않는다.
- **직접 재현한 잔여 공백:** `quality_contract.py:100`은 `spokenText in fields.text`를 검사하고
  104행은 spokenText만 canonical cue와 대조한다. 합성 canonical=`지금 같이 해 보자.`에
  literal=`내가 알려줄게. 지금 같이 해 보자.`를 주면 `prompt_packet`이 수락했다.
  **전체 approve/receive 우회나 실제 서비스 발화 성공을 증명한 실험은 아니다.** 별도 prompt critic과
  청취가 잡아야 한다. 방향 지시/발화를 구분해 실제 전송문을 canonical로 렌더링·대조하는 개선이 필요하다.
  Fish 현재 문법 확인 없이 괄호 제거 정규식을 보편 해법으로 이식하지 않는다.
- **대상의 잔여 공백:** `core/assets/schema.js:39`와 `change.js:75`는 필수 checked 목록과
  현재 hash를 검사하지만 빈 findings도 수락한다. 실제 이미지 관찰 증명/형식 디코딩은 없다.
  `contentVerified`는 바이트 일치다. `sameHost:true, independent:false`는 엔진이 고정한다.
  원고 체크도 `core/checks/run-checks.js:67`에서 같은 표기를 고정한다. 역할 분리로 이를 바꾸지 않는다.
- **충분한 검토 입력:** 소스 critic packet은 brief·현재 입력·실제 파일·검토 모드/범위를 주고
  제작자 점수를 제외한다. 다만 script의 concept_comparison에는 선택 이유가 있어 완전 blind가 아니다.
  대상 원고 packet에는 원고·상위 계획·설정·자산·근거가 있다. 자산 get의 경로는 실제 열어 봐야 한다.
  첫 감상에는 제작자 점수 없이 전체 원고/이미지와 사용 크롭을 주고, 이후 정본/설명과 대조한다.
  못 보거나 못 들으면 미관찰로 남기고 빈 지적으로 통과시켰다고 보고하지 않는다.

## 7. 중단·재개·중복 생성

소스 `next`는 같은 티켓을 반환하고 예산을 미리 예약한다. 실패·불확실 결과도 예약량을
소비한 상태로 둔다. 그러나 `handoff`의 구조화 저장은 reason/at 수준이고 결과 ID·스크린샷·
unknown outcome은 주로 문서 규약이다. actionId 중복 검사는 한 receipt 내부이며 서비스 전역 보장이 아니다.

생성 전 requestId/실제 입력을 저장하고, 결과가 생기면 서비스 결과 ID·안전한 URL·로컬 파일 hash를
즉시 보존한다. 응답/다운로드만 끊기면 기존 페이지·결과·파일을 조회한 뒤 이어간다. 성공 여부 미상에서
새 생성 금지, 확인 불가면 handoff한다. 로컬 멱등키는 서비스 생성 버튼의 중복 과금 방지 키가 아니다.
이미지 파일 인계 재시도와 서비스 생성 재시도를 구별한다.

지원 CUA의 현재 문서를 따르고 UI는 재관측한다. 사설 endpoint/쿠키 추출/자체 드라이버를 추가하지 않는다.
로그인·CAPTCHA·구매·약관 동의는 해당 작업을 멈추는 조건이다. 로컬 SVG/합성 입력 검증에는 계정이
필요 없지만 로그인 브라우저 경로는 계정·도구·내보내기 권한이 필요하다. API 키 없는 경로도 무료라는 뜻은 아니다.

## 8. 공급자 선택의 범위

`benchmark.py`는 최소 세 다른 과제, 전체 평가 축, canonical prompt/context/provider 해시,
실제 출력·기술/이용 목적 검토와 v2의 별도 reviewer 선언·전체 구간을 요구한다.
하지만 canonical hash가 같아도 실제 UI 변환 필드·후보 수·재시도·음량 조건이 같았다는 보장은 없다.
변환 원문, 서비스별 실제 입력, 참조·언어·크기/길이·후보/수정 예산과 관찰 비용을 함께 보존해야 한다.

‘검증된 최선’ 대신 **특정 과제·매체·목적·스타일·언어·provider/model revision·프롬프트/recipe
버전에서 비교한 선택**이라고 쓴다. 3과제·4점·평균 0.15 차이는 통계적 우월성/사용자 취향 보정이 아니다.
새 서비스를 등록한 사실과 실행/품질 검증을 구별한다. 이용 허용 범위는 현재 미확정이며 적법·제출 가능으로
판정하지 않는다. 새 어댑터 문서에는 지원 인터페이스, 필요한 계정/권한, 관측 모델/미상 사유, 비용/쿼터,
사용 목적별 이용 범위 확인 상태/날짜/근거, 결과 식별·재개·실패·내보내기 경로를 포함해야 한다.

## 9. 단계적 적용안 — 문서 규약부터

1. **현재 선택적 운영:** 명확한 브리프/선택은 재질문하지 않고 기록한다. 비싼 양산 전 대표 시안만
   검토한다. 실제 이미지 입력에는 fields/options, 참조별 역할·경로/hash/revision, 유지/변경/관찰 가능한
   성공 기준을 남긴다. 실제 사용하지 않은 옵션이나 필드를 만들어 쓰지 않는다.
2. **작품별 최소 기록:** operation/requestId, 대상 node/asset revision, 실제 입력, 입력 참조,
   사전 검토자/관찰/미관찰, 결과 ID·원본/편집 구분·출력 hash, 수집 방법, 미완료 상태/복구 다음 행동,
   실제 비용/시간 또는 null과 사유를 보존한다. 결과 검토·작가 결정을 별도로 둔다.
   실제 작품 공간에 저장하며 코드 저장소에 작품/생성물을 커밋하지 않는다.
3. **production-ready 경로:** 실제 입력 JSON을 기존 Resource로 보존하고 입력 snapshot과 operation에
   연결한다. 서비스 식별/중단 기록은 reportedTrace의 호스트 보고로 남긴다. 엔진이 필수 필드·정직성을
   인증했다고 주장하지 않는다. snapshot에는 실제 사용자 선택된 revision/profile/pipeline/policy가 필요하며,
   operation은 기존 policy·grant 권한 범위 안에서만 시작한다. 호스트가 새 JSON을 사용자 선택으로
   자동 채택하지 않는다. 지정 cwd에서는 별도 작업 노트만 가능하며 내부 `.folio/`를 손으로 쓰지 않는다.
4. **반복 수요 뒤의 작은 변경 후보:** 사용 checkout과 정본 대응을 확정한 뒤 기존 operations/resources
   위에서 literal input 필드 검사, unknown outcome 재생성 차단, 현재 출력과 관찰 범위 결속만 좁게 설계한다.
   구버전 기록은 unknown으로 읽고 자동 재승인/현재 hash 채우기를 하지 않는다. 새 잠금/스키마는 별도 설계다.

기존 집필 흐름에 영상 단계·음성/음악을 일괄 강제하거나 새 점수 엔진/공급자 레지스트리,
조정기를 통째 이식하는 것은 보류한다. 별도 제작 확장팩과 선택적 오디오 Adapter의 도입 판단은
[후속 검토](2026-10-21-motion-production-extension.md)를 따른다.
채택 중단 조건은 사용자 선호·누락/결함/재작업 개선 없이 기록 시간과 질문만 늘어나는 것이다.

## 10. 실행한 검사와 미실행 실험

| 실행한 검사 | 결과·한계 |
|---|---|
| 소스 `python3 -m unittest discover -s harness/tests -v` | 46/46 통과. coordinator/v2 계약·합성 proof 검증이며 신규 제작 품질 증거 아님 |
| 소스 `python3 scripts/validate.py --require-media` | 통과: projects 2/tools 27/assets 62/runs 25/releases 16. 누락 미디어 오류·논리 실패 없음 |
| 역사 prompt 55개 바이트 SHA-256 대조 | 불일치 0. 채택 상태나 실제 서비스 전송/출력 품질의 증명 아님 |
| 합성 canonical/literal 추가 문장 반례 | prompt_packet 수락 확인. 외부 동작 0, 전체 게이트 우회 실험 아님 |
| 대상 `npm run check` | Node 24.19.0에서 lint·typecheck·788/788 통과, 실패/skip 0 |
| 대상 `npm run examples:verify` | 같은 Node 24에서 story/guide/picturebook/fairytale 실제 stdio 합성 실행 4종 통과 |
| 대상 `npm run assets:verify`, `node examples/context.js` | 같은 Node 24에서 합성 SVG 버전/검토/승인/교체, 세계관/인터뷰 실제 stdio 모두 통과 |
| 대상 집중 검사 | 자산·근거·복구 관련 7개 테스트 파일 38/38 통과. 아래 명령, 전체 검사와 중복 집계하지 않음 |

집중 검사 명령:
`node --test test/core/assets-files.test.js test/core/evidence-version.test.js test/run/evidence-binding.test.js test/run/assets.test.js test/run/resume.test.js test/core/ledger.test.js test/core/file-tx-conflict.test.js`.

지원 밖인 기본 Node 23.11.0에서도 전체 788개·예제 검사를 먼저 통과했으나 지원 환경 검증과 혼동하지 않는다.
Node 24는 번들 런타임을 PATH 앞에 두어 실행했다. 로컬 `node@22` 경로는 실제 Node 23을 가리켰다.
새 설치/네트워크·원격 CI·production-ready 전체 테스트는 이번에 실행하지 않았다.
이번 대상 변경은 이 문서 추가뿐이다. 코드·스킬·기존 작품·소스·승인 산출물은 변경하지 않았다.
별도 비평 1회에서 사용자 선택/위임 선행조건과 재사용 선언의 검증 한계 누락을 지적받아 반영했다.
2회차는 해당 수정만 재확인했으며 미해결 지적은 없다. 문서의 상대 링크·공백과 기존 142개 파일 보존도 확인했다.

다음 **오프라인 검증**은 기존 시나리오를 재사용한다. 그림책 합성 펼침면+SVG에서 이미지/설정 변경 시
승인 해제와 오래된 review 거부, 자료 기반 안내서에서 source revision 변경·정확한 인용·근거 stale,
소설 장면에서 hard 차단/soft 비자동수정/중단 재개를 확인한다. 실제 그림의 매력/독자의 이해는 별도다.
실제 입력 Resource/operation 통합 및 브라우저 unknown-outcome 회귀는 아직 수행하지 않았다.

다음 **품질/비용 실험은 미실행 계획**이다. 그림책 한 펼침면과 글 전용 동화 한 장면을 서로 다른 대표
작업으로 고르고, 현행 흐름 A와 실제 입력·참조/유지변경·사전 시안 검토 흐름 B를 비교한다.
같은 브리프·현재 정본·언어/스타일·공급자/관측 모델·도구 조건을 고정한다. 작업×방식당 수정 포함
최대 2회 요청으로 제한한다(이미지 최대 4회+글 최대 4회). 다중 출력 도구면 출력 수/요청 수도 따로 고정한다.
이는 서비스 A/B가 아니라 제작 절차 비교다. 검토/기록은 작업×방식당 최대 20분, 총 80분을 실험 상한으로
제안한다. 상한을 넘으면 숨겨서 계속하지 않고 미완료로 보고한다. 모든 수치는 미측정 실험 제안이다.
생성 전 실제 단가/쿼터와 이 범위를 정해 별도 승인한다. 비용 상한은
`이미지 4회×확인 단가+글 4회×확인 단가+검토/기록 최대 80분`이며 불명은 0으로 계산하지 않는다.
작가는 제작자 점수 없이 A/B 전체를 먼저 읽고 본 뒤 이해·기억·감정·선호와 이유를 답한다.
실제 결함·재생성 수·수정 시간·추가 기록 시간을 함께 비교한다. 사용자 평가와 향상 기준은 실험 전에 합의한다.
공급자 교체 실험은 별도로 세 매체별 과제의 canonical/변환 입력·결과를 같은 조건에서 비교해야 한다.
실제 생성·청취·브라우저 재현·유료 호출·업로드·제출·법적 확인은 이번에 수행하지 않았다.

## 근거 위치

대상: [지원 범위](../compatibility.md), [자산 계약](../assets.md), [복구](../recovery.md),
[제공자 독립 방향](2026-10-04-provider-neutral-assets.md),
[자산 구현 수용 결과](2026-10-04-assets-implementation.md),
[정본·인터뷰 계획](2026-10-18-lore-interview-engine.md), `core/assets/`, `core/run/`, `core/evidence/`.
보조 checkout: `core/resources/input-snapshots.js`, `core/operations/{requests,trace}.js`,
`core/image/runner.js`, `server/tools/definitions.js`, `README.ko.md`.
읽기 전용 소스 `60291fa`: `.agents/skills/content-production-harness/SKILL.md`,
`docs/{production-harness,harness-quality-audit,harness-adapters,proven-production-process}.md`,
`harness/{studio_harness,quality_contract,benchmark,media_check}.py`, `harness/prompts/`,
`harness/config/{recipe,recipe-v1,baseline,prompt-history}.json`, `harness/tests/`,
`operations/harness-quality-validation.json`, `projects/umbrella-friend/provenance/prompts/`와 v8 근거.
