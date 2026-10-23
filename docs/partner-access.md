# 파트너별 사용 경로와 계정 준비

확인일 2026-10-23, 문서판 `linivera-access-v1`. 기존 Chroma 지원표의 37개 명단을 보존한다.
공식 팩은 당일 HTTP 403으로 조회하지 못했다. **37개 전부 Chroma 크레딧의 웹/API/MCP 적용,
활성화 방법·자격·기한은 미확인**이다. 일반 공급자 크레딧과 대회 크레딧을 같다고 보지 않는다.
아래 공식 홈페이지의 공개 경로 발견은 계정 접근권·설치·로그인·잔액 확인이 아니다.

표의 `확인`은 해당 공개 경로 설명만 확인했다는 뜻이고, `발견`은 링크/상품 소개만 확인해
실행 명세·인증·요금제를 조사하지 않았다는 뜻이다. `?`는 미조사·확인 불가이며 부재를 뜻하지 않는다.
`로컬`은 사용자가 합법적으로 확보한 bytes/path를 리니베라에 보관하는 공통 경로다.
공급자가 export를 제공하거나 현재 계정에서 다운로드할 수 있다는 확인이 아니다.
API/CLI/MCP/skill은 공식 출처로 확인한 것만 적었다. 커뮤니티 구현은 이번에 조사하지 않았다.

