# 공통 자산을 사용하는 모션 확장팩

세계관·캐릭터·포즈·배경·음성·음악은 기존 Resource ID와 불변 revision으로 보관한다. 모션은 그 자원을 입력으로 받는 추가 제작 흐름이다. 웹툰·낭독·다른 영상 프로젝트도 같은 ID와 판본을 입력으로 선택할 수 있다. 별도 모션 자산 저장소나 자동 승인 경로는 없다.

현재 로컬 FFmpeg/ffprobe로 포즈 이미지의 이동·상하 움직임·컷 전환과 음성/음악/효과음 혼합을 지원한다. 프레임별 AI 영상·TTS·음악 생성은 연결하지 않았다. 필요한 새 소재는 호스트가 제작한 뒤 공통 자원으로 등록한다. Adapter 경계는 `adapters/motion/`, 제작 정의와 흐름은 `packs/motion/`이다. writing pack의 `folio_init packs`에 추가하는 팩이 아니라 공통 Resource 제작 도구 확장이다.

## 제작 순서

모든 인자에는 작가가 선택한 절대 경로 `root`를 넣는다. 원본 등록·선택·정의·권한의 공통 계약은 [resources.md](resources.md)를 따른다.

1. 파일은 `folio_resources importFile`, 기존 관리 이미지는 `importAsset`으로 등록한다. 기존 관리 이미지의 `assetId`를 Resource ID로 유지한다. 사용자 선택은 `decideSource`로 별도 전달한다.
2. 아래 JSON을 kind `motion-project`인 Resource로 제안하고 사용자가 고른 판본을 선택한다. `profile`, `pipeline`, `policy` 정의도 선택한다. scope에 프로젝트·입력 이미지·오디오뿐 아니라 이후 단계에서 입력으로 쓸 컷과 타임라인 ID를 포함한다.
3. 프로젝트와 사용하는 이미지/오디오 판본을 `folio_inputs prepare`로 봉인한다. `folio_motion {op:"plan",inputSnapshotId}`은 `ready` 또는 `needs_assets`와 누락 목록을 반환한다. 선택 음성이 없으면 무음으로 진행할 수 있다. 필수 음성이 없으면 생성하지 않는다.
4. `folio_motion {op:"render",inputSnapshotId,idempotencyKey,actor,grantId?}`은 컷마다 별도 Operation과 `motion-shot` MP4 후보를 제출한다. `shots`에 각 revisionId와 operationId가 있다. 작업의 입력은 프로젝트와 해당 컷에 쓰인 포즈 판본으로 좁혀진다.
5. 호스트가 실제 결과를 검토하고 `folio_operations review`로 정확한 출력 hash에 영수증을 남긴다. 사용자 승인 또는 유효한 위임으로 `decide`를 수행한다. 다음 단계에서 사용할 컷은 사용자의 입력 선택도 별도로 전달한다.
6. 원래 프로젝트/이미지/오디오와 선택한 컷을 새 입력으로 봉인한다. 같은 인자 형식의 `folio_motion {op:"compile",...}`은 **실제 컷 판본을 입력으로 고정한** `motion-timeline` JSON 후보와 별도 Operation을 제출한다. 타임라인도 검토·결정·입력 선택을 거친다.
7. 선택한 타임라인·그 타임라인의 컷·오디오를 새 입력으로 봉인한다. `folio_motion {op:"assemble",...}`은 별도 Operation과 `motion-video` MP4 후보를 제출한다. 최종 결과도 공통 검토·결정을 따른다.

각 단계는 `status:"submitted"`, `operationIds`, `resultRevisionIds`, `creativeReview:"not-performed"`를 반환한다. compile은 `timelineRevisionId`도 반환한다. 출력 ID는 프로젝트의 `outputResourceId`로부터 `<id>-shot-01`, `<id>-timeline`, `<id>`가 된다. 기존의 무관한 ID를 덮어쓰지 않는다. 재실행에서 이미 제출된 같은 요청은 같은 결과로 복귀한다. 다른 입력/권한은 새 idempotencyKey를 사용한다. FFmpeg 실패로 요청만 남은 경우 같은 입력과 키로 재개할 수 있다.

입력 선택은 그 판본을 사용할 수 있다는 뜻이다. 품질 승인과 별도다. 도구가 사용자 결정이나 위임을 만들어 내지 않는다. `actor:user`는 실제 사용자의 지시를 전달하는 caller 진술이며 인증 시스템은 아니다. 같은 호스트의 검토는 자기검토로 기록된다. hard 차단은 그대로 적용되고 soft 지적은 자동 수정하지 않는다.

