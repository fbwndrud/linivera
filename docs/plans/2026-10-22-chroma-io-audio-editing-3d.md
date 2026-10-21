# Chroma 도구의 입력·출력: 음성·편집·3D

확인일: 2026-10-22. 범위: ElevenLabs, CapCut, Adobe, VEED, Meshy, Hyper3D, Creatify. 공식 API·제품·내보내기 문서만 근거로 사용했다. 서비스 실행·가입·유료 호출은 하지 않았다. Chroma 혜택이 아래 API나 모든 제품에 적용된다고 추정하지 않는다.

이 문서는 조사 자료다. 아래 MCP 관리 계약은 제안이며 설계 정본이나 구현 확정을 대체하지 않는다. 실제 작품·생성 결과는 저장소에 추가하지 않았다.

## 핵심 구분

같은 회사의 결과라도 `API 생성 응답`, `웹 편집 프로젝트`, `다운로드한 최종 파일`, `편집 가능한 소스 묶음`은 서로 다르다. 특히 MP4 하나가 트랙·자막·발화문·편집 결정을 모두 보존하지 않는다. 3D도 한 모델에 재질·텍스처·리그·여러 동작이 연결될 수 있다.

| 도구 | 확인된 대표 입력 | 확인된 대표 출력 | 후속 수정에서 보존할 연결 |
| --- | --- | --- | --- |
| ElevenLabs | 발화문, voice/model ID, 설정, 음성/대본, 음악 계획 | 오디오, 문자/단어 정렬 JSON, 화자구간. legacy Dubbing v1 Studio에는 AAF/SRT/CSV/트랙 ZIP | 원고 판본→화자/음성설정→오디오→타이밍·자막 |
| CapCut | 영상·음성·그림·SRT/TXT, 타임라인 편집 | 렌더 영상, 자동생성 캡션 SRT/TXT, 서비스 내부 프로젝트 | 원본 파일+프로젝트 위치/판본+최종 렌더+자막 |
| Adobe | 편집 원본·프로젝트, MOGRT/AEP, 대본/음성 | Premiere 프로젝트·미디어 묶음/교환파일, API 렌더·job JSON | 편집 소스와 생성 호출을 각각 보존 |
| VEED | UI 미디어·자막, API 얼굴 그림+오디오 | UI MP4/SRT, API job/result video 파일 | API job과 UI 프로젝트를 합치지 않음 |
| Meshy | 프롬프트·참조 그림·완료 task·모델 | 여러 모델 포맷·PBR maps·썸네일·rig·동작 파일 | mesh→texture→rig→animation 의존 관계 |
| Hyper3D | 순서 있는 참조그림/시점·프롬프트·모델 | 모델·재질 파일 목록·미리보기·비동기 ID | 모델과 texture-only/Bang 후속작업 연결 |
| Creatify | 상품 URL·스크립트·avatar/voice·장면배열·배경 | job JSON·MP4·썸네일·preview 참조 | 입력 장면 구조와 최종 영상 구분 |

아래 절의 출처가 위 요약표를 뒷받침한다.

## ElevenLabs