| 파트너 / 공식 시작점 | 웹 | API | CLI | 공식 외부 MCP | 공식 skill | 수동 export / 다음 확인 |
|---|---|---|---|---|---|---|
| [ElevenLabs](https://elevenlabs.io/mcp) | 확인 | timestamps 확인 | 공식 CLI 확인 | hosted OAuth / local API-key 확인 | elevenlabs/skills 발견 | 로컬; 아래 경로별 차이 |
| [CapCut](https://www.capcut.com/) | 확인 | ? | ? | [Codex plugin 발견](https://www.capcut.com/tools/capcut-x-codex), MCP 여부 ? | ? | 로컬 SRT; plugin 기능·인증 확인 |
| [Cantina](https://cantina.com/) | 확인 | ? | ? | ? | ? | 로컬; 가입·인증·요금제 ? |
| [Runware](https://runware.ai/docs/models-api/authentication) | 계정 확인 | HTTP/WS 확인 | 공식 확인 | remote/local 확인 | 공식 확인 | 로컬; 아래 상세 |
| [Kling AI](https://klingai.com/) | robots 차단 | ? | ? | ? | ? | 로컬; 공식 endpoint·계정 조건 재조회 |
| [OpenArt](https://openart.ai/) | 확인 | ? | ? | ? | ? | 로컬; 가입·인증·요금제 ? |
| [Meshy](https://docs.meshy.ai/en/api/ai) | 계정 확인 | preview 확인 | MCP 실행 bin만 확인 | 공식 npm 확인 | 공식 확인 | 로컬; 아래 상세 |
| [Floyo](https://www.floyo.ai/) | 확인 | 링크 발견 | ? | ? | ? | 기존 ComfyUI 로컬; API 조건 ? |
| [Dreamina AI](https://dreamina.capcut.com/) | 확인 | ? | ? | ? | ? | 로컬; 모델별 조건 ? |
| [Alibaba Cloud](https://www.alibabacloud.com/) | console 확인 | Model Studio 발견 | ? | ? | ? | 로컬; 상품·지역·모델별 조건 ? |
| [Magnific](https://www.magnific.com/mcp) | 확인 | 발견 | ? | 외부 호출 확인 | ? | 로컬; MCP는 유료 요금제·생성 크레딧 별도 |
| [Hyper3D](https://hyper3d.ai/features/mcp) | 확인 | 발견 | 호스트 설치 명령만 | Rodin 외부 호출 확인 | ? | 로컬; browser 승인·billing workspace 선택 |
| [ReelShort](https://www.reelshort.com/) | 403 | ? | ? | ? | ? | 로컬 문서; 배포/제출 조건 ? |
| [Cars24](https://www.cars24.com/) | 확인 | ? | ? | ? | ? | 로컬 brief; 생성 파트너 API로 해석하지 않음 |
| [Ashurst Perkins Coie](https://www.ashurstperkinscoie.com/en/who-we-are/about-us/) | 확인 | ? | ? | ? | ? | 로컬 권리 문서; 서비스별 접근 조건 ? |
| [Fairground](https://fairground.tv/) | creator portal 발견 | ? | ? | ? | ? | 로컬; 제출·권리·계정 조건 ? |
| [Escape](https://escape.ai/) | 본문 확보 실패 | ? | ? | ? | ? | 로컬; 제출·계정 조건 재조회 |
| [FAL](https://fal.ai/models/fal-ai/flux/schnell/api) | playground 발견 | FLUX schnell 확인 | ? | ? | ? | 로컬; 아래 상세 |
| [Creatify](https://creatify.ai/features/mcp) | 확인 | 발견 | ? | 공식 소개 발견 | ? | 로컬; API와 MCP별 auth·plan·credits ? |
| [MiniMax](https://www.minimax.io/) | 확인 | 발견 | ? | ? | ? | 로컬; 코드/음성/영상 상품별 조건 ? |
| [PixVerse](https://pixverse.ai/en) | 확인 | 발견 | 공식 링크 발견 | ? | ? | 로컬; CLI·API별 계약 ? |
| [LTX](https://ltx.io/studio) | Studio 확인 | ? | ? | ? | ? | 로컬; Studio/모델 API 구분 조사 필요 |
| [TapNow](https://www.tapnow.ai/) | 확인 | ? | ? | ? | ? | 로컬; 제품 내부 agent가 외부 MCP 제공을 뜻하지 않음 |
| [Wonder Studios](https://wonderstudios.com/) | platform 발견 | ? | ? | ? | ? | 로컬; 서비스와 생성 도구 접근 구분 필요 |
| [Martini](https://www.martini.film/docs/mcp) | 확인 | ? | 공식 확인 | full/core 외부 호출 확인 | Blender→Martini 확인 | XML export 확인; 아래 상세 |
| [Fixed Seed](https://fixedseed.com/) | Lattice waitlist | API-key 소개 발견 | ? | ? | ? | 로컬; 계정·모델별 조건 ? |
| [Oxen](https://www.oxen.ai/) | 확인 | docs 발견 | ? | ? | ? | 로컬; 자료/생성 상품별 조건 ? |
| [Reactor](https://www.reactor.inc/) | playground 발견 | realtime SDK 소개 발견 | ? | ? | ? | 로컬; 세션/JWT·계정 조건 ? |
| [Luma](https://lumalabs.ai/) | markdown 확보 실패 | ? | ? | ? | ? | 로컬 glTF; 별도 상품/영상 API 조건 ? |
| [VEED](https://www.veed.io/) | 확인 | ? | ? | ? | ? | 로컬 SRT; 기능별 다운로드 조건 ? |
| [Passionfroot](https://www.passionfroot.me/) | workspace 발견 | ? | ? | ? | ? | 로컬 협업/성과 문서; 권한·성과 의미 ? |
| [Adobe](https://www.adobe.com/) | 제품군 확인 | ? | ? | ? | ? | 로컬; Firefly/Premiere 등 제품별 별도 조사 |
| [Rosebud](https://rosebud.ai/) | 확인 | ? | ? | ? | ? | 로컬 게임 자료; coding-agent 링크는 계약 미확인 |
| [SpriteCook](https://www.spritecook.ai/agents) | 확인 | 링크 발견 | ? | 공식 agent plugin 발견 | ? | 로컬 Aseprite; account sign-in 확인, 세부 protocol ? |
| [Nimble Fox](https://nimblefox.ai/) | Unity assistant 확인 | ? | ? | ? | ? | 로컬 Unity 자료; 소개의 MCP 비교는 제공 증거가 아님 |
| [Pickford](https://pickford.ai/) | lab 소개 확인 | ? | ? | ? | ? | 로컬 선언; 실행 제품/계정 계약 ? |
| [Bolt](https://bolt.new/) | 확인 | ? | ? | ? | ? | 로컬 프로젝트; 제품 내부 외부 MCP 수신 여부도 ? |

모든 미조사 행의 가입 필요·인증 방식·권한·요금제·크레딧은 `unknown`이다. 로그인 버튼이나
시작 화면을 봤다는 이유로 특정 계정의 웹 세션 또는 API 인증을 확인했다고 기록하지 않는다.
공식 MCP가 발견된 행도 설치·호스트 노출·인증·기능 권한·요금제·잔액은 각각 점검해야 한다.

## 버전 있는 실행 접근 명세

`packs/production/access-catalog.js`는 기존 기능 identity를 정확히 참조한다.
`getAccessSpec(id)`/`listAccessSpecs()`/`validateAccessSpec(value)`로 동일 계약을 재사용한다.
접근 명세도 [추가 전용 카탈로그 정책](catalog-history.md)에 따라 정확한 ID와 출고 hash를
보존한다. 인증 방식·도구 판본·Chroma 확인일 변경은 새 ID로 추가하며 과거 항목을 지우지 않는다.
5분 최대 점검 수명은 리니베라 정책이며 공급자가 인증/잔액을 5분간 보증한다는 뜻이 아니다.

| 접근 명세 | 기능·모델·endpoint | 가입 / 인증 | 권한·요금제·크레딧 | 구현 범위 |
|---|---|---|---|---|
| fal-flux-api-v1 | fal-flux-schnell-v1, FLUX schnell, fal-ai/flux/schnell | 계정 API key / FAL_KEY | 모델 권한·안전 검사 해제 권한·잔액 별도 확인 | 기존 API 연결기; 합성 transport 검증 |
| elevenlabs-tts-api-v1 | multilingual_v2, /v1/text-to-speech/{voice_id}/with-timestamps | 계정 API key / xi-api-key | voice·모델·codec·계정 제한 확인 | 기존 API 연결기; 합성 transport 검증 |
| meshy-preview-api-v1 | meshy-7.1, /openapi/v2/text-to-3d preview | 개발자 계정 Bearer API key | 키 월간한도·IP 제한·팀 pool·현재 비용 확인 | 기존 API 연결기; 합성 transport 검증 |
| meshy-preview-official-mcp-v1 | 같은 preview, @meshy-ai/meshy-mcp-server source 0.6.5 | API key를 호스트 환경 관리로 전달 | REST와 같은 권한/크레딧·무료 balance 우선 | 공식 tool schema 교집합 호스트 절차; 합성 tool 검증 |
| meshy-preview-official-skill-v1 | 같은 preview, meshy-dev/meshy-3d-agent | REST API key | MCP 없이 직접 REST, 잔액·기능권한 별도 | 공식 절차 조사; skill 실제 실행은 미검증 |
| local-broker-access-v1 | local-broker/v1, host-defined | 외부 가입·auth·plan·credits 적용 밖 | 로컬 호스트 설치·노출·실행권한; 내부 승인 별도 | 로컬 확보 bytes/path; 외부 준비 완료로 승격 불가 |

## 공식 도구의 범위와 방향

ElevenLabs [MCP 페이지](https://elevenlabs.io/mcp)는 hosted OAuth 계정/workspace 승인을 안내하고
기존 [로컬 공식 MCP](https://github.com/elevenlabs/elevenlabs-mcp)는 API key 경로다.
동일 페이지 상단은 Creative 생성까지 소개하지만 FAQ는 Agents 관리 기능을 중심으로 설명한다.
이 차이는 미해결이다. 어느 쪽도 timestamps API와 같은 입출력이라고 추정하지 않는다.
CLI `@elevenlabs/cli`와 `elevenlabs/skills`도 공식 페이지에서 안내되지만 이번 실행 계약으로
검증하지 않았다. [timestamps 문서](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)는
codec/zero retention마다 다른 요금제 조건을 두므로 대표 MP3와 전체 codec을 동일시하지 않는다.

[Meshy 공식 AI 통합](https://docs.meshy.ai/en/api/ai)은 외부 호스트가 공급자를 호출하는
MCP와 REST 직접 호출 skill을 모두 안내한다. MCP 설치 성공은 API key 검증이 아니다.
`meshy_check_balance`는 무료 읽기 점검이고 `meshy_list_usage`는 Studio/Enterprise 제한이 있어
후자를 모든 계정의 필수 점검으로 삼지 않는다. [잔액 문서](https://docs.meshy.ai/en/api/balance)는
팀 pool·사용자/워크스페이스 한도와 월간 만료를 구분한다. Chroma 제공분의 성격은 별도 미확인이다.

[Runware 인증](https://runware.ai/docs/models-api/authentication)은 계정별 API key와 HTTP/WS를,
[공식 MCP](https://runware.ai/docs/tools/mcp)는 remote OAuth 2.1 중 공급자 화면에 API key를
입력하는 경로와 local `@runware/mcp` 환경 인증을 안내한다. MCP 비용은 자신의 Runware 잔액에
청구된다. [CLI](https://runware.ai/docs/tools/cli)의 auth status/ping/account details와
[공식 skills](https://runware.ai/docs/tools/skills)의 모델 schema 확인 절차를 재사용할 수 있다.
Runware 기능 실행 명세·계정 실점검은 이번 미구현이다. 공급자 문서의 호스트별 설치 지침은
해당 호스트의 현재 기능을 별도로 확인한 뒤 따른다.

[Martini](https://www.martini.film/docs/mcp)는 외부 agent가 프로젝트를 조작하는 full MCP와
생성 도구를 뺀 core MCP를 구별한다. CLI와 [Blender→Martini skill](https://www.martini.film/skills/blender)도
공식이다. core 노출을 생성 가능으로 오인하지 않는다. 계정 project/olive 제한·write 승인은 별도다.
[Hyper3D](https://hyper3d.ai/features/mcp)는 browser 로그인·billing workspace 승인 후 외부 Rodin
호출 경로이며, [Magnific](https://www.magnific.com/mcp)는 외부 MCP와 제품 내부 Agents를 구분한다.
Magnific 유료 플랜의 무제한 웹 생성과 MCP의 크레딧 소비도 다르다. 다른 행은 방향·인증
상세를 확인하기 전 실행 경로로 자동 승격하지 않는다.

실계정 가입·인증·MCP 실호출·유료 생성·결제·외부 게시를 수행하지 않았다. 공식 도구 성공,
로컬 파일 확보, 리니베라 Resource 보관은 별도 상태다. signed URL만으로 보관 완료가 되지 않는다.
조사 근거와 미해결 항목은 [조사 기록](https://github.com/fbwndrud/linivera/blob/codex/chroma-capability-readiness/docs/plans/2026-10-23-partner-access-research.md)을 따른다.
