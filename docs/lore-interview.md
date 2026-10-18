# 세계관 정본과 저장되는 인터뷰

Linivera는 작가가 결정한 설정과 원문 근거, 인물의 믿음, AI의 추론을 구분해 보관한다.
작가가 승인한 세계관 판본과 독자 기준을 집필 요청에 전달하며 원고 영수증에도 버전을 고정한다.
모델 호출·의미 판단은 호스트가 수행하고 Linivera는 형식·인용·참조·승인 이력을 검증한다.

## 먼저 작품 인터뷰하기

`folio_interview get`으로 저장된 원문 답과 아직 확인하지 않은 pending을 읽는다.
목표(purpose), 독자(audience), 언어(language), 표면 읽기 난도(surfaceEase),
개념 도입 속도(conceptPacing), 추론 부담(inferenceLoad), 복잡성 증가(complexityRamp)가 필수 항목이다.

```json
{"op":"answer","expectedRev":null,"answers":[{"field":"language","value":"ko","raw":"한국어로 쓸게요."}]}
```

모든 호출에 작가가 고른 작품 폴더의 절대 경로 `root`를 함께 전달한다.
실제 답의 원문과 해석한 값을 함께 저장하고, 해석을 작가에게 보여 준 뒤
`confirm { expectedRev, fields, confirmation }`으로 확인한다. 사용자 확인을 AI가 대신하지 않는다.
expectedRev는 직전 get/쓰기 응답의 revision이다.

같은 값을 다시 답하면 기존 확인이 유지된다. 한 독자 축만 바꾸면 그 축만 재확인한다.
언어가 바뀌면 언어와 네 독자 축을 다시 확인한다. 반복한 원래 브리프는 context로 남기며
새 답이나 확인으로 취급하지 않는다. 새 대화에서도 get/history로 이어갈 수 있다.
인터뷰를 시작했으면 필수 확인을 마쳐야 원고를 확정할 수 있다. 기존 인터뷰 없는 작품은 그대로 쓴다.

## 세계관 설정 제안과 채택

`folio_lore propose { expectedRev, snapshot }`으로 전체 evidence/claims/questions 목록을 제안한다.
snapshot은 현재 정본을 교체할 후보이며, 제안만으로는 채택되지 않는다.
작가가 실제로 결정한 뒤 `decide { expectedRev, proposalId, action: approve | reject, decision }`을 호출한다.
같은 제안 ID를 두 번 승인하거나 오래된 revision으로 채택할 수 없다.

- evidence는 author(작가 설정), explicit(명시 원문), attributed(인물 발언),
  inferred(추론), derived(다른 근거에서 파생)로 구분한다.
- claims는 엔티티 ID, 관점, 상태, 지지(support)·반박(against) 근거 ID를 갖는다.
  adopted는 해당 관점의 검증 가능한 지원 근거가 필요하다.
- questions는 미해결 항목·연관 주장·지지/반박·필수 여부·해소 이유를 보관한다.
  required 기본값은 false라서 미해결이어도 집필할 수 있다. required:true는 지정 노드의 확정을 막는다.

세계 관점은 perspectiveId:null, 인물 관점은 그 엔티티의 안정 ID다.
인물 A의 사적 믿음이 세계 사실이나 인물 B의 지식으로 전이되지 않는다.
추론은 정본 지원이 되지 않고 파생 근거는 모든 의존성이 qualify해야 한다.
검증된(verified) 질문 해소에는 같은 관점의 지원 근거와 미해소 반박이 없는 상태가 필요하다.
작가 결정으로 해소할 때도 명시적 판본 승인과 이유가 남는다.

## 근거와 판본 확인

자료 근거의 anchor에는 자료 ID·revision·인용을, 원고 근거에는 확정 노드 ID·본문 hash·인용을 적는다.
원고는 실제 검사 영수증과 확정 기록이 일치해야 한다. 반복 인용은 정확한 span으로 특정한다.
텍스트 span의 start/end는 UTF-16 위치이며, PDF 등은 작가가 등록한 declared span ID를 쓴다.
PDF의 시각 내용이나 인용이 주장의 의미를 증명하는지는 호스트·작가가 검토한다.

get은 현재 canon(세계 사실), perspectives(인물 관점), evidence, claims, questions와
오래된 근거를 보여 준다. `get { revision }`은 그때의 불변 snapshot을 반환한다.
`get { proposalId }`은 중단 후에도 승인 전에 제안 내용을 다시 확인할 수 있게 한다.
과거 근거/주장/질문 ID를 다른 의미에 재사용하지 않는다. 새 의미나 근거는 새 ID를 만든다.

원본이 바뀌거나 사라지면 현재 근거는 무효이며 영향을 받은 adopted 주장은 원고 확정을 막는다.
현재 lore 조회에서는 원본 파일 손실도 오래된 근거로 표시한다. 일반 집필은 자료 파일 복구를 요구한다.
역사 판본은 원본이 사라져도 동일하게 읽을 수 있다. 기록장·과거 영수증은 현재 내용에 맞춰 고치지 않는다.

## 집필과 변경

열린 실행 중에는 정본·프로필 변경을 거부한다. 실행을 끝내거나 작가가 skip한 뒤
변경하고 다시 시작한다. 이미 영수증이 기록된 committing 실행은 원래 잠금대로 끝낸다.
새 정본·프로필은 기존 원고를 stale/recheck로 표시한다. 재검사는 본문을 자동 수정하지 않으며
검토한 새 판본을 재검사 기록에 고정한다. 자료의 오래된 근거는 새 제안/승인으로 갱신한다.

합성 stdio 예제는 `node examples/context.js`로 실행한다. 실제 작품·실제 사용자 결정을 생성하지 않으며
임시 폴더를 사용한 뒤 지운다.

판본 실행도 같은 정본/프로필 판본을 고정하지만 출력 언어는 선언된 variant.lang을 따른다.
출판 언어 메타데이터는 work.yaml.language다. 언어 인터뷰를 바꾼 경우 작가가 해당 설정도
의도한 언어인지 확인한다. 인터뷰 도구는 기존 설정 파일이나 추적 계획 인터뷰를 자동 변경하지 않는다.
