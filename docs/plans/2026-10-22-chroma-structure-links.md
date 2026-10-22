# Chroma 자료 구조와 다음 작업 연결

기존 A–F의 Resource → Input → Operation → Review를 그대로 사용한다. 공급자별
생성 API 확대보다 보관한 원본의 내부 관계를 정확한 판본으로 연결하는 일을 먼저 한다.
전체 범위와 남은 항목은 [지원표](../chroma-support.md)가 정본이다.

## 우선순위

1. P0: 원본 바이트와 재계산 가능한 `structure-map`을 묶는다. 명시한 파일 연결만
   다음 Input의 선택·scope·용량 검증에 포함한다. 누락 필수 연결은 Input을 차단한다.
2. P1: ComfyUI API/UI 노드·링크, Martini run/action/item/output/replacement,
   glTF 2/GLB의 모델·재질·리그·애니메이션, SRT cue 시간을 해석한다.
3. 후속: 네이티브 편집 타임라인, 코드/DB/배포 의존성, 커스텀 노드와 확장 형식의
   의미 해석은 별도 파서와 합성 fixture를 확보한 다음 확장한다. 파일 보관과 수동
   bundle/usage 연결은 지금 사용한다.

후속 순서는 지원표의 P2(편집·노드·확장), P3(게임 의존성), P4(공급자별 의미)를 따른다.

## 구현·검토 기록 (2026-10-23)

P0/P1 공개 경계와 여섯 형식을 구현했다. 실제 stdio 재시작 후 생성 결과의 hash와
원본 구조를 다음 출력에 반영하고, 그 결과를 다시 다음 작업에 제공했다. graph/index의
원본·연결 파일 관계 검증과 원본 교체 후 두 단계 뒤 재검토, 과거 Input 검증을 확인했다.

### Standards

직전 PR #4 head `129fc24`부터 별도 에이전트로 검토했다. 문서화된 규칙 위반과
수정이 필요한 설계 냄새는 발견되지 않았다. core/packs의 순수성, 300줄 제한,
hash/선택/scope/용량/경로 격리와 영어·한국어 라벨을 확인했다.

### Spec

Martini 변수와 bin이 동명일 때 revision.inputRefs를 bin으로 확정하는 P2 지적 1건을
합성 반례로 재현했다. namespace별 후보를 보존하고 모호하면 unknown으로 표시하도록
수정했으며 공개 경계 회귀 테스트를 추가했다. 같은 검토자가 해결을 재확인했고
미해결 지적은 없다. 전체 검사에서 발견한 standalone 스킬 안내의 외부 상대 링크도
독립 설치 방식에 맞는 원격 문서 링크로 고쳤다.

## 공개 경계

- `folio_resources.inspectStructure {revisionId, format}`: 보관 원본에서 units,
  links, references, coverage를 읽는다. 네트워크·외부 경로 조회를 하지 않는다.
- `normalizeStructure {resourceId, sourceRevisionId, format, structureBindings}`:
  referenceKey를 정확한 retained revision에 연결한 후보를 만든다. 자동 선택하지 않는다.
- 형식: `comfy-api`, `comfy-ui`, `martini-run`, `gltf`, `glb`, `srt`.
- 구조 판본은 sourceRevisionId/contentHash, format, parserVersion, projection,
  bindings를 가진다. `propose`로 직접 넣어도 원본에서 재계산해 위조를 거부한다.
- 출력/상태/replacement는 공급자가 보고한 구조적 사실이다. 생성 실행이나
  Linivera 승인으로 취급하지 않는다. 실제 파생은 기존 Operation 입력·출력으로 기록한다.
- 외부 URI·asset ID·파일명은 연결 힌트다. 자동으로 다운로드하거나 판본으로 간주하지 않는다.
  `coverage.unknown`과 미연결 필수 references를 숨기지 않는다.

## 검증

공개 MCP/Resource 경계에서 합성 fixture로 red → green을 반복한다. 자동 해석,
미연결 차단, 위조 거부, scope/선택/용량 폐쇄, 원본 무결성, 조회 그래프를 검증한다.
마지막에는 실제 stdio 재시작 후 구조 후보 → 다음 Input → Operation 출력 → 원본
선택 변경에 따른 전이적 재검토까지 확인한다. 유료 생성·네이티브 편집기 복원은 별도다.

## 형식 근거

- [ComfyUI JSON](https://github.com/Comfy-Org/comfy-cli/blob/main/docs/json-output.md),
  [Floyo workflow](https://docs.floyo.ai/floyo-api-workflows)
- [Martini workflow/run](https://www.martini.film/docs/workflows)
- [Khronos glTF 2](https://www.khronos.org/registry/glTF/specs/2.0/glTF-2.0.html)
- [OTIO](https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-file-format-specification.html):
  라이브러리와 시간 의미를 검증하기 전까지 네이티브 타임라인 자동 해석을 주장하지 않는다.
