# Chroma 도구 입출력 조사 — 이미지·영상 10종

확인일: **2026-10-22, 한국 시간**. 공식 기술문서와 공식 제품/내보내기 안내만 읽었다. 생성·업로드·가입·결제는 하지 않았다. 대표 모델/엔드포인트의 계약을 조사했으며 전체 모델의 공통 스키마라고 주장하지 않는다. 금액·크레딧 재조사는 범위 밖이다. **웹 멤버십의 API 사용 가능 여부는 별도 계약**이며 여기서 추정하지 않는다.

기존 [공통 자산 ID·파생 그래프 계약](2026-10-21-creative-resource-lineage.md)을 전제로 한다. 아래 제안 필드·관계는 공급자 응답의 사실과 구별하며 아직 구현을 뜻하지 않는다.

## 먼저 정리할 결론

1. 도구 사이의 이동 단위는 대개 **이미지/영상/음성 파일**이다. 작업 ID·캐릭터 ID·플랫폼 전용 URI는 서비스 내부 식별자이며 다른 도구의 입력으로 그대로 옮길 수 없다.
2. 참조 이미지라도 `character_reference`, `first_frame`, `last_frame`, `style_reference`, `motion_reference`는 다른 역할이다. 같은 bytes를 넣었어도 역할·시간 위치·강도를 기록해야 후속 수정의 영향을 판단할 수 있다.
3. 생성 결과 URL은 영구 저장 주소가 아니다. Runware 기본 7일, Kling 결과 30일 정리, LTX 업로드 24시간/상태 최대24시간 등 수명이 다르다. URL·작업 ID만 보관하면 장편의 중간 입력이 사라진다.
4. prompt·seed만으로 장편 연속성을 보장할 수 없다. **채택된 캐릭터 기준 판본 + 참조 역할 + 샷 상태 + 실제 투입 파일 hash + 생성/편집의 부모 관계**를 고정해야 한다. seed는 모델/버전/서비스 범위의 설정이다.
5. 웹 전용 작업도 파일 반입과 수동 제작 설정 기록으로 계보를 남길 수 있다. API가 없는 작업에 가짜 request_id나 seed를 만들어 넣지 않는다.

## 1. fal — 모델별 입력 스키마 + 공통 작업 큐

