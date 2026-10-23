# 기능별 입력·출력 명세

명세는 파트너 이름이 아니라 `provider/product/capability/model/endpoint/schemaVersion`으로
식별한다. `packs/production/capability-catalog.js`의 버전 1 명세를 JSON Resource로 보관하고
그 정확한 판본을 자료 대조와 맥락 묶음의 입력으로 사용한다. 공급자 문서 확인일은
2026-10-23이다. 이는 계정의 가용성·실행 권한·권리 확인일을 뜻하지 않는다.

`listCapabilitySpecs()`, `getCapabilitySpec(id)`는 복사한 명세를 반환한다.
`validateCapabilitySpec(value)`는 보관 JSON을 정본과 비교하여 필드·근거·출력 계약 변조를
거절한다. `validateCapabilityRequest(specOrId, request)`는 기존 generation-request 및
outputSpec 검사에 더해 명세 identity, 모델, 파라미터, 필수 판본 binding, 출력 역할과 개수를
검사한다. 파일 바이트·내용·규격·권리·선택·승인은 별도 자료 대조와 기존 Input 잠금이 검사한다.
Meshy model slot은 개수뿐 아니라 `target_formats`의 모든 형식을 수용하는 MIME를 가져야 한다.
예를 들어 GLB 요청에 OBJ만 허용하거나 GLB/OBJ 요청에 GLB만 허용하면 모순된 계약으로 거절한다.
공식 MCP 호스트의 `prepare`도 이 대표 명세 검사를 재사용하며, 모순된 요청은 도구 호출 전에 차단한다.

## 실행 가능한 대표 명세

공통 `schemaVersion`은 `linivera-capability-v1`이며, 공급자 전체 API의 버전 번호를
주장하지 않는 저장소 계약 버전이다. 아래 `official-partial`은 공식 문서에서 확인한 일부와
기존 연결기가 실행하는 범위의 교집합이다. 연결기 밖의 새 옵션은 거절한다. 명세 경로를
사용하지 않던 역사 generation-request/Input의 스키마·판본을 수정하지 않는다.

| 명세 ID | provider / product / capability / model / endpoint | 입력 | 출력·관측 상태 |
|---|---|---|---|
| `fal-flux-schnell-v1` | fal / flux / text-to-image / flux-schnell / fal-ai/flux/schnell | 정확한 text/plain prompt 필수. 이미지 크기·seed·단계·guidance·안전 설정·형식·가속은 선택. num_images 1~4는 연결기 제한. sync_mode true는 보관 가능한 비동기 응답 계약과 맞지 않아 거절 | 후보당 image 1개, JPEG/PNG. accepted/running/complete/partial/unknown. 누락 후보를 만들어내지 않음 |
| `elevenlabs-tts-timestamps-v1` | elevenlabs / tts / text-to-speech / eleven_multilingual_v2 / /v1/text-to-speech/{voice_id}/with-timestamps | 정확한 text/plain text 필수. voice_id는 endpoint의 필수 식별자. 대표 출력은 mp3_44100_128. 정규화·seed·voice 설정·앞뒤 문맥·dictionary는 선택 | audio 1개와 선택 alignment JSON. complete/partial/collection-unavailable. 원문 alignment가 없으면 연결기는 partial로 보관 |
| `meshy-text-to-3d-preview-v1` | meshy / text-to-3d / text-to-3d / meshy-7.1 / /openapi/v2/text-to-3d | mode=preview, 정확한 text/plain prompt(1~800), ai_model=meshy-7.1, 고유 target_formats 필수. should_remesh 선택. formats는 glb/obj/fbx/usdz/stl/3mf | 요청 format별 model 파일, 관측한 선택 material/texture와 bundle. accepted/running/complete/partial/failed/canceled/unknown. preview는 무텍스처 geometry이며 refine는 별도 작업 |
| `local-broker-v1` | local / broker / transform / host-defined / local-broker/v1 | instruction text 판본과 source 파일 판본 필수(파일당 2GiB). context-package 판본 선택 | result JSON 1개. complete/partial/failed/unknown. 호스트 로컬 합성 변환 계약, `user-declared` |

