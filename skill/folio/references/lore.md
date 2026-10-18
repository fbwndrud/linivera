# 세계관 정본과 미해결 질문

세계 사실·인물 관점·추론을 관리할 때 `folio_lore`를 사용한다.
먼저 get으로 현재 revision과 오래된 근거를 읽고 history로 미결 제안을 찾고 get { proposalId }로 내용을 다시 확인한다.
파일 엔티티 ID를 그대로 쓰며 이름이 같은 대상의 ID를 합치지 않는다.

## 제안하고 작가에게 확인받기

1. evidence/claims/questions 전체 목록을 snapshot으로 구성한다. 작가의 설정은
   evidence.basis: author, 원문은 explicit, 인물 발언은 attributed,
   모델 추론은 inferred(한계 필수), 규칙 파생은 derived(dependencies 필수)로 표시한다.
2. `folio_lore { op: propose, expectedRev, snapshot }`을 호출한다. 첫 판본은
   expectedRev:null이다. 아직 현재 정본이 아니다. 응답 snapshot과 변화 내용을 작가에게 보여 준다.
3. 실제 작가가 결정한 뒤 `folio_lore { op: decide, expectedRev, proposalId,
   action: approve | reject, decision: 작가의 실제 결정문 }`을 호출한다.
   제안이 있었다는 이유나 진행 지시만으로 승인문을 만들어 넣지 않는다.
4. 공개된 revision을 기록하고 get으로 현재 상태를 확인한다. 과거를 확인하려면
   `get { revision }`을 쓴다. 예전 snapshot을 현재 파일에 맞춰 고쳐 쓰지 않는다.

## 데이터와 근거

- evidence: `{id,basis,text,perspectiveId?,anchor?,dependencies?,limitations?}`.
  anchor는 `{kind: source | node,id,rev,quote,span?}`다. source get의 revision,
  또는 확정 원고 본문 hash를 명시한다. node는 확정 영수증이 필요하다.
  반복 인용은 span으로 정확히 지정한다(text는 UTF-16 start/end, PDF 등은 declared의 id).
- claims: `{id,entityId,text,perspectiveId?,status?,support?,against?}`.
  status는 proposed/adopted/rejected/superseded다. adopted는 같은 관점의
  검증 가능한 지원 근거가 필요하다. null 관점은 세계, 엔티티 ID는 그 인물의 관점이다.
- questions: `{id,text,perspectiveId?,claimIds?,support?,against?,required?,nodeIds?,status?,resolution?}`.
  status는 open/deferred/resolved다. resolved에는 `{basis: verified | author_decision,reason}`을 넣는다.
  verified는 같은 관점의 근거가 있고 미해소 반박이 없어야 한다.
  required 기본값은 false다. true이면 nodeIds(빈 목록은 전체)의 원고 확정을 막는다.

인물 A의 사적 발언이나 믿음은 세계 사실 또는 인물 B가 아는 사실을 증명하지 않는다.
추론은 정본 지원이 되지 않으며 derived는 모든 의존성이 qualify해야 한다.
정본의 구조 검증이 문장 의미나 진실성을 인증한다는 뜻은 아니다.
모순·지지/반박은 목록에 명시하고, 비필수 미해결 질문은 작가가 원하면 남겨 둔다.
이미 공개된 근거 ID의 내용을 바꾸려면 새 ID를 만든다. 주장/질문 ID의 의미도 재사용하지 않는다.

## 변경과 집필

새 판본은 관련 원고를 다시 확인 대상으로 표시한다. 원고 영수증은 당시 판본을 고정한다.
자료가 바뀌면 현재의 staleEvidence/staleAdopted를 확인하고, 새 근거 ID와 새 제안으로
작가 검토를 받는다. 오래된 지원 근거가 있는 adopted 주장은 원고 확정을 막는다.
원고 실행이 열려 있으면 LORE_RUN_OPEN이다. 해당 실행을 마치거나 작가가 skip한 뒤
정본을 변경하고 재실행한다. 영수증이 이미 기록된 committing 실행은 원래 잠금대로 완료한다.

LORE_REV_STALE은 최신 revision을 다시 읽고 제안/결정을 재검토한다.
LORE_ANCHOR_STALE/LORE_SUPPORT_REQUIRED/LORE_RESOLUTION_UNSUPPORTED는
근거와 관점·질문 해소를 확인해 제안을 고친다. 기록장을 손으로 고쳐 우회하지 않는다.
