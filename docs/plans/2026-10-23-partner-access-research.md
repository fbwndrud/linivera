# 파트너 접근 경로 조사 기록

확인일 2026-10-23(Asia/Seoul). 조사판 `linivera-access-v1`.
공식 문서·공급자 소스만 실행 계약의 근거로 사용했다. 공개 웹 읽기만 수행했으며 계정 가입,
인증, 키·쿠키·토큰 조회, MCP 설치/실호출, 유료 생성/구독/게시를 수행하지 않았다.
37개 전원의 경로별 조사 현황·공식 시작점은 [파트너 표](../partner-access.md)에 보존한다.
홈페이지의 제품/API/MCP 링크 발견은 상세 인증·요금제·현재 계정 준비의 확인이 아니다.

## 결정과 확인 경계

- 기존 capability identity를 접근 경로별 registry가 참조한다. API 키·웹 세션·MCP OAuth는
  서로 독립이며 하나의 로그인 사실로 다른 경로를 준비 완료로 하지 않는다.
- 모든 파트너를 위해 별도 실행기/스킬을 만들지 않는다. 이미 충분한 공식 Meshy 도구를
  호스트 callback으로 재사용하고 실제 리니베라 MCP로 결과의 보관을 확인한다.
- 계정 실점검 대신 합성 도구 fixture를 사용한다. `synthetic-fixture`는 명시된 테스트
  경계이며 실제 공급자 인증·잔액 확인이 아니다. 사용자 선언도 관측 확인으로 승격하지 않는다.
- 설치·호스트 노출·인증·기능 권한·요금제·잔액은 별도다. 비밀값 원문을 저장하지 않고
  상태·비밀이 아닌 account/project 별칭·확인 시각·정확 판본의 근거만 보존한다.
- 과거 상태 기록을 삭제하지 않는다. 현재 작업은 새 점검·정확 identity·만료를 확인한다.
  300초 수명은 로컬 정책이며 공급자 보증이 아니다. 내부 실행 승인·권리 보고는 별도다.

## Chroma 크레딧