- 대표: `fal-ai/flux/dev/image-to-image`. 입력 `image_url`(초기 이미지), `prompt`, `strength`, `seed`, `num_inference_steps`, `guidance_scale`, `num_images`, `output_format`(jpeg/png). URL 또는 Base64 Data URI를 사용하고, SDK의 File 업로드도 가능하다. 이미지 형식 허용 범위는 엔드포인트별 확인이 필요하다. [I2I API](https://fal.ai/models/fal-ai/flux/dev/image-to-image/api)
- 출력 JSON은 `images[]:{url,width,height,content_type}`, 실제 사용 `seed`, `prompt`, `timings`, `has_nsfw_concepts`. 큐 제출은 `request_id`, 상태 조회와 결과 조회를 분리한다. 모델 ID는 응답이 되돌려주지 않아도 요청에 별도로 고정한다. `sync_mode:true`는 Data URI를 반환하고 요청 이력에 출력 데이터가 남지 않는 계약이다. [I2I API](https://fal.ai/models/fal-ai/flux/dev/image-to-image/api)
- 다른 예: `flux-subject`의 `image_url`은 **인물/대상 참조**, 위 I2I의 초기 이미지와 의미가 다르다. ControlNet/LoRA는 별도 입력·가중치·파일을 갖는다. 통합 어댑터가 전부를 `referenceImage` 하나로 줄이면 통제 정보가 사라진다. [Subject API](https://fal.ai/models/fal-ai/flux-subject/api), [General API](https://fal.ai/models/fal-ai/flux-general/api)
- 웹 Playground에는 Download/JSON 미리보기가 있지만, 다른 공급자의 웹 저장 캐릭터나 프로젝트 데이터가 자동 동기화되는 계약은 아니다. 파일 URL 보관기간은 이번 대표 문서에서 확정하지 못했다.
- 리니베라 기록: endpoint ID/스키마 확인일, 고정 입력 파일·역할·strength, 실제 seed, request_id, 원본 응답, 각각의 이미지 후보. 선택 전 후보도 공통 자산으로 등록한다.

## 2. Runware — 모델 중개 API, 작업과 결과 자산 ID 분리

- 공통 POST `https://api.runware.ai/v1`, 작업 배열. `taskType`, 호출자가 만든 `taskUUID`, `model`(`creator:family@version`), `positivePrompt`, 크기/길이/seed를 쓴다. 최신 모델 계약은 입력을 `inputs` 아래, 모델 전용 옵션을 `settings` 아래 두기도 한다. 예: `inputs.seedImage`, `inputs.referenceImages`, `inputs.frameImages`. 예전 `seedImage` 평면 예제를 모든 모델에 적용하지 않는다. [공통 API](https://runware.ai/docs/models-api/introduction), [모델 스키마](https://runware.ai/docs/models-api/model-schemas)
- 이미지 출력은 `outputType:URL|base64Data|dataURI`, 대표 모델의 `outputFormat:JPG|PNG|WEBP`; 결과에 `taskUUID`, `imageUUID`, `imageURL` 또는 Base64/Data URI, 실제 `seed`, 선택적 `cost`. 영상에는 `videoUUID`, `videoURL`(공식 예시 MP4). 모델에 따라 입력·출력 형식과 seed 지원이 다르다. [대표 이미지 모델](https://runware.ai/docs/models/runway-gen-4-image), [공통 응답](https://runware.ai/docs/models-api/introduction)
- 비동기 조회 `getResponse`는 `processing|success|error`, 지원 작업은 progress를 반환한다. `getTaskDetails`는 과거 요청/응답을 회복한다. 기본 출력 URL 보관은 **7일**, `ttl`로 조정 가능하므로 즉시 보존이 필요하다. [Polling](https://runware.ai/docs/models-api/task-polling), [Task Details](https://runware.ai/docs/models-api/task-details), [보관](https://runware.ai/docs/models-api/introduction)
- 웹 export를 API 계약과 동일하다고 확인하지 않았다. Runware에서 호출한 Kling과 Kling 직접 API는 **서로 다른 provider/transport**로 기록한다.
- 리니베라 기록: operationId ↔ taskUUID ↔ 결과 UUID를 모두 매핑하고, 중개사와 실제 모델을 둘 다 남긴다. 참조 배열의 순서·각 역할, 출력 포맷·알파 유무를 보존한다.

## 3. Kling — 최신 구조와 legacy 구조를 혼합하지 않는다

- 대표 최신 공개 문서는 POST `/image-to-video/kling-3.0`. `contents[]`에 `{type:prompt,text}`, `{type:first_frame,url}`, 선택적 `last_frame`, `{type:element,element_id,id}`. 이미지 URL/Base64, JPG/JPEG/PNG, 50MB 이하, 변 길이300px 이상 등의 제한. first_frame 필수이며 마지막 프레임만으로는 생성하지 않는다. `settings`에 resolution/duration/audio/multi_shot, `options`에 callback_url/external_task_id를 둔다. [공식 I2V 문서](https://kling.ai/document-api/apiReference/model/imageToVideo)
- 제출 응답 `request_id`, `data.id`(작업), `status:submitted|processing|succeeded|failed`, 시간·external_id. `/tasks` 조회의 `outputs[]`에는 type별 결과 ID·url·watermark_url·duration 등이 온다. 생성 결과는 **30일 후 정리**된다고 문서가 안내한다. 이 대표 스키마에는 seed를 확인하지 못했다. 영상 파일 컨테이너/코덱은 해당 문서만으로 확정하지 않는다. [같은 공식 문서](https://kling.ai/document-api/apiReference/model/imageToVideo)
- legacy `/v1/videos/image2video`의 `image`, `image_tail`, `model_name`, `task_id/task_result`와 위 구조는 별개다. 버전 없는 'Kling payload'를 저장하지 않는다. [legacy I2V](https://kling.ai/document-api/api/video/2-5-turbo/image-to-video/legacy)
- 웹의 Element 라이브러리는 참조를 재사용하는 수단이다. Element ID를 리니베라 캐릭터 ID로 대체하지 말고, 플랫폼 내 매핑과 원본 참조 세트를 별도 보존한다. 웹 내보내기의 구조 JSON·seed 동반 여부는 미확인이다.
- 접근 한계: 구 klingai.com은 robots 제한, kling.ai 직접 가져오기는 JS 셸만 반환했다. 위 상세는 **공식 문서 도메인의 검색 인덱스 본문**에서 확인했으며 인증 호출로 검증하지 않았다. 어댑터 구현 직전 현재 스키마를 다시 고정해야 한다.

## 4. OpenArt — 저장 캐릭터·각도 시트와 파일 반입 경로

- 공식 웹 흐름은 텍스트/이미지 참조/Character Builder preset → 저장 Character → 후속 이미지·영상에서 같은 Character 재사용. 얼굴 기준과 의상·조명은 다른 연속성 항목으로 관리해야 한다. [Character](https://i18n.openart.ai/features/ai-character/)
- 공식 제작 가이드는 master reference → Multi-View **9각도 grid와 분리 이미지** → 저장 Character → Image-to-Video를 설명한다. 이 파일들은 '캐릭터 설정 텍스트'와 다른 독립 관리 자산이다. [연속성 가이드](https://i18n.openart.ai/blog/consistent-characters-in-ai-video/)
- 이미지 웹 export는 PNG/JPG/WebP 안내, 배경 제거는 투명 PNG 안내가 있다. 한 기능의 입력 UI는 JPEG/PNG/WEBP를 명시하지만, 이를 전체 모델의 입력 한도로 일반화하지 않는다. [Anime export](https://i18n.openart.ai/generator/anime/), [Background Remover](https://openart.ai/features/background-remover/)
- **공개 공식 생성 API 스키마·작업ID·결과URL TTL·JSON export를 이번 조사에서 확인하지 못했다.** 커뮤니티 ComfyUI workflow 다운로드는 OpenArt 생성 API 계약의 근거로 사용하지 않았다. 영상 컨테이너·프로젝트/캐릭터 패키지 export도 미확인이다.
- 리니베라 기록: 웹 프로젝트/Character 식별값은 관찰 가능한 경우만 기록. master·각도별 이미지와 grid에 각각 resourceId를 주고, `depictsCharacter`와 `derivedFrom`를 구별한다. 선택 모델·prompt·UI 설정은 수동 입력 근거임을 표시한다.

## 5. Dreamina — 웹의 멀티모달 참조·첫/끝 프레임

- 공식 Image-to-Video는 image+prompt, First & Last Frame, 참조 기반 생성 흐름을 제공한다. 입력 이미지 형식은 HEIC/SVG/PNG/JPG/WebP라고 제품 FAQ가 안내한다. 모델/지역/실제 UI 제한은 별도 확인 대상이다. [공식 I2V](https://dreamina.capcut.com/ai-video/image-to-video)
- 같은 페이지는 이미지·영상·음악·텍스트·그린스크린·white model 참조와 음성 참조를 설명한다. 이들은 각각 시각 정체성·동작·음색·공간 배치 등의 **역할별 참조**다. 제품의 지원 수량/길이 광고를 안정적인 API 스키마로 해석하지 않는다. [공식 I2V](https://dreamina.capcut.com/ai-video/image-to-video)
- 공식 Canvas/텍스트 스타일 안내에는 resolution/format 선택 후 PNG/JPG/MP4 다운로드가 나온다. 이것은 해당 웹 export 기능의 안내이며, editable layer/타임라인/설정 JSON이 함께 나오는 계약은 확인하지 못했다. [웹 export 안내](https://dreamina.capcut.com/ai-video/change-text-style)
- **Dreamina 웹과 동일한 공개 API의 필드·작업ID·seed·URL TTL은 미확인.** Seedance/Seedream을 fal·Runware 등으로 호출할 때는 Dreamina 멤버십·프로젝트를 쓴 것으로 기록하지 않는다.
- 리니베라 기록: 실제 업로드 bytes, 참조 역할/순서, 첫·끝 프레임, UI 모델명·설정·수동 provenance. SVG/HEIC를 PNG로 변환해 넘기면 변환 operation과 출력 hash도 남긴다.

## 6. MiniMax — 대표 Hailuo I2V의 3단계 비동기 흐름

- 대표 POST `/v1/video_generation`: `model`, `first_frame_image`, `prompt`, `prompt_optimizer`, `duration`, `resolution`, 선택 callback_url. 첫 프레임은 공개 URL/Data URL, JPG/JPEG/PNG/WebP, 20MB 미만. prompt의 `[Pan left]` 같은 카메라 명령과 자동 prompt 최적화 여부도 제작 입력이다. 모델별 길이·해상도 조합이 다르다. [I2V API](https://platform.minimax.io/docs/api-reference/video-generation-i2v)
- 제출 → `task_id`; `/v1/query/video_generation?task_id=` → `Preparing|Queueing|Processing|Success|Fail`, 성공 시 `file_id`, 영상 크기. `/v1/files/retrieve?file_id=` → `file:{file_id,bytes,filename,purpose,download_url}`. 공식 예시는 `output_aigc.mp4`. 대표 I2V 문서에서 seed를 확인하지 못했다. [상태 조회](https://platform.minimax.io/docs/api-reference/video-generation-query), [파일 조회](https://platform.minimax.io/docs/api-reference/video-generation-download)
- 초기 공식 출시문은 다운로드URL **9시간 유효**라고 안내하지만 현재 다운로드 참조 문서에는 이 시간이 다시 명시되지 않는다. 따라서 현재의 확정 TTL로 고정하지 않고, 만료 가능 URL로 취급하여 즉시 보존한다. [2024 공식 발표](https://www.minimax.io/news/video-generation-api)
- 최신 MiniMax-H3 멀티모달 V2는 별도 API 계열이다. 본 대표 Hailuo 계약을 H3의 모든 참조·오디오/영상 입력에 적용하지 않는다. 웹 Hailuo 구독의 API 잔액/metadata export는 미확인이다.
- 리니베라 기록: task_id와 file_id 구분, 원래 prompt와 최적화 설정, 첫 프레임 판본, 실제 다운로드 파일/JSON 영수증. 반환 파일의 모델·seed를 응답에 없는 값으로 채우지 않는다.

## 7. PixVerse — 업로드 ID·제작 ID·요청 추적 ID가 다르다

- API는 `API-KEY`와 **매 요청 다른 `Ai-trace-id`**. T2V는 prompt/model/duration/quality/aspect_ratio/seed. I2V 업로드의 `img_id`, 전이 생성의 `first_frame_img`/`last_frame_img`는 **이미지 ID**다. 이미지 업로드는 form-data이며 해당 안내는 URL 업로드를 지원하지 않는다고 명시한다. [API 흐름](https://docs.platform.pixverse.ai/how-does-the-api-work-882967m0), [첫·끝 프레임](https://docs.platform.pixverse.ai/how-to-use-transitionfirst-last-frame-feature-882973m0)
- 제출 `Resp.video_id`; GET `/openapi/v2/video/result/{video_id}` → `status`(1 성공/5 대기·진행/7 moderation 실패/8 생성 실패), `url`, seed/prompt/출력크기/size/시간 등. 모델명은 요청에 보존한다. 출력 URL TTL·최종 컨테이너는 이 참조에서 확정하지 못했다. [I2V 흐름](https://docs.platform.pixverse.ai/how-to-use-image-to-video-882971m0)
- Extend/Restyle은 생성한 `source_video_id` 또는 외부 영상 업로드의 `video_media_id`를 구분한다. Extend 외부 입력은 MP4/MOV, 50MB·30초 등 제한. Lip Sync에는 `audio_media_id` 또는 TTS speaker_id/content가 별도 입력이다. [Extend](https://docs.platform.pixverse.ai/how-to-use-extend-1268531m0), [Lip Sync](https://docs.platform.pixverse.ai/how-to-use-speechlip-sync-1268530m0)
- 오래된 가이드의 v3.5/v4.5와 현재 endpoint 예시의 v6이 공존한다. 모델·API 확인일을 고정하고 각 조합을 검증해야 한다. **웹 Pro 멤버십을 API credits로 취급하지 않는다.**
- 리니베라 기록: operation → trace ID → video_id, 입력 이미지/외부영상/음성 upload ID와 원본 hash를 모두 연결. 공식 안내는 같은 trace ID 재사용 시 새 영상을 만들지 않는다고 설명하지만 기존 결과 회복·재시도 멱등성까지 보장한다고 확인하지 못했다. 요청 추적과 안전한 재제출을 같은 뜻으로 취급하지 않는다. [Quick Start](https://docs.platform.pixverse.ai/quick-start-796052m0)

## 8. LTX — V2 비동기 작업과 구간 재생성

- 대표 POST `/v2/image-to-video`: `image_uri`, prompt/model/duration/resolution. 입력은 HTTPS URL, Data URI, `/v1/upload`의 `ltx://` storage_uri. 이미지는 PNG/JPEG/WebP; 영상 MP4/MOV/MKV(H.264/H.265), 음성 WAV/MP3/M4A/OGG 등이지만 codec 제한은 별도다. 업로드 최대200MB가 개별 생성 endpoint 한도를 뜻하지 않는다. [Quickstart](https://docs.ltx.io/quickstart), [Input Formats](https://docs.ltx.io/input-formats)
- upload_url은 **1시간**, 업로드 파일은 **24시간**. 생성은 `202 {id,created_at}` → `pending|processing|completed|failed`; 결과 `result.video_url`(보통 MP4), HDR endpoint는 `exr_frames_url`처럼 키가 다르다. 완료/실패 후 상태는 최대24시간이며 더 빨리 사라질 수 있고, 출력 URL은 독립 만료한다. [Upload](https://docs.ltx.io/api-documentation/api-reference/upload/create-upload), [Async Jobs](https://docs.ltx.io/async-jobs)
- `/v2/retake`는 `video_uri`, `start_time`, `duration`, `mode:replace_audio|replace_video|replace_audio_and_video`, prompt/model 등으로 일부 구간을 재생성한다. 편집 범위 밖을 유지한다는 계약이며 시간 구간과 트랙을 함께 기록해야 한다. [Retake V2](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-retake)
- **V1 동기 endpoint는 2026-10-26 23:59 UTC 이후 종료 예정**이라고 공식 문서가 명시한다. 새 통합은 V2를 기준으로 설계한다. [V1 종료 안내](https://docs.ltx.io/api-documentation/api-reference/video-generation/retake)
- LTX Explore/Studio 웹 프로젝트와 API/오픈소스 모델은 동일 export 계약이 아니다. 대표 문서에 seed 반환을 확인하지 못했다. 리니베라는 job ID·endpoint/model·입력 판본·구간/track·MP4/EXR 출력별 파일을 보존한다.

## 9. Luma — 현재 Agents API와 예전 Dream Machine API 구분

- 예전 Ray2 문서는 현재 API로 **Luma Agents**를 안내한다. 대표 현재 POST `https://agents.lumalabs.ai/v1/generations`: `model:ray-3.2`, `type:video`, prompt/aspect_ratio, `video:{resolution,duration,start_frame,end_frame}`. ImageRef는 URL, Base64 `data`+`media_type`, Files API의 `file_id`를 받는다. [공식 진입 안내](https://docs.lumalabs.ai/docs/video-generation), [현재 Video generation](https://docs.agents.lumalabs.ai/guides/videos/generation/)
- `video.keyframes[]` + 같은 길이 `keyframe_indexes[]`로 **출력 프레임 위치**를 지정한다. 기존 start_frame/end_frame과 상호 배타적이다. 이전 생성의 `generation_id`를 start/end frame에 넣는 extend도 별도 경로이며 파일URL만 넘기는 경우와 의미가 다르다. [현재 Video generation](https://docs.agents.lumalabs.ai/guides/videos/generation/)
- 제출 `id,type,state,model,created_at,output[],failure_reason/failure_code`; 완료 시 `output[].type/url`의 presigned MP4. HDR 설정과 EXR export(ACES2065-1/AP0)도 지원하지만 조합 제한이 있다. 서명 URL 예시의 `Expires=3600`을 전 작업 공통 TTL로 확정하지 않는다. 대표 API에서 seed는 확인하지 못했다. [현재 Video generation](https://docs.agents.lumalabs.ai/guides/videos/generation/)
- legacy Ray2 `keyframes.frame0/frame1:{type:image|generation,url|id}` 및 `assets.video`와 현재 `video.*`/`output[]`를 섞지 않는다. Dream Machine 웹 Plus와 Agents API entitlement도 별도 확인이 필요하다.
- 리니베라 기록: generation ID와 output별 파일, keyframe 이미지 판본과 **frame index/fps**, extend 방향, HDR/색공간/EXR 관계. MP4와 EXR은 같은 결과의 서로 다른 rendition으로 묶고 동일 hash로 간주하지 않는다.

## 10. Magnific — 확대 결과도 새 생성/편집 계보다

- 확인일 현재 magnific.ai는 magnific.com으로 이동하고 공식 API는 docs.magnific.com에서 제공한다. 대표 Creative Upscaler POST `/v1/ai/image-upscaler`: `image` Base64, `scale_factor`, `optimized_for`, prompt, creativity/hdr/resemblance/fractality, engine, webhook_url. **재해석 강도**가 포함된 확대이므로 동일 파일의 해상도만 바뀐 것으로 간주하면 안 된다. [현재 공식 API](https://www.magnific.com/api/image-upscaler), [POST 계약](https://docs.magnific.com/api-reference/image-upscaler-creative/post-image-upscaler)
- 비동기 `data:{task_id,status,generated:[]}` → GET `/v1/ai/image-upscaler/{task-id}` → `COMPLETED`, `generated[]` URL. 공식 완료 예시는 JPG다. 이 endpoint에는 출력 포맷 선택·seed 반환이 명시되지 않았고, URL TTL/PNG alpha 보존 보장도 확인하지 못했다. [GET 계약](https://docs.magnific.com/api-reference/image-upscaler-creative/get-image-upscaler)
- 웹 Creativity/HDR/Resemblance 제어는 확인되지만 웹 다운로드 metadata JSON/작업 설정 bundle은 미확인이다. current 플랫폼의 API/credits 설명이 있어도 **Chroma 혜택의 API 사용권**을 보장하는 근거로 쓰지 않는다.
- 리니베라 기록: source revision → upscale operation → 신규 결과 revision; engine/모든 slider/scale·출력크기를 함께 고정한다. 얼굴/로고/의상 세부가 달라지면 캐릭터 기준 채택과 별도 검토한다.

## 리니베라에 남길 최소 연결 계약 — 조사에서 도출한 제안

공급자가 반환한 사실은 provider payload에 보존하고, 아래 공통 필드와 관계는 정규화 계층에 둔다. 네트워크 호출은 core 밖의 어댑터가 맡는다.

| 기록 | 보존 이유 |
| --- | --- |
| resourceId/revisionId/contentHash | 로컬 공통 자산의 정체성·판본·실제 bytes 결속. provider ID나 URL과 구별 |
| operationId / attemptId / provider / endpointVersion / model | 중개 서비스와 모델, 동일 작업 복구와 새 생성 반복을 구별 |
| inputRefs의 역할·순서·강도·시간/프레임 위치 | 캐릭터 기준/스타일/시작·종료/동작 참조와 어떤 구간을 바꿨는지 구별 |
| character/location/style 기준 revision + sceneId/shotId/takeId | 장면 의미와 실제 입력 계보를 별도 보존. '등장했다'와 '생성에 투입됐다'를 혼동하지 않음 |
| provider request/task/upload/result ID, 요청/응답 원본, 상태 이력 | 재시도·복구·실패·필터링도 추가 기록. 성공 응답 전 생성 완료로 처리하지 않음 |
| 원문 prompt/실제 전송 prompt, optimizer, seed(있는 경우), 설정 | 웹 수동 기록/반환 관측/요청 의도라는 근거 수준을 구별 |
| media kind/MIME/container/codec/크기/fps/duration/audio/color/alpha | 다음 도구가 받는 포맷인지 판정. 변환·리샘플·crop도 별도 파생 작업 |
| output URL/관찰 만료시각/다운로드 영수증/저장 위치/hash | URL 재발급과 동일 bytes 회복을 구별. 다운로드 후 검증되어야 보존 완료 |
| parent revision / rejected·selected·approved 결정 | 후보·채택·품질 승인·세계관 정본을 구별하고, 상위 기준 변경 영향 경로 조회 |

후속 반복은 `채택한 기준 이미지 → 샷 첫 프레임 → 영상 take → 추출 마지막 프레임 → 다음 샷`처럼 **새 operation을 추가**한다. '마지막 프레임 연결'은 시간적 접합을 도와도 정체성/의상/공간 연속성까지 증명하지 않으므로 샷 검토를 별도로 남긴다.

예시 권장 흐름은 OpenArt에서 만든 캐릭터 각도 시트나 fal 이미지 후보를 로컬 공통 자산으로 수입하고, 고정 판본을 Kling/PixVerse/LTX/Luma 입력에 맞게 변환해 제출한 뒤, 파일과 JSON 영수증을 다시 같은 공통 자산 공간에 등록하는 것이다. **웹 프로젝트를 API job으로 가장하거나 도구 간 메모리가 자동 공유된다고 가정하지 않는다.**

실제 미디어는 이번 조사에서 만들지 않았다. 구현 시 검사는 합성 fixture로 하고 실제 작품·생성물을 저장소에 커밋하지 않는다. PR #2는 이미 역방향 의존 조회와 전이 재검토 기반을 구현했다. 이 기반을 재사용하며 대형 미디어 저장과 공급자별 입력·실행 관측을 확장한다.