## 프로젝트 JSON

```json
{
  "version": 1,
  "outputResourceId": "episode-01",
  "width": 1280,
  "height": 720,
  "fps": 24,
  "shots": [{
    "durationSeconds": 4,
    "backgroundColor": "#f2eadf",
    "layers": [{
      "revisionId": "sha256:<선택한 포즈의 64자리 hex>",
      "x": 100, "y": 80, "width": 320,
      "dx": 40, "dy": 0, "bob": 3
    }]
  }],
  "audio": [{ "role": "voice", "revisionId": null, "required": false }]
}
```

`revisionId`는 모두 봉인 입력의 정확한 판본이어야 한다. 이미지 한 레이어를 캔버스 크기로 배치해 배경도 재사용할 수 있다. 컷마다 다른 포즈 판본을 배치할 수 있다. `dx/dy`는 컷 전체 이동량, `bob`은 초당 한 주기의 상하 움직임 크기다. audio의 role은 `voice/music/sfx`, 선택 값은 `startSeconds`와 `gain`이다. 미지정은 0초/1배, null인 선택 트랙은 생략된다. 트랙은 한 번 재생되며 전체 영상 길이로 잘린다. 배경음 반복은 현재 지원하지 않는다.

## 그래프와 변경 영향

`folio_resource_query {op:"graph",resourceId?,direction?:"upstream"|"downstream"|"both",depth?:20,limit?:1000}`은 기존 기록에서 공통 그래프를 검증해 만든다. 노드는 판본과 Operation, 연결은 `input/output/revision`이다. 선택 원본·후보·제출·승인·거절 상태와 `reviewRequired`를 구분한다. 경계 밖 관계가 있으면 `truncated:true`다. 큐의 깊이는 연결 하나마다 증가한다. 모든 판본을 시작점으로 하는 resourceId 범위이므로 판본별 이력도 함께 보인다.

로컬 뷰어의 **Connections → Resource history**와 정적 뷰어 내보내기도 같은 그래프를 보여 준다. 기존 집필 관계도는 그 아래에서 유지된다. 자원 전용 작업 공간에서도 Connections를 열 수 있다.

세계관 선택이 바뀌면 세계관→포즈→컷→타임라인→영상에 전이 `reviewRequired`가 붙는다. 미승인 중간 결과도 경로를 잇는다. 승인 결과의 metadata 조회에도 같은 영향이 표시된다. 후보/제출 결과의 입력 이력과 상태도 그래프에 남는다. 기존 bytes·영수증·승인을 지우거나 자동 재생성하지 않는다. 실행 원가/창작 품질은 별도 관찰 대상이다. `local-ffprobe` 결과는 해상도·길이·오디오 스트림의 기술 검사이며 창작 검토가 아니다.

## 현재 한도와 검증

- 로컬 PATH에 `ffmpeg`, `ffprobe`, FFmpeg의 `libx264`/AAC가 필요하다. 없으면 `MOTION_RENDERER_UNAVAILABLE`, 렌더 실패는 `MOTION_RENDER_FAILED`다. 입력 demuxer는 image2/mov/wav/mp3로 제한하고 file protocol만 허용한다. MP4의 외부 data reference는 끈다. DASH/playlist 위장 파일로 봉인되지 않은 소재를 읽지 않는다.
- 입력 이미지 PNG/JPEG/WebP, 오디오 WAV/MP3, 출력 MP4. 기존 관리 SVG/AVIF는 현재 Resource 반입 지원 대상이 아니다.
- 16..1920의 짝수 크기, 1..60fps, 1..20컷, 컷당 최대8레이어, 총1..120초, 최대8오디오, 자원당8MiB. 각 컷은 최소0.25초다. 큰 결과는 저장 성공으로 위장하지 않고 실패한다. 더 큰 파일의 blob 저장은 후속 공통 계층 확장이다.
- 프로젝트·컷·타임라인의 판본 결속은 유지한다. 직접 작성한 타임라인은 JSON 스키마와 선택된 미디어 검증을 거치지만 FFmpeg로 이미지를 만들었다는 창작적 사실을 인증하지 않는다.

`node examples/motion.js`는 임시 합성 작품에서 기존 관리 포즈를 같은 ID로 반입하고, 컷아웃과 별도 낭독 파이프라인이 그 판본을 재사용해 영상을 만든 뒤 세계관 변경의 전이 영향을 확인하고 지운다. 실제 모델 생성/작품/사람의 품질 승인을 검증하는 예제는 아니다. `--keep`은 검토용 임시 결과를 보존하고 경로를 출력한다.
