# 파서 없는 파트너 자료와 프로젝트 의존성

확보한 파일은 공급자 전용 파서 없이도 [공통 반입](production-data.md)으로 보관하고
연결할 수 있다. 이미지·음원·코드·DB export·문서·알 수 없는 바이너리도 같은 Resource다.
파일의 MIME/역할과 실제 판본을 명시하며, 자동 형식 판별이나 모든 내용의 의미 해석을
뜻하지 않는다. 개별 파일은 2GiB, bundle은 8GiB/4,096개까지다.

## 브로커에서 보관까지

호스트/브로커가 계정 권한으로 파일을 확보한 다음 `importFile`/`importBundle`로 넣거나
기존 `createVersionedExportAdapter({provider,bundleType,requiredRoles})`에 전달한다.
후자는 회사 이름을 고정하지 않는 공통 Adapter다. `manual-export/<provider>/v1`,
`schemaVersion: linivera-manual-export-v1`, `capability: manual-export`인 요청과
`files:[{artifactKey,relativePath,role,mediaType,required,bytes 또는 path}]`를 사용한다.
큰 파일은 절대 로컬 경로와 선택적 예상 hash로 전달한다. 입력 예제는
[project-continuity.js](../examples/project-continuity.js)를 따른다.

`createProductionRecorder`는 같은 공개 MCP에 파일·bundle·실행 관측을 보관한다.
처음 가져온 파일의 원래 생성 prompt/seed/모델/입력이 없으면 unknown이다. 로컬 capture
ID를 공급자 job ID로 바꾸지 않는다. 이후 작업이 실제 사용한 Input과 출력은 연결한다.
공급자별 API/브라우저 조작·브로커 네트워크 구현은 호스트가 맡는다. 외부 URL만 있으면
바이트를 보관한 것으로 취급하지 않으며 자동 다운로드하지 않는다. 공통 Adapter의 JSON
관측에서는 알려진 비밀값을 가릴 수 있고 sourceContentHash/omittedPaths에 이를 남긴다.
원문 파일의 직접 보관과 가려진 관측을 구분한다.

## 파일 사이의 의존성을 선언하기

`format: project-manifest`는 Linivera의 명시적 계약이다. 임의 사이트의 native export로
가정하지 않는다. JSON을 Resource로 보관하고 기존 `inspectStructure/normalizeStructure`
동작을 사용한다. `structureBindings`는 `/files/0/path` 같은 key와 정확한 retained
revision을 연결한다. 파일 경로/이름을 보고 다른 파일을 자동 탐색하지 않는다.

```json
{
  "version": 1,
  "files": [
    {"path": "src/game.js", "role": "source", "required": true},
    {"path": "scenes/start.json", "role": "scene", "required": true},
    {"path": "db/snapshot.json", "role": "db-snapshot", "required": true}
  ],
  "entrypoints": ["src/game.js"],
  "dependencies": [{"from": "src/game.js", "to": "scenes/start.json", "kind": "scene"}],
  "externalStates": [{
    "id": "world-db", "kind": "database", "required": true,
    "evidence": ["db/snapshot.json"], "unavailable": []
  }]
}
```

role/kind는 사용자가 붙인 명시적 역할이다. source·scene·sprite-atlas·lockfile·build·
db-schema·db-migration·db-snapshot·environment·deployment 및 별도 역할을 쓸 수 있다.
경로는 정규화한 상대 경로이며 중복·파일/디렉터리 충돌·미선언 경로 참조는 거부한다.
진입점, 필수 상태 증거와 그 파일의 전이 의존성은 optional로 선언해도 필수 슬롯이다.
순환 import는 허용하며 같은 파일을 중복 보관하지 않는다.

externalStates.kind는 database/environment/deployment다. evidence는 선언한 파일 경로다.
환경은 필요한 변수 이름과 공개 설정/판본, DB는 schema·migration·명시적 snapshot,
배포는 build·설정·실행 증거를 각각 연결한다. 알려진 누락은 unavailable에 쓴다.
증거가 없으면 `/externalStates/<i>/@evidence`, 알려진 누락에는
`/externalStates/<i>/unavailable/<j>` 미연결 슬롯이 생긴다. 필수 상태의 슬롯은 실제
보관한 증거에 연결하기 전까지 Input을 차단한다. 선택적 상태의 누락도 unknown으로 남는다.
증거 파일이 있어도 현재 DB·실행 환경·배포의 완전 복원을 확인한 것은 아니다.

## 스프라이트 atlas

`format: aseprite`는 [공식 JSON hash/array](https://www.aseprite.org/api/spritesheetdataformat)
형식 조건의 자료에 적용한다. sheet의 선언 크기, frame rectangle·trim/source size,
[밀리초 단위 duration](https://www.aseprite.org/docs/sprite/), tag의 from/to·direction·repeat를
읽는다. `/meta/image`는 sheet 파일 필수 슬롯이며 이름이 없으면 수동 연결 슬롯으로 남는다.
좌표 범위·시간·중복 이름은 검사하지만 실제 이미지 decode·게임 재생은 하지 않는다.

tag는 원본 sprite의 번호를 사용하지만 선택/빈 셀 생략 export는 배열 위치와 파일명을
다시 매길 수 있다. hash/array 모두 JSON만으로 원본 번호 대응을 증명할 수 없으므로
tag 범위·방향은 보관하고 tag와 frame의 대응은 unknown으로 남긴다. layer/slice의
복잡한 의미, 다른 native atlas/엔진 포맷은 원본 보관과 수동 선언을 사용한다.
SpriteCook 등 특정 파트너가 이 형식을 제공한다고 가정하지 않으며 확보한 형식이 기준이다.

## 다음 반복 작업

map과 원본·연결 파일을 명시적으로 선택한 다음 map을 Input에 넣는다. 해당 판본들이
함께 고정되며 미연결 필수 슬롯·미선택·scope/용량 초과는 차단된다. 실제 사용한 자료와
출력을 기존 Operation에 남기므로 자료 교체는 후속 결과의 재검토로 전파된다.

`node examples/project-continuity.js`와 `--sheet`는 합성 브로커 자료를 공통 Adapter로
보관 → MCP 재시작 → 프로젝트·atlas·DB 실제 읽기 → 두 단계 후속 결과 → DB/시트 교체의
전이 재검토를 검증한다. 실제 브로커 호출·모델 생성·게임 실행/배포는 수행하지 않는다.