문자열/숫자/boolean/배열/객체의 타입과 확인 가능한 범위·열거값을 명세 `inputs[].constraints`에
기록한다. `source=text`와 `source=parameter`는 값이 있어도 다른 역할이다. 전자는 정확한
Resource 판본의 inputBindings가 필요하며 후자는 request의 설정 값이다. `file/resource`는
inputBindings에서 찾는다. MIME나 파일명만으로 그 내용의 적합성을 증명하지 않는다.

조건부 효과도 구별한다. ElevenLabs의 previous/next request IDs가 지정되면 대응 text보다
우선하므로 양쪽을 지정한 것을 두 자료가 모두 실제 소비됐다는 뜻으로 해석하면 안 된다.
기본 모델의 language_code 적용 여부·실제 voice 접근·요금제는 별도 확인 대상이다.
현 명세의 각 대표 기능에는 추가 파일을 강제하는 조건부 필수 입력이 없다.

공급자 응답은 관측이다. fal의 이미지 크기/seed, 음성 정렬, Meshy task 상태와 다운로드 파일은
관측한 범위만 보관한다. 파일 내용·재생·모델 복원·생성 품질·권리·승인을 대신하지 않는다.
모델 alias가 변경되지 않는다는 보장은 없으며 정확한 공급자 모델 내부 버전은 미확인이다.

## 공식 근거와 미확인 조건

- [fal FLUX schnell API](https://fal.ai/models/fal-ai/flux/schnell/api): 입력/출력 필드와
  비동기 queue 경로 확인. 미기재 prompt 길이·이미지 크기 상한을 추정하지 않는다.
- [ElevenLabs Create speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps):
  voice endpoint, 기본 모델/출력, audio_base64와 선택 alignment 확인. pronunciation dictionary와
  앞뒤 request IDs는 각각 최대 3개. 최신 audio_effects와 다른 모델/codec은 이 명세 밖이다.
- [Meshy Text to 3D](https://docs.meshy.ai/en/api/text-to-3d): preview/refine 구분, prompt 상한,
  현재 standard 모델 meshy-7.1과 target_formats 확인. 기타 geometry 옵션과 smart-topology는
  이 명세 밖이다. 기존 연결기의 역사 모델 문자열을 이번 확인으로 소급 거절하지 않는다.

명세의 `evidence.checkedAt/sources/scope/unknown`을 판본과 함께 고정한다. 문서 변경을 발견하면
기존 ID와 출고 hash를 보존하고 새 ID의 명세를 추가한 뒤 새 Resource로 보관·재대조한다.
확인일만 바뀌어도 기존 ID를 덮어쓰지 않는다. 과거 보고·묶음·Input은 보존한다.
출고 절차와 보고 알고리즘 호환은 [카탈로그 판본 보존](catalog-history.md)을 따른다.
새 공급자 조건을 네트워크로 자동 갱신하거나 알 수 없는 출력 의미를 채우지 않는다.

## 로컬 브로커 사용 예

```js
const spec = getCapabilitySpec('local-broker-v1');
const request = {
  version: 1, ...spec.identity,
  parameters: { instruction: '합성 source 값과 맥락에서 다음 결과를 계산한다' },
  inputBindings: [
    { fieldPath: 'instruction', role: 'instruction', revisionId: instructionRevisionId },
    { fieldPath: 'source', role: 'source', revisionId: sourceRevisionId },
    { fieldPath: 'context', role: 'context', revisionId: packageRevisionId },
  ],
  outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'next', slots: [
    { role: 'result', required: true, acceptableMediaTypes: ['application/json'] },
  ] }] },
};
validateCapabilityRequest(spec, request);
```

대조 보고가 request와 맥락 묶음을 서로 참조하지 않도록 context 없는 request를 먼저
대조할 수 있다. 단일 작업 공간 예제는 그 보고와 명세·요청·필수 맥락을 한 package에 넣고,
그 package 하나를 Input으로 봉인한 뒤 포함된 정확한 요청으로 v2 Operation을 시작한다.
request의 source/instruction binding과 보고·고정 Input 판본이 같은지 검증한다.
수동 capture/export는 확보한 출력 반입 계약이며 원래 생성 입력을 안다고 주장하지 않는다.
이 브로커 작업 입력과 원래 공급자 생성 입력을 구별한다.

37개 파트너별 조사/실행/선언 범위는 [파트너별 명세 현황](capability-partner-support.md)을 따른다.
