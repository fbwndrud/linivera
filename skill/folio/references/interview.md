# 저장되는 작품 인터뷰

새 작품의 목표·독자 기준을 정하거나 이전 인터뷰를 이어갈 때 `folio_interview get`을 먼저 읽는다.
필수 필드는 purpose, audience, language, surfaceEase(표면 읽기 난도),
conceptPacing(개념 도입 속도), inferenceLoad(추론 부담), complexityRamp(복잡성 증가)다.
임의 자연어 값을 쓸 수 있다. 현재 pending에 있는 항목만 짧게 묻는다.

1. 실제 사용자 답이 오면 `answer { expectedRev, answers:[{field,value,raw}] }`로
   원문(raw)과 해석 값(value)을 함께 기록한다. 첫 기록의 expectedRev는 null이다.
   호스트가 추천한 값을 사용자 원문처럼 기록하지 않는다.
2. 해석한 값을 보여 주고 실제 작가 확인을 받은 항목만
   `confirm { expectedRev, fields:[...], confirmation: 실제 확인문 }`으로 확인한다.
   언어 확인 전에는 독자 축을 확인하지 않는다(같은 confirm에 language를 포함할 수 있다).
3. get의 pending이 비면 인터뷰 확인이 끝났다. 모델 요청에는 확인된 값과 pending이 따로 전달된다.
   인터뷰를 시작한 작품은 필수 확인이 남아 있으면 원고 확정이 hard 차단된다.

같은 값·언어면 앞선 확인이 유지된다. 축 하나를 바꾸면 그 축만 재확인한다.
언어를 바꾸면 language와 네 독자 축을 다시 확인한다. 과거 답/확인은 이력에 남는다.
브리프 반복은 `context { expectedRev, brief }`로 문맥에만 기록하며 답/확인을 만들지 않는다.
새 대화에서는 원문과 확인을 get/history로 읽는다. revision을 지정하면 당시 프로필을 읽는다.

INTERVIEW_REV_STALE이면 최신 get으로 동시 변경을 확인한다.
INTERVIEW_RUN_OPEN이면 열린 실행을 마치거나 작가가 skip한 뒤 프로필을 바꾼다.
INTERVIEW_ANSWER_MISSING은 아직 답하지 않은 항목이고, 호스트가 추측해 채우지 않는다.
