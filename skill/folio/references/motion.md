# 모션 제작 실행

모션·포즈 기반 영상·낭독 영상 요청에는 설치된 패키지의 `docs/motion.md`를 읽고 다음 순서로 실행한다. 공통 자원 도구 계약은 [resources.md](resources.md)를 따른다.

1. 사용자가 고른 세계관·캐릭터·포즈·배경·음성·음악을 기존 공통 ID/판본으로 찾는다. 새 파일은 `folio_resources importFile`, 기존 관리 자산은 `importAsset {assetId,expectedRev}`으로 등록한다. 사용자의 실제 입력 선택을 `decideSource`로 전달한다.
2. story/shot 계획을 `motion-project` JSON으로 등록한다. 필수·선택 소재를 구분하고 프로젝트와 관측 가능한 이미지/오디오를 선택 정의와 함께 봉인한다. `folio_motion plan`의 필수 누락은 사용자에게 설명하거나 이미 승인된 범위에서 제작한다.
3. `render`로 컷 후보를 만든다. 각 컷은 공통 ID와 독립 Operation을 갖는다. 실제 파일을 보고 들은 범위를 검토에 기록하고 사용자의 결정/유효한 위임을 기존 `folio_operations`로 전달한다. 다음 입력으로 사용할 판본은 별도 사용자 선택이 필요하다.
4. 원래 입력과 선택한 컷을 새로 봉인하고 `compile`로 타임라인 후보를 만든다. 타임라인 역시 검토·결정·입력 선택을 거친다.
5. 선택한 타임라인·컷·오디오를 봉인하고 `assemble`로 최종 영상 후보를 만든다. 렌더의 기술 성공은 창작 승인과 구분한다. 관찰할 수 없는 연출·음성 품질은 미검토로 전달한다.
6. 사용자의 변경 요청이나 원본 변경이 있으면 `folio_resource_query graph`와 `reviewRequired/reviewReasons`로 후속 영향을 확인한다. 새 제작은 기존 논리 ID의 새 판본으로 남긴다. 다른 흐름에서는 원본을 복제하지 않고 같은 ID/판본을 선택 입력으로 재사용한다.

render/compile/assemble 인자는 `{root,op,inputSnapshotId,idempotencyKey,actor,grantId?}`다. plan에는 `{root,op:"plan",inputSnapshotId}`만 쓴다. 결과의 operationIds/resultRevisionIds와 compile의 timelineRevisionId를 그대로 사용한다. 입력이 달라지면 새 키를 쓰고, 중단 재개는 같은 키·입력·권한을 유지한다.

`needs_assets`는 필수 소재 누락, `submitted`는 검토 전 후보다. `MOTION_RENDERER_UNAVAILABLE`은 로컬 FFmpeg/ffprobe 설치가 필요하다는 뜻이다. 설치·유료 생성·외부 업로드는 사용자의 승인 범위에서 별도 수행한다. 기본 8MiB/120초 한도에서 실패한 파일을 경로 메모만 등록해 완료로 처리하지 않는다.