[공식 pack](https://submit.chromaawards.com/pack)의 당일 재조회는 HTTP 403이다.
기존 명단 37개를 보존하며 새 참여·할당량을 확인했다고 쓰지 않는다. 웹/API/MCP 적용 여부,
등록/활성화 조건, 계정·지역·프로젝트 제한, 사용/청구 기한과 제공분 만료는 전원 미확인이다.
일반 공급자 잔액의 조회 성공도 Chroma 할당을 입증하지 않는다.

## Meshy 공식 경로

[AI integration](https://docs.meshy.ai/en/api/ai)은 npm `@meshy-ai/meshy-mcp-server`와
[공식 연결 source](https://github.com/meshy-dev/meshy-mcp-server),
[REST 직접 호출 skill](https://github.com/meshy-dev/meshy-3d-agent)을 안내한다.
MCP는 외부 assistant가 Meshy를 호출하는 래퍼이며 제품 내부 외부 MCP 수신 기능이 아니다.
API와 동일 권한·크레딧·rate limit을 따른다. `meshy_list_usage`의 Studio/Enterprise 제한을
일반 생성 권한과 구별한다. 설치 명령을 실행하지 않았고 실계정 상태는 미확인이다.

[Authentication](https://docs.meshy.ai/en/api/authentication)은 Bearer API key, 선택 월간 키 지출
한도와 IP allowlist를 설명한다. [Balance](https://docs.meshy.ai/en/api/balance)는 무료 읽기
조회, 팀 pool과 사용자/워크스페이스 한도, 월간/영구 크레딧과 월간 만료를 구별한다.
잔액 숫자만으로 모델별 작업 비용·요금제·권한을 확정하지 않는다.

소스 조사 시 [package.json](https://github.com/meshy-dev/meshy-mcp-server/blob/main/package.json)은
0.6.5였다. mutable `main`의 조사 스냅샷이며 npm 배포물과 실제 설치 tool schema의 일치를
검증하지 않았다. 실행 전 실제 version/tool schema를 재확인하고 불일치는 차단한다.

| 공식 source | 이번에 사용한 교집합 | 차이·미확인 |
|---|---|---|
| [schemas/generation.ts](https://github.com/meshy-dev/meshy-mcp-server/blob/main/src/schemas/generation.ts) | meshy_text_to_3d prompt 2~800, ai_model meshy-7.1, target_formats, should_remesh | 기존 REST 대표 prompt 최소1과 도구 최소2가 다름; 도구 경로에서 더 좁은 조건 사용 |
| [tools/generation.ts](https://github.com/meshy-dev/meshy-mcp-server/blob/main/src/tools/generation.ts) | mode 입력 없이 preview 고정·moderation:false 내부 request 설정, task_id/status 생성 결과 | source 사실이며 실제 HTTP 관측이 아님; 숨은 설정을 사용자의 입력으로 위조하지 않음 |
| [schemas/tasks.ts](https://github.com/meshy-dev/meshy-mcp-server/blob/main/src/schemas/tasks.ts) | task_id, optional task_type; status wait; download format/save_to | 다운로드 format은 생성된 형식에 한함; print_ready는 로컬 변형하므로 이번 미사용 |
| [schemas/output.ts](https://github.com/meshy-dev/meshy-mcp-server/blob/main/src/schemas/output.ts) | structuredContent task 상태·잔액 | TIMEOUT은 작업 취소/실패가 아닌 기다림 종료 |
| [tools/tasks.ts](https://github.com/meshy-dev/meshy-mcp-server/blob/main/src/tools/tasks.ts) | status, local_path/file_size_bytes, 다운로드 실패의 URL-only 반환 | isError가 없어도 파일 확보 실패 가능; local bytes/hash를 별도 확인 |
| [tools/balance.ts](https://github.com/meshy-dev/meshy-mcp-server/blob/main/src/tools/balance.ts) | 무료 meshy_check_balance와 ISO monthly_resets_at | 팀 사용기록 도구는 plan 제한; raw 응답을 인증 증거로 무조건 저장하지 않음 |

대표 실행은 preview/meshy-7.1, `include_textures:false`를 명시적으로 선택한다. 후자는
공급자 기본값이 아니라 리니베라 호스트의 좁은 다운로드 선택이다. 실제 texture 의존성·내부
호환성·복원은 미검증이다. signed URL 또는 공식 도구 성공만으로 Resource 보관 완료가 되지 않는다.
다운로드 재시도는 기존 task를 사용하며 생성 재호출을 자동 수행하지 않는다.

## ElevenLabs 경로와 공식 설명 차이

[MCP 안내](https://elevenlabs.io/mcp)는 hosted OAuth와 local API-key MCP를 구별한다.
상단은 Creative 생성까지 소개하지만 FAQ는 Agents 관리 중심이다. 지원 assistant 설명도
상단/FAQ 범위가 다르다. 이 차이를 미해결로 보존하며 hosted 도구가 기존 timestamps API를
동일 schema로 지원한다고 추정하지 않는다. 같은 페이지의 CLI/skill 안내도 발견했지만
해당 실행 schema·설치판본·실제 권한은 미확인이다.

[로컬 공식 repo](https://github.com/elevenlabs/elevenlabs-mcp)는 별도 API-key 경로다.
[timestamps endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)는
기존 multilingual_v2/MP3 대표 API 명세의 근거다. voice/모델 접근과 codec/retention별 plan 조건은
계정마다 확인한다. 대표 명세 외 codec·hosted MCP·CLI와 동일한 권한이라 추정하지 않는다.

## Runware 재사용 경로

[인증](https://runware.ai/docs/models-api/authentication): 계정별 키, 프로젝트/환경별 키,
HTTP REST와 WS 접속. [MCP](https://runware.ai/docs/tools/mcp): 외부 공급자 호출 서버;
remote OAuth 2.1이지만 최초 공급자 화면에서 API key를 입력하고 local 경로는 환경 인증이다.
비용은 동일 Runware 계정 잔액에 부과된다. 웹 로그인만으로 인증을 충족하지 않는다.
[CLI](https://runware.ai/docs/tools/cli)와 [skills](https://runware.ai/docs/tools/skills)도 공식이며,
skill은 실행 transport가 아닌 절차다. 모델 schema 확인과 읽기 점검을 우선 재사용할 수 있으나
Runware 실행기·기능 명세·계정 실점검을 이번에 새로 구현하지 않았다. 호스트별 설치 지침은
호스트의 최신 기능을 별도 확인해야 한다.

## 다른 공식 경로의 부분 확인

아래는 해당 공개 페이지의 좁은 발견 범위다. 전부 모델/endpoint별 실행 명세는 미구현이며
계정 인증·요금제·크레딧·Chroma 적용은 별도 확인해야 한다.

- [Martini MCP](https://www.martini.film/docs/mcp): 외부 agent→Martini, full/core profile;
  core에는 직접 생성이 없다. CLI와 계정/project/olive 제한을 구별한다.
  [Blender skill](https://www.martini.film/skills/blender)은 공식 절차이며 별도 Blender MCP에 의존한다.
- [Hyper3D Rodin MCP](https://hyper3d.ai/features/mcp): 외부 agent→공급자,
  browser 로그인·client 확인·billing workspace 선택/승인을 안내한다.
- [Magnific MCP](https://www.magnific.com/mcp): 외부 MCP와 제품 내부 Agents 방향을 구별한다.
  유료 plan의 웹 무제한과 MCP 생성 크레딧은 다르며 잔액 조회는 무료다.
- [Creatify MCP](https://creatify.ai/features/mcp): 공식 제품 소개 발견; 상세 auth/schema/plan 미확인.
- [SpriteCook agent 연동](https://www.spritecook.ai/agents): 공식 plugin·계정 sign-in 경로 발견;
  설치가 생성 권한/크레딧을 입증하지 않음. 상세 protocol/tool schema 미확인.
- [CapCut×Codex](https://www.capcut.com/tools/capcut-x-codex): 공식 plugin 소개 발견;
  이를 임의의 MCP/일반 API로 분류하지 않음.

그 외 표의 공식홈은 웹 또는 API/CLI 링크 발견까지만 확인했다. Kling robots 차단,
ReelShort 403, Luma markdown 수집 실패, Escape 본문 미확보도 그대로 기록했다.
Fixed Seed의 `.ai`, Reactor의 `.ai` 후보 조회 실패 후 공식 검색에서 각각
[fixedseed.com](https://fixedseed.com/)과 [reactor.inc](https://www.reactor.inc/)를 확인했다.
Ashurst 명칭은 [공식 소개](https://www.ashurstperkinscoie.com/en/who-we-are/about-us/)를 사용했다.
현재 팩 접근 실패 때문에 이 홈페이지 조사를 파트너 자격·크레딧의 최신 재확인으로 사용하지 않는다.