**입력/API:** TTS는 `text`, 경로의 `voice_id`, `model_id`, `voice_settings`, 발음사전 ID/version, `seed`, 앞뒤 텍스트·요청ID 등을 받는다. 저장 음성설정은 stability/similarity/style/speaker boost/speed이므로 실제 적용값도 보존한다. 결정성은 보장되지 않는다. [TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps), [Settings](https://elevenlabs.io/docs/api-reference/voices/settings/get).

**출력/API:** with-timestamps는 `audio_base64`와 원문/정규화문 **문자별** alignment를 반환한다. 대화 API는 화자 voice ID·시각·입력index를 가진 `voice_segments`도 준다. 단어 timestamp는 오디오 `file`+대본 `text`를 받는 별도 forced-alignment의 `words[].text/start/end/loss`다. SRT 자체와 구분한다. [Dialogue](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps), [Forced alignment](https://elevenlabs.io/docs/api-reference/forced-alignment/create/).

**다른 생성:** SFX는 text/duration/loop, 음악은 prompt **또는** composition_plan을 받아 지정형식 오디오를 반환한다. [SFX](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), [Music](https://elevenlabs.io/docs/api-reference/music/compose).

**UI export:** 일반 Studio는 MP3/WAV·장별 ZIP·조건부 영상. **legacy Dubbing v1 Studio(maintenance mode)**는 AAC/MP3/WAV, 트랙/클립 ZIP, AAF timeline, SRT, CSV(speaker/start/end/transcription/translation)를 제공한다. 현재 Dubbing v2는 단일 lossless audio와 preview 영상 등 별도 계약이며, 대본 편집/재생성 API는 Enterprise 조건이다. v1의 편집 export를 v2 전체 기능으로 일반화하지 않는다. [Studio](https://elevenlabs.io/docs/eleven-creative/products/studio), [Dubbing](https://elevenlabs.io/docs/eleven-creative/products/dubbing/dubbing-studio).

**관리 제안:** 원고→voice/settings→audio hash→timing/captions를 연결한다. AAF/분리음원도 보존한다. 일반 TTS와 Dubbing의 출력계약을 합치지 않는다.

## CapCut

**입력/UI:** 영상·음성·그림으로 타임라인을 구성한다. Desktop는 SRT/시간코드 TXT, Web는 SRT를 editable caption blocks로 가져온다. Mobile 직접 import는 제한된다. [Subtitle import](https://www.capcut.com/help/how-to-import-subtitles).

**출력/UI:** 렌더 영상과 자동 인식 캡션의 SRT/TXT. 수동 텍스트 전체를 캡션 파일로 받을 수 있다고 가정하지 않는다. 해상도/fps/bitrate는 환경·원본·계정 조건에 영향을 받으므로 실제 파일사양을 검사한다. [Caption export](https://www.capcut.com/help/captions-fail-to-export), [Video export](https://www.capcut.com/help/export-videos-in-capcut).

**소스 구분:** 타사 프로젝트(`.prproj` 등) 직접 import/export는 지원하지 않는다고 명시한다. 다른 draft도 렌더 영상으로 가져오면 원래 개별 layer/effect/track은 편집할 수 없다. [Premiere→CapCut](https://www.capcut.com/help/how-to-export-pro-project), [Draft import](https://www.capcut.com/help/import-a-previous-project-into-the-current-project).

**미확인/제안:** 공개 편집타임라인 API·휴대형 프로젝트 export 스키마는 이번 문서에서 확인하지 못했다. 비공식 draft JSON에 의존하지 말고 원본 hash, 외부 프로젝트 위치/판본, 앱버전, export settings, 최종영상·자막을 묶는다. 소스를 회수하지 못했으면 외부서비스에만 존재한다고 표시한다.

## Adobe: 편집과 생성 구분

**Premiere UI:** 원본 미디어·프로젝트를 받아 최종 영상 외에 AAF/EDL/OMF/Final Cut Pro XML을 export한다. Project Manager의 Collect Files는 새 프로젝트와 미디어를 모으므로 디렉터리 구조를 유지한다. 모든 효과·폰트·플러그인·동적 링크의 왕복 보장은 아니다. [Project package](https://helpx.adobe.com/ca/premiere/desktop/organize-media/create-projects/copy-project.html), [Formats](https://helpx.adobe.com/at/premiere/desktop/render-and-export/export-files/supported-export-file-formats.html).

**자막:** burn-in/embedded/sidecar를 구분하며 SRT는 파일당 한 stream이다. [Captions](https://helpx.adobe.com/au/premiere/desktop/render-and-export/export-files/export-caption-tracks.html).

**Firefly API:** TTS의 script text/URL·locale·voiceId→WAV; Avatar의 script/음성URL·avatarId·배경→MP4 또는 투명 WebM. 비동기 `jobId/statusUrl`, 완료 `output.destination.url`은 편집 프로젝트가 아니다. [TTS](https://developer.adobe.com/audio-video-firefly-services/guides/), [Avatar](https://developer.adobe.com/audio-video-firefly-services/guides/avatar/).

**템플릿:** Dynamic Graphics Describe는 MOGRT 또는 AEP+자산 ZIP/compName을 받아 font/image/audio/video control manifest를 반환한다. template+manifest+override+render를 연결할 수 있다. [Describe](https://developer.adobe.com/audio-video-firefly-services/guides/dgr/dgr-describe).

**미확인/제안:** 일반 Generate Video 전체 request 스키마는 이번에 확정하지 않았다. Adobe 브랜드 전체를 한 계약으로 보지 말고 product/operation별 소스·입력·job·렌더를 분리한다.

## VEED

**UI:** 영상·음성·그림을 workspace/project에 올리고 최종 MP4로 export한다. SRT를 편집·별도 다운로드하는 흐름도 있다. [Upload](https://support.veed.io/en/articles/10657034-how-to-upload-video-audio-music-or-image-files), [Export](https://support.veed.io/en/articles/10531327-how-to-export-your-project), [SRT](https://www.veed.io/learn/how-to-create-a-srt-file).

**API:** Fabric은 얼굴/캐릭터 `image_url`+실제 발화 `audio_url`+`resolution`을 받는다. 텍스트를 직접 읽는 API가 아니다. `202`의 `data.job_id/status`로 polling한다. 완료 `result.video`는 URL과 선택적 MIME/name/bytes를 갖고 예상·실제 credits를 구분한다. 자막 sidecar·편집 타임라인 반환은 이 endpoint에 명시되지 않았다. [Fabric reference](https://api.veed.io/docs/api/post-v1-fabric-1-0).

**보존:** 결과URL은 완료부터 기본 1일, 요청header로 최대30일. 만료후 재조회해도 갱신되지 않는다. 요청/응답 로그는 기본7일이다. [Retention](https://api.veed.io/docs/media-retention).

**미확인/제안:** UI 프로젝트의 외부 왕복 스키마는 확인하지 못했다. image source와 audio source의 역할을 분리하고, 새 음성판본이 나오면 기존 립싱크를 영향대상으로 표시한다. job URL만 보존하지 말고 실제 파일을 회수한다.

## Meshy

**입력:** Text-to-3D는 prompt로 preview mesh task, 성공한 `preview_task_id`로 refine texture task를 만든다. Image-to-3D는 공개URL/data URI `image_url`, model/PBR/remesh/pose/polycount/target formats 등을 받는다. [Text](https://docs.meshy.ai/en/api/text-to-3d), [Image](https://docs.meshy.ai/en/api/image-to-3d).

**출력:** 생성 응답 `result`는 task ID다. 완료 JSON은 `model_urls`(GLB/FBX/OBJ/STL/USDZ/명시시3MF), `texture_urls[]`(base_color/metallic/normal/roughness), 썸네일·방향별preview·진행/시간/credits를 갖는다. [Task schema](https://docs.meshy.ai/en/api/image-to-3d).

**후속단계:** rig는 textured humanoid GLB 또는 `input_task_id`/height/base-color PNG→rigged GLB/FBX·걷기/달리기·armature 파일. rig 출력에는 원래 PBR맵 전체가 포함되지 않는다. animation은 `rig_task_id`+action/motion ID→GLB/FBX. `action_ids` 여러 동작은 한 파일 안 별도 clip으로 합쳐질 수 있다. [Rig](https://docs.meshy.ai/en/api/rigging), [PBR 제한](https://www.meshy.ai/developers/cookbook/recipes/rig-3d-character/), [Animation](https://docs.meshy.ai/en/api/animation).

**보존/제안:** 비Enterprise API asset은 일반적으로 최대3일, URL은 `expires_at`에 만료되고 재조회로 갱신되지 않는다. Enterprise는 무기한 보관 예외가 있다. [Retention](https://docs.meshy.ai/en/api/asset-retention). mesh→texture→rig→clip을 복수파일 manifest로 관리한다. embedded clip도 식별하고 누락 PBR맵을 표시한다. [공식 MCP](https://docs.meshy.ai/en/api/ai)가 내부 승인·계보를 대신하지 않는다.

## Hyper3D / Rodin

**입력:** multipart images 1~5장 또는 prompt. 순서가 의미있고 첫 그림은 재질에 쓰인다. `image_label[]`은 시점 F/B/L/R/U/D 등을 순서대로 붙인다. tier/mesh_mode/format/material/quality/seed/bbox/TAPose/alpha도 입력이다. [Gen-2.5](https://docs.hyper3d.ai/en/api-specification/rodin-gen2-5).

**출력:** GLB/USDZ/FBX/OBJ/STL, PBR 또는 조명이 구워진 Shaded/All/None. `TAPose`는 pose conditioning이며 rig 완료가 아니다. 생성 top-level `uuid`와 `jobs.subscription_key`는 각각 download/status 용도다. HTTP201만으로 성공판정하면 안 된다. [생성 스키마](https://docs.hyper3d.ai/en/api-specification/rodin-gen2-5).

**패키지:** 모든 하위job이 Done인지 확인한 뒤 download의 `task_uuid`→`list[].name/url`을 받는다. 조기호출은 미완성 목록일 수 있고 URL은 만료된다. [Download](https://docs.hyper3d.ai/en/api-specification/download-results).

**후속수정:** texture-only는 model+재질참조image+prompt/reference_scale을 받는다. Bang은 asset/model을 별도 분할한다. [Texture](https://docs.hyper3d.ai/en/api-specification/generate-texture), [Bang](https://docs.hyper3d.ai/en/api-specification/bang).

**미확인/제안:** rig/animation export와 고정 패키지 디렉터리 계약은 확인하지 못했다. 실제 파일을 검사한다. 참조 순서·시점·재질역할과 geometry→texture→parts를 보존하며 status 구독키는 공개 provenance에서 제외한다.

## Creatify

**입력:** URL-to-video는 상품 URL→link ID·수집 이미지/설명→preview/render다. 원페이지 변경에 대비해 실제 선택 미디어·스크립트를 보존한다. [URL-to-video](https://docs.creatify.ai/api-documentation/url-to-video/link-to-video).

**장면/API:** Avatar v2 `video_inputs[]`는 character avatar/style/offset, voice input_text/voice ID, background type/url, caption setting이며 aspect ratio/model version도 지정한다. 응답 `id/status/progress/media_job/credits_used/failed_reason`과 입력배열, 완료 `output` MP4·thumbnail·preview가 있다. [Avatar v2](https://docs.creatify.ai/api-documentation/ai-avatar/lipsync-v2).

**소스 구분:** 예제 preview URL이 layout JSON을 가리켜도 공인 휴대형 편집 프로젝트·영구백업 스키마라는 보장은 아니다. 문서 하단 v1 경로와 본문 v2 경로가 달라 구현시 endpoint reference 재확인이 필요하다.

**TTS:** script+accent ID+선택 webhook→job JSON/output/duration. 단어 timestamp·SRT·stem bundle 반환은 명시되지 않았다. [TTS](https://docs.creatify.ai/api-reference/text-to-speech/post-text-to-speech).

**미확인/제안:** 전체 편집 프로젝트 export는 확정하지 못했다. request recipe·결과media·preview를 분리한다. Aurora/Boreal 등 제품별 schema도 다르며 AI Editing/Product Video/AI Shorts는 deprecated 목록이다. [공식index](https://docs.creatify.ai/llms.txt). 카탈로그 avatar/voice ID만으로 재현을 보장하지 않는다.

## 공통 관리 계약에 반영할 제안

다음 필드는 공급사 API의 공통 필드가 아니라, 이번 사실에서 도출한 리니베라 내부 설계 후보이다.

| 기록 | 필요한 내용 | 이유 |
| --- | --- | --- |
| `input_snapshot` | 실제 보낸 텍스트/설정, 참조 asset hash·순서·role·범위, 외부 카탈로그 ID | 프롬프트 문자열 하나로는 수정 입력을 복원할 수 없음 |
| `operation` | provider/product/operation, endpoint/model/version, UI/API 구분 | 같은 회사의 생성·편집·수출이 다른 계약임 |
| `external_job` | task ID·subjob ID·상태·오류·시각·실소비량·중복방지용 local ID | 접수와 완료·다운로드 성공은 서로 다름 |
| `artifact_manifest` | member path·role·MIME·bytes·hash·dependency·embedded member | 3D/소스/분리음원·자막은 복수파일 또는 파일내 여러 객체 |
| `timing_binding` | 대상 오디오/영상 hash·언어·단위·character/word/clip·fps | 다른 판본의 timestamp를 잘못 붙이는 것을 방지 |
| `editing_source` | 편집 프로젝트/AAF/XML/recipe/외부링크·앱버전·완전성 | 최종 MP4와 후속 수정 능력을 구별 |
| `derivation` | 입력 판본→출력 판본, 선택/폐기/사람 수정·검토 영수증 | 재생성·재편집 결과를 덮어쓰지 않고 추적 |

파일은 기한 내 회수·hash 확인 후 등록한다. 임시 signed URL은 저장본의 대체가 아니며 원래 URL의 비밀 query는 공개 기록에서 제거한다. 미수집 member·누락 참조·오래된 timing은 명시한다. 모든 도구 호출은 Adapter/호스트에 두고 core의 모델·네트워크 금지를 지킨다. 잠금 규칙은 설정으로 우회하지 않는다.

실제 수집 실험은 합성 fixture로 우선 검증한다. 오디오+정렬, SRT+최종MP4+외부프로젝트 상태, GLB+PBR+rig+복수clip 묶음의 세 사례가 공통 계약의 부족함을 드러내기 좋다. 기존 자원 MIME·크기·bundle 지원은 별도 코드 점검이 필요하며 이 보고서만으로 지원됨을 주장하지 않는다.
