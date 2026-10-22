# 편집 타임라인과 확장 의존성 연결

기존 [구조 연결](structure-links.md)의 두 MCP 동작을 그대로 쓴다. 먼저 원본과 소재,
필요한 패키지·모델 파일을 보관하고, `inspectStructure`의 reference key를 실제 판본에
연결해 `normalizeStructure`한다. 다음 Input에는 map만 지정해도 원본·연결 파일·선언이
함께 들어간다. 파일명/URI를 자동 다운로드하거나 패키지 코드를 설치·실행하지 않는다.

## 편집 형식

| format | 보관 원본에서 읽는 구조 | 시간 의미와 확인 범위 |
|---|---|---|
| xmeml | XMEML 5 sequence/video/audio/track, clip/file ID, transition/filter/marker, linked clip | parentRange는 sequence 프레임, sourceRange는 clip의 선언 rate 또는 상속 rate. NTSC는 30000/1001처럼 유리수로 보존. -1/미기재 경계는 null과 unknown |
| otio | Timeline.1, Stack.1, Track.1, Clip.1/2, Gap.1, Transition.1, ExternalReference.1 | sourceRange는 원본 value/rate. parentRange는 바로 위 composition 기준 초. gap은 길이를 차지하고 중간 transition은 이웃 경계에 겹침 |

중간 transition은 트랙 길이에 중복 가산하지 않는다. 맨 앞의 in offset과 맨 뒤의
out offset은 공식 OTIO 규칙에 따라 트랙의 자연 길이에 포함한다.
OTIO의 globalStartTime은 전역 timecode 원점이다. local parentRange에 자동으로 더하지
않는다. composition trim은 보관하며 visible range를 평탄화하지 않는다. effect/retime,
알 수 없는 item의 길이가 있으면 이후 위치도 null로 남긴다. 미지원 media reference는
필수 수동 슬롯이므로 부분 map은 보관할 수 있지만 연결 전에는 다음 Input이 차단된다.

XMEML은 외부 DTD/entity, 처리 명령, namespace와 malformed XML을 거부한다.
file과 중첩 sequence가 모두 없는 clip도 필수 미디어 미연결 슬롯으로 표시한다.
중첩 sequence의 완전한 정의는 읽지만 id-only sequence 재사용·multicam·플러그인 효과,
AAF/FCPXML/AE/Premiere/CapCut 전용 프로젝트와 ZIP 자동 해제는 포함하지 않는다.
편집기 복원·재생 결과를 검증했다는 뜻이 아니다. 도구의 ZIP export에서는 사용자가
선택한 XML과 media를 따로 반입하거나 기존 bundle로 연결한다.

## ComfyUI 커스텀 의존성

`comfy-api`와 `comfy-ui`의 parserVersion 2는 보관한 의존성 선언을 받을 수 있다.
선언은 Linivera의 명시적 계약이며 공급자가 그대로 export하는 native 형식은 아니다.

```json
{
  "version": 1,
  "nodes": [{
    "classType": "CustomModelLoader",
    "package": {"id": "custom-nodes", "version": "1.2.3", "revision": "exact-source-revision"},
    "files": [{"input": "model_path", "role": "model", "widgetIndex": 0}]
  }]
}
```

이 JSON을 Resource로 보관한 뒤 `inspectStructure`와 `normalizeStructure`에
`dependencyManifestRevisionId`를 지정한다. API graph는 `inputs.model_path`, UI는
명시한 `widgets_values[0]`을 읽는다. API에서는 widgetIndex를 사용하지 않는다.
선언한 슬롯은 필수이며 누락·복합값·유효하지 않은 UI 위치는 거절한다. 이미 그래프로
연결된 API 파일 슬롯은 기존 node-input 관계를 사용한다.

기본 UI loader에서 파일 위치 선언이 없으면 `/@file/<input>` 필수 슬롯으로 남긴다.
이를 실제 파일 판본으로 직접 연결하거나 widget 위치를 선언한다. 기본 역할을
다른 역할로 바꾸거나 선언에서 빼서 필수 입력을 없앨 수 없다.
각 노드의 `/@package` reference는 실제 패키지 코드/manifest/bundle 판본으로 연결한다.
UI의 `properties.cnr_id/ver`는 공급자 관측으로 보관한다. 버전이 없으면 unknown이며,
명시적 계약으로 판본을 설명할 수 있다. 관측과 계약이 충돌하면 거절한다. 기본 loader의
필수 파일 역할을 계약으로 바꿀 수 없다. 이름·버전이 일치해도 실행 호환성·무결한 배포
서명·숨은 Python 의존성을 검증한 것은 아니다. 실제 반입 파일 hash는 별도로 검증된다.

## glTF/GLB 확장

parserVersion 2는 다음 확장의 의존성 참조를 기본 glTF 구조 위에 추가한다.

- Draco → bufferView, meshopt → 압축 buffer/바이트 범위. meshopt의 명시적 fallback
  storage는 생성 대상이므로 별도 원본 파일로 요구하지 않는다.
- BasisU/WebP와 AVIF vendor profile의 source → image.
- clearcoat/sheen/specular/transmission/volume/iridescence/anisotropy와 legacy
  specular-glossiness의 texture index → texture.
- material variants → variant/material, GPU instancing attributes → accessor.

숫자로 된 codec attribute ID를 accessor ID로 간주하지 않는다. 범위를 벗어나는
파일/texture/material/accessor 참조와 압축 byte range는 거절한다. 알 수 없는 확장은
위치를 unknown으로 남긴다. 구조상의 참조 검증이며 실제 codec 해제·전체 glTF 규격
적합성·shader/transform 결과 검증은 수행하지 않는다.

## 과거 판본과 새 작업

`parserVersion`을 생략하면 해당 format의 최신 버전이다. 기존 version 1 map과
Input은 기록된 버전으로 재계산해 hash를 유지하며 이미 시작한 작업의 재시도도 유지한다.
옛 해석으로 새 필수 의존성을 숨기지 않도록 새 Operation은 최신 parser map을 요구한다.
`STRUCTURE_PARSER_UPGRADE_REQUIRED`이면 같은 원본을 최신 버전으로 inspect/normalize해
새 reference를 연결하고 Input을 다시 준비한다. 과거 기록을 덮어쓰지 않는다.

`node examples/timeline-continuity.js`와 `--contract`는 실제 MCP 재시작 뒤 두 편집
형식·커스텀 선언·3D 확장을 다음 출력으로 연결하고, 소재/선언 변경의 전이 재검토를
합성 자료로 검증한다. OTIO 시간 기대값은 개발용 공식 라이브러리 0.18.1로 생성한
fixture와 대조한다. 실행 환경에는 Python/OTIO가 필요하지 않다.
