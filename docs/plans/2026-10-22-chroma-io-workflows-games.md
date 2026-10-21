# Chroma 도구 입력 출력 조사 워크플로 게임과 지원 기업

확인일: 2026-10-22 한국 시간. 담당 20개 파트너의 Chroma 공식 카드와 해당 카드에서 연결한 기업 사이트를 읽었다. 기술 문서가 있는 도구는 대표 계약을 확인했다. 가입·생성·결제·배포·파일 실행은 하지 않았다. 데이터 관리 지원과 API 자동 실행 지원은 구분한다.

## 전체 분류와 데이터 연결 대상

[시즌 2 공식 Promotions](https://submit.chromaawards.com/pack)의 파트너 명단을 기준으로 했다. 각 행의 ‘관리’는 리니베라 구현 제안이다. 파일 형식·엔드포인트가 미확인인 경우 확인한 기능만 적었다. 세부 API가 없다는 결론이 아니라 이번 공개 문서에서 확정하지 못했다는 뜻이다.

| 파트너 | 확인한 입력 → 출력·작업 데이터 | 접근 경로와 리니베라 관리 제안 | 공식 근거 |
|---|---|---|---|
| Cantina | 인물 personality·voice·identity 설정과 상호작용 → 캐릭터·대화·공유 영상. 실제 입력 필드·파일형식 미확인 | 앱/웹 창작. 캐릭터 설정 판본과 실제 회수한 영상·대화·선택을 연결. 공개 생성 API/프로젝트 export 미확인 | [Chroma 카드](https://submit.chromaawards.com/pack/cantina), [공식 사이트](https://cantina.com/) |
| Floyo | ComfyUI workflow API JSON·입력 파일·모델/노드 설정 → 이미지·영상·오디오·실행 metadata·결과 파일 | API/MCP/UI. 편집용 workflow와 실행용 graph를 각각 보존하고 run·입력 파일·결과 연결 | [API](https://www.floyo.ai/api), [Quick Start](https://docs.floyo.ai/floyo-api-quick-start), [Workflow 조회](https://docs.floyo.ai/floyo-api-workflows) |
| Alibaba Cloud | 대표 Wan I2V: prompt·negative_prompt·model·media(type/url)·resolution/duration/seed → 비동기 task_id·상태·video_url·usage, MP4 영상 | Model Studio API/UI. first_frame/last_frame/driving_audio/first_clip 역할·지역·실제 출력과 작업ID 보존. 다른 모델 계약은 별도 | [I2V 계약](https://www.alibabacloud.com/help/en/model-studio/image-to-video-general-api-reference), [영상 종류·출력](https://www.alibabacloud.com/help/en/model-studio/use-video-generation/) |
| ReelShort | 원본 세로형 단편 드라마를 제공하는 스트리밍 플랫폼. 참가자용 생성 입력·출력 API는 확인하지 못함 | 생성 커넥터 대상에서 분리. 관련 시리즈·회차·배급 정보와 원본 결과의 관계를 외부 참조로 관리 | [Chroma 소개](https://submit.chromaawards.com/pack/reelshort), [사이트](https://www.reelshort.com/) |
| Cars24 | 자동차 구매·판매·금융·보험·차량관리 기업으로 소개됨 | 창작 생성 커넥터 대상에서 분리. 광고 브리프·브랜드 제공 자료가 실제 전달되면 일반 자료로 반입 | [Chroma 소개](https://submit.chromaawards.com/pack/cars24), [사이트](https://www.cars24.com/) |
| Ashurst Perkins Coie | 법률·IP·투자·M&A 지원 기업 | 창작 생성 커넥터 대상에서 분리. 허가·라이선스·검토 문서가 제공되면 해당 작품 자료로 관리 | [Chroma 소개](https://submit.chromaawards.com/pack/ashurst-perkins-coie), [사이트](https://www.ashurstperkinscoie.com/) |
| Fairground | 완성 AI 영화를 큐레이션해 CTV/FAST로 제공하는 스트리밍 플랫폼 | 배급 관계·작품 판본·공개 링크/제출 확인 자료 관리. 공개 업로드/전송 규격 API 미확인 | [Chroma 소개](https://submit.chromaawards.com/pack/fairground), [사이트](https://fairground.tv/) |
| Escape | AI 영화·몰입형 이야기를 큐레이션하는 배급·CTV 플랫폼 | 원본 제작의 입력/출력과 배급 참조 구분. 서비스의 세부 납품 형식·API 미확인 | [Chroma 소개](https://submit.chromaawards.com/pack/escape), [사이트](https://escape.ai/) |
| TapNow | text/image/audio/video 모델을 연결하는 창작 canvas/agents → 여러 매체 결과 | 웹/앱. canvas/workflow와 개별 입력·결과·노드 사용 관계를 구분해 관리할 후보. 공개 graph export·API schema 미확인 | [사이트](https://www.tapnow.ai/), [Chroma 카드](https://submit.chromaawards.com/pack/tapnow) |
| Wonder Studios | 영화 제작 스튜디오. Wonder Platform은 live chat·교육·jobs·showcase·할인 등을 제공 | 커뮤니티/제작 지원과 생성 엔진을 구분. 사용자 작품·제작기·기여 관계를 관리할 수 있으나 범용 생성 API/편집 프로젝트 export는 미확인 | [공식 소개](https://wonderstudios.com/), [Chroma 카드](https://submit.chromaawards.com/pack/wonder-studios) |
| Martini | workflow bins(assets/URL)·variables·JSON inputs·fingerprint·예산 → run/action/item 상태·여러 파일·비용·수정 요청·부분 결과. UI는 MP4/XML export | 생성 API·Workflows API·MCP·UI. workflow 판본과 각 실행·각 결과·선택/수정 연결. XML 편집 정보와 소재 파일을 묶어 보존 | [Workflows API](https://www.martini.film/docs/workflows), [공식 MP4/XML 안내](https://www.martini.film/), [문서 목록](https://www.martini.film/docs) |
| Fixed Seed | 공개 사이트는 통합 image/video/3D/song·OpenAI 호환 chat, 비동기 queue·signed webhooks 및 live graph 기반 Lattice를 소개 | API/UI. 모델 고유 요청·run 상태·결과 파일·graph 변경을 별개로 보존할 후보. 이번에는 상세 API 문서를 읽지 못해 필드명·파일형식·graph export 미확인 | [공식 사이트/API 링크](https://fixedseed.com/), [Chroma 카드](https://submit.chromaawards.com/pack/fixed-seed) |
| Oxen | model·prompt·참조·모델 고유 인자·num_generations·target namespace/repo/directory → generation_id·상태·result_url·시각·오류·입력 인자 | API/UI/버전관리. 외부 repo·commit/파일 판본과 로컬 자원 관계를 연결. generation_id로 만료URL 재발급 가능 | [전체 역할](https://docs.oxen.ai/getting-started/intro), [Async Queue](https://docs.oxen.ai/inference-api/reference/async_queue) |
| Reactor | modelName·prompt·시간순 set_prompt/start 등 command → 실시간 video tracks/frames·상태, 모델별 오디오/상호작용 | SDK/API. 세션·명령 시각·관측 구간·녹화 결과를 연결. live track을 이미 다운로드된 MP4로 취급하지 않음 | [SDK 개요](https://docs.reactor.inc/overview), [공식 사이트](https://www.reactor.inc/) |
| Passionfroot | 크리에이터 마케팅·브랜드 협업·예약·대금 관리 플랫폼 | 생성 커넥터 대상에서 분리. 실제 브리프·납품 결과·동의/협업 문서가 제공될 때 작품과 연결. 결제정보를 생성 trace에 섞지 않음 | [Chroma 소개](https://submit.chromaawards.com/pack/passionfroot), [사이트](https://www.passionfroot.me/) |
| Rosebud | 게임 설명·template·기존 코드/소재 → 브라우저 게임·코드·art/audio; 유료 기능에 editable source·실행파일·소재/runtime 포함 ZIP | 웹 제작/다운로드. 소스·소재·빌드를 bundle로 보존하고 공개 플레이 링크는 별도 참조. 공개 생성 API 미확인 | [튜토리얼](https://rosebud.ai/tutorial), [소스·Windows 출력](https://lab.rosebud.ai/blog/how-to-download-run-and-ship-your-rosebud-game-on-windows-the-complete-guide) |
| SpriteCook | prompt/theme/style/palette/model·reference_asset_id/edit_asset_id, animate의 asset_id·동작·frame수·format → 투명 PNG·spritesheet·animated WebP/GIF·job/asset/character IDs·credit metadata | 공개 API/MCP/UI. style-reference와 편집 원본 역할 분리. 프레임·원점/정렬·animation 설정과 실제 그림을 함께 관리 | [API 계약](https://www.spritecook.ai/api-docs), [가이드](https://www.spritecook.ai/docs) |
| Nimble Fox | 자연어 기능/변경 요청·기존 Unity 프로젝트·3D assets → scripts/prefabs/GameObjects/components/models/terrain 등 프로젝트 변경 | Unity assistant와 온라인 플랫폼을 소개. 원본 프로젝트 판본·변경 파일·생성 소재·실행/빌드 결과 연결. 공개 생성 API와 전체 export 규격 미확인 | [공식 제품](https://nimblefox.ai/), [Chroma 카드](https://submit.chromaawards.com/pack/nimble-fox) |
| Pickford | 사람이 저작한 interactive narrative와 관객 상호작용을 다루는 applied AI lab. Chroma는 ‘characters hear you’ 소개 | 이야기 정의·캐릭터·관객 입력·상태 전환 기록을 관리할 수 있는 후보. 공개 SDK/API·파일 export·세션 checkpoint 규격은 미확인 | [공식 소개](https://pickford.ai/), [Chroma 카드](https://submit.chromaawards.com/pack/pickford) |
| Bolt | 자연어·기존 프로젝트·이미지/문서/코드/config 파일 → JS 기반 앱 소스·소재·프로젝트 ZIP·게시 사이트·GitHub 버전 | 웹 UI·MCP 연결 기능. 코드/소재 bundle·입력 첨부 역할·commit/배포 판본 연결. 프로젝트 복원과 DB 복원은 별개 | [지원 입력 형식](https://support.bolt.new/building/upload-files), [ZIP·버전 복원](https://support.bolt.new/managing-projects/rollback-backup) |

## 구현에 직접 영향을 주는 확인 사항

### 1. workflow 정의와 실행은 별개 자원이다

Floyo의 API JSON은 UI의 위치·색·그룹을 제거한 실행 graph다. 편집을 복원할 UI workflow와 실제 수행한 API graph를 같은 bytes/판본이라고 하면 안 된다. 모델·노드·파일 참조도 고정해야 한다. [Quick Start](https://docs.floyo.ai/floyo-api-quick-start).

Martini는 saved workflow version/fingerprint와 각 run을 구별한다. `POST /v1/workflows/{workflowId}/runs`에 `bins`, `variables`, JSON `inputs`, `fingerprint`, `oliveBudget`, `idempotencyKey`를 전달할 수 있다. 생략한 입력을 saved preset/canvas에서 읽는 경우가 있으므로 리니베라의 고정 입력이라고 기록하려면 실제 제공/읽은 값을 확보해야 한다. [Workflows API](https://www.martini.film/docs/workflows).

### 2. 복합 실행은 부분 결과·개별 수정이 있다

Martini run의 actions/items는 개별 상태·오류·비용·revision 이유·대체 대상과 연결된다. 실패한 run도 완성된 출력 일부를 반환한다. 한 run을 단일 성공/실패 파일로 축약하지 않는다. 외부 공급자의 `auto-approve`나 자체 judge verdict를 리니베라의 사용자 결정·검토 영수증으로 옮기지 않는다. 같은 API의 `needs_revision`과 `replacesItemId`는 후속 반복 작업을 이해하는 자료다. [Workflows API](https://www.martini.film/docs/workflows).

### 3. 외부 결과 URL은 저장된 원본이 아니다

Oxen `result_url`은 1시간 만료 signed URL이며, generation 조회로 새 URL을 받을 수 있다. `generation_id`, 외부 repo/파일 참조, 실제 내려받아 보존한 파일을 구별한다. Martini output도 `expiresIn`을 반환하고 예시는 3,600초다. 회수 실패와 재생성은 다르며 같은 외부 작업을 찾은 경우 기존 결과를 회복한다. [Oxen](https://docs.oxen.ai/inference-api/reference/async_queue), [Martini](https://www.martini.film/docs/workflows).

Alibaba Wan 대표 I2V는 `task_id` 24시간 유효를 명시한다. 입력의 `media.type`은 first_frame/last_frame/driving_audio/first_clip처럼 서로 다른 의미다. URL 목록으로만 보존하면 제어 역할을 잃는다. [Wan 계약](https://www.alibabacloud.com/help/en/model-studio/image-to-video-general-api-reference).

### 4. 실시간 세션은 시간순 입력을 가진다

Reactor SDK는 model에 연결하고 `set_prompt`, `start` 같은 command를 보내며 live media track/decoded frame을 받는다. 고정 prompt와 MP4 한 개만으로 세션을 나타낼 수 없다. 명령 시각·선택 모델·관측한 track/구간·실제 녹화·실패/종료 정보를 별도 기록하는 관리 계약이 필요하다. 모델별 command가 다르므로 공통 packet에 native 필드를 남긴다. 공식 문서에서 세션의 완전한 복원 checkpoint나 자동 녹화 파일 export를 확인하지는 못했다. [SDK 개요](https://docs.reactor.inc/overview).

### 5. 게임·편집 결과는 여러 파일의 연결을 보존한다

Rosebud의 내려받기 ZIP에는 실행파일뿐 아니라 소재·오디오·runtime·편집 가능한 source가 있다. Bolt도 프로젝트 파일 ZIP을 제공하지만 프로젝트 버전 복원이 DB를 되돌리지는 않는다. bundle의 상대 경로·파일 hash·소재/소스/빌드 역할과 외부 상태의 미포함 범위를 관리해야 한다. [Rosebud](https://lab.rosebud.ai/blog/how-to-download-run-and-ship-your-rosebud-game-on-windows-the-complete-guide), [Bolt](https://support.bolt.new/managing-projects/rollback-backup).

Martini 공식 홈페이지는 rough assembly를 Premiere/Resolve용 XML로 내보낼 수 있다고 한다. XML schema·media 동봉 방식까지는 이번에 확인하지 못했다. MP4는 감상 결과, XML과 연결 소재는 다시 편집할 자료로 구별해야 한다. [공식 안내](https://www.martini.film/).

### 6. 스프라이트는 그림과 animation 구조를 함께 남긴다

SpriteCook는 generate의 `reference_asset_id`(스타일 참조)와 `edit_asset_id`(수정 원본)를 구별한다. animate는 기존 `asset_id`와 `output_frames`, `output_format`을 사용한다. 결과 형식은 WebP/GIF/spritesheet이며 background removal은 owned asset 대신 임시 file result를 반환할 수 있다. 외부 asset/job/character ID와 실제 파일·프레임 정보·선택 관계를 각각 보존한다. [API 계약](https://www.spritecook.ai/api-docs).

## 리니베라 관리 유형으로 묶는 제안

| 데이터 유형 | 대표 도구 | 공통 관리와 별도 native 데이터 |
|---|---|---|
| 생성 작업·파일 | Alibaba, Oxen, SpriteCook, Fixed Seed | 고정 입력·외부 job/asset ID·상태·실제 파일·회수/만료 정보 |
| 재사용 workflow와 복합 run | Floyo, Martini, TapNow | workflow 정의 판본, 실제 입력 graph, 실행/단계/후보의 관계. graph export 불명인 도구는 미관측 표기 |
| 실시간 세션 | Reactor, Pickford의 탐색 후보 | 시간순 command·관측구간·미디어/행동 기록. 세션 state export는 확인된 범위만 |
| 편집·코드·게임 bundle | Martini XML, Rosebud, Nimble Fox, Bolt | source·소재·빌드의 개별 ID/판본과 manifest, bundle 상대 경로·구성 역할 |
| 배급·협업·지원 참조 | ReelShort, Fairground, Escape, Wonder, Cars24, 법률 지원, Passionfroot | 제작 결과 판본과 브리프·동의·납품/공개 참조 연결. 외부 메시지·배포 자동 실행을 뜻하지 않음 |

전체 파트너를 같은 형태의 생성 커넥터로 만드는 대신, 공통 Resource/Input/Operation을 재사용하고 실제 차이가 있는 데이터 유형에 Adapter를 둔다. 첫 구현 검증에는 이미지/음성 단일 파일 외에 **workflow JSON, 부분 결과, bundle**을 합성 fixture로 포함하면 계약의 빈틈이 잘 드러난다. 실시간 세션 수집은 별도 단계로 진행할 수 있다.

## 확인 범위와 남은 점

- 20개 파트너 모두 공식 Chroma 카드에서 제품 역할과 연결 사이트를 직접 확인했다. 카드의 일반적인 ‘Use/Tag/Share’ 문구만으로 생성 API가 존재한다고 판단하지 않았다.
- API가 확인돼도 Chroma의 웹 구독/할인 혜택이 그 API 사용료를 충당한다고 추정하지 않았다.
- Fixed Seed의 상세 queue/results 문서, Martini XML 세부 페이지는 열람 실패했다. TapNow·Pickford·Nimble Fox 등의 정확한 API/export 형식도 미확인으로 남겼다.
- 실제 export 파일·재생 결과·생성 호출을 검증한 것은 아니다. 구현 시 작은 합성 입력으로 실제 계약을 재확인하고 모델/문서 변경은 별도 revision으로 기록한다.
