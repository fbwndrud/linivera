# P2 편집 타임라인과 확장 의존성

기준은 PR #5 head `a83e5ae`다. 기존 공개 Resource → structure-map → Input →
Operation → Review를 이어 쓴다. 테스트도 이 공개 MCP seam에서 합성 fixture로 한다.

## 구현 범위

1. XMEML 5: sequence/video/audio/track/clip/file ID 참조, NTSC 유리수 rate,
   타임라인 start/end와 소재 in/out, transition·filter·marker 구조를 읽는다.
   외부 DTD/entity는 거부한다. `-1` 전환 경계·retime은 추정하지 않고 unknown으로 남긴다.
2. OTIO JSON: Timeline/Stack/Track/Clip/Gap/Transition과 media reference를 읽는다.
   source range와 parent range를 구분하고 mixed-rate·gap·transition을 공식 OTIO
   라이브러리로 생성한 합성 fixture/기대값과 대조한다. trim·retime·미지원 schema의
   위치를 추정하지 않는다. 라이브러리는 개발 검증용이며 실행 환경에는 요구하지 않는다.
3. ComfyUI: 기존 그래프와 함께 명시적으로 보관한 dependency manifest를 연결한다.
   custom class/package 판본·파일 슬롯·UI widget 위치는 이 선언의 정확한 판본으로
   해석한다. UI의 cnr_id/ver도 관측 기록으로 연결한다. 선언은 실행/설치 권한이 아니다.
4. glTF/GLB: Draco bufferView, meshopt buffer, BasisU/WebP/AVIF image,
   material variants·확장 texture, GPU instancing accessor의 구조적 의존성을 연결한다.
   실제 codec 해제·renderer 복원은 포함하지 않는다. 알 수 없는 확장은 위치를 표시한다.

## 재현성과 잠금

기존 parserVersion 1은 그대로 재현한다. 확장한 형식은 parserVersion 2를 기본으로
사용하고 과거 map 검증은 기록된 version을 사용한다. dependency manifest가 있으면
그 자체도 정확한 typed Input 참조다. built-in 필수 파일 슬롯을 선언으로 지울 수 없다.
필수 패키지/모델/미디어 미연결, scope·선택·용량 초과, manifest/원본 위조를 차단한다.
기존 hash·영수증·추가 전용 기록장·hard·자기검토·soft 비자동수정은 유지한다.

## 완료 기준

- 공개 MCP에서 각 형식의 구조·누락·파일 연결을 확인한다.
- 기존 parser v1 map/Input의 hash와 역사적 검증을 유지한다.
- 실제 stdio 재시작 후 timeline + 확장 의존성을 다음 출력에 사용하고,
  소재/계약 변경이 후속 결과를 전이적으로 재검토 대상으로 만드는지 검증한다.
- 전체 check, 설치 tarball, 공개 예제와 필요한 Studio 검증을 통과한다.
- Standards/Spec 독립 코드 리뷰 지적을 재현·수정하고 재확인한 뒤 #5 위에 PR을 올린다.

## 근거

- [Martini XML export](https://www.martini.film/docs/export/nle): XMEML 5와 media 묶음.
- [Apple XMEML elements](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/FinalCutPro_XML/Elements/Elements.html)
- [OTIO serialized format](https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-file-format-specification.html),
  [time ranges](https://opentimelineio.readthedocs.io/en/latest/tutorials/time-ranges.html)
- [Khronos extensions](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0)
- [ComfyUI object_info producer](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py):
  native 정보만으로 file role을 추정하지 않고 명시적 계약을 사용한다.

## 독립 리뷰 반영

### Standards

문서 규칙 위반은 없었다. 허용된 XML 형제 32,000개에서 locator가 매번 이전 형제를
스캔하는 P2 성능 지적 1건을 수정했다. 부모별 태그 카운터로 인덱스를 배정한다.
실제 MCP의 5초 요청 예산 테스트가 수정 전 timeout, 수정 후 약 0.5초로 통과했다.

### Spec

XMEML의 미디어 없는 clip 통과(P1), UI 선언의 기본 file role 변경(P2), Draco
bufferView byte range 검사 누락(P2)을 공개 반례로 재현하고 수정했다. 기본 UI 필수
파일은 선언에서 빠져도 미정 슬롯으로 남는다. 추가 공식 OTIO 대조로 head/tail
transition의 트랙 자연 길이 차이를 발견해 boundary oracle fixture와 함께 수정했다.
기존 version 1의 map hash 재현을 유지하며 새 작업의 downgrade 차단도 검증한다.
