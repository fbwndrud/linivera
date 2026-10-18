# 정본·미해결 질문·인터뷰 엔진과 안전 수정 이식

상태: Linivera main에 이식 구현, 검증·독립 검토 진행 중.
사용자 요청(2026-10-18): 앞선 동명/근거/상태 안전 수정과 후속 정본·질문·인터뷰를
구체화해 구현하고, Linivera 최신 main에 맞춰 PR을 올린다.
기준 commit: `656e437edd06be3d961f570ca24825a43debfa2b`.

## 범위와 기존 기능

기존 동적 추적은 plan·subject·observation·coverage·backfill의 정본이다.
새 lore는 관찰을 자동 채택하지 않으며 작가가 명시 승인하는 별도 설정 판본이다.
기존 추적의 고정 값·위임·영수증을 바꾸지 않는다. 새 profile interview는 원문 답,
해석한 값, 작가 확인을 구분하며 기존 plan.interview를 덮거나 자동 이식하지 않는다.

이전 Folio 작업 트리와 이식 원본은 보존하고 main의 별도 체크아웃에 필요한 변경만 쓴다.
기존 판본·이미지·뷰어·자원 관리·불변 commit intent의 구현을 구버전 코드로 대체하지 않는다.
테스트와 예제는 합성 입력만 사용하고 실제 작품·이미지·개인 경로를 커밋하지 않는다.

## 도구와 모델

- `folio_lore get/history/propose/decide`: evidence/claims/questions 전체 snapshot을
  제안하고 실제 작가의 결정문으로 approve/reject한다. 제안만으로 정본이 되지 않는다.
- evidence는 author/explicit/attributed/inferred/derived로 구분한다. 정확한 source/node
  revision·원본 hash·인용 위치를 고정한다. 원고 근거는 main의 실제 검사 영수증과 commit 쌍이 필요하다.
- claim은 안정 entityId·관점·상태·지지/반박을 갖는다. adopted는 같은 관점의 근거가 필요하고
  inferred는 지원이 되지 않는다. derived는 모든 의존성이 qualify해야 하며 순환을 거부한다.
- question은 연관 주장·지지/반박·필수 여부·적용 노드·상태·해소 이유를 갖는다.
  verified 해소는 같은 관점의 근거와 미해소 반박 부재를 요구한다. author_decision은 실제 승인에 묶인다.
  비필수 질문은 집필을 막지 않고 required 미해결 질문만 해당 노드 확정을 hard 차단한다.
- 공개한 ID의 의미를 이후 판본에서 바꾸지 않는다. 근거 내용 변경은 새 ID를 쓴다.
- `folio_interview get/history/context/answer/confirm`: purpose, audience, language,
  surfaceEase, conceptPacing, inferenceLoad, complexityRamp의 raw/value/confirmation을 보관한다.
  같은 값은 확인을 유지하고 축 변경은 해당 축만, 언어 변경은 언어와 네 독자 축을 다시 확인한다.
  반복 브리프 context는 답/확인을 만들지 않는다. 언어 확인 전에 독자 축만 확인할 수 없다.

## 저장·집필·복구 경계

- 추가만 되는 `.folio/ledger/lore.jsonl`과 `interview.jsonl`을 사용한다.
  각 상태는 parent revision과 정규화 snapshot의 hash로 식별하고 재생 때 원시 답/결정과 대조한다.
- 작품 잠금 안에서 expectedRev를 대조한다(최초 null). 열린 원고/판본/추적 보충 실행 중 쓰기를 거부한다.
  제안 승인 때 원본을 다시 검사하고 변경된 근거를 새 버전으로 조용히 재고정하지 않는다.
- 현재 조회는 유효 canon과 stale 근거/주장을 구분한다. 원본 파일만 사라져도 lore 조회는 무효 상태를
  보여 주지만 일반 집필은 기존 WORK_INVALID를 유지한다. pinned revision은 원본 없이도 동일하게 읽는다.
- 모델 요청·검사·영수증 refs에 lore의 공개 판본+현재 유효성 digest와 interview revision을 고정한다.
  판본 요청에도 제공하되 출력 언어는 기존 variant.lang을 따른다. work.yaml.language는 출판 메타데이터다.
- 새 확정 시 미확인 인터뷰·무효 adopted 근거·필수 미해결 질문과 누락/변경 refs를 hard 차단한다.
  인터뷰/정본이 없는 기존 작품은 같은 동작이다. toggle이나 팩으로 이 잠금을 끌 수 없다.
- 이미 기록된 영수증의 중단 복구는 그 불변 입력과 결정을 재사용한다. 이후 근거 변화 때문에
  새 영수증을 만들거나 이미 기록된 작업을 임의 폐기하지 않는다. 대상 bytes 충돌의 기존 규칙도 유지한다.
- 새 판본/프로필은 기존 원고를 stale/recheck로 표시한다. 재검사는 본문을 고치지 않는다.
  추적 보충은 원고 확정이 아니며 인터뷰/질문의 결정 완료로 오인하지 않는다.

## 앞선 안전 수정

Vibelore PR #29/#26, 이슈 #27/#28의 의도와 대조한 안전 수정도 이식한다.

- 동명·별칭 검색은 surface별 후보 ID 전체를 보존한다. 확정 사용으로 첫 ID를 선택하지 않고
  index에 ambiguous, 모델 요청에 ambiguousReferences를 표시한다. 사건 쓰기는 명시 ID를 유지한다.
- 관리 자산 검토에 연결된 정의의 rev를 고정한다(관리 추적 대상 포함). 변경/삭제/버전 미상은
  review_stale이며 현재 승인으로 사용하지 않는다. 과거 검토·결정은 추가만 되는 이력으로 남긴다.
- 선택적 brief.scope.nodeIds로 장면 참조를 제한한다. 범위 밖 attach·직접 참조·기존 사용을
  남기는 범위 축소를 거부한다. 생성 초안은 보존하고 skip 후 고쳐 재시작할 수 있게 한다.
- 자료 인용은 당시 revision·원본 bytes hash·위치를 보관한다. 옛 버전 미상과 변경된 자료는
  재연결 대상으로 표시한다. 추출 요청 중 자료가 바뀌면 옛 답을 새 자료에 재고정하지 않는다.

## 완료 기준

- [x] 현재 main의 인터페이스/추적/판본/이미지/복구 경계를 대조하고 책임별 모듈로 이식.
- [x] 제안 비자동채택·관점·DAG·근거 없는 해소·영수증 위조·동시 쓰기 회귀.
- [x] 인터뷰 답/확인 유지·변경 축·브리프·새 stdio 세션 재개 회귀.
- [x] 요청/영수증 refs·hard 차단·stale/recheck 연결.
- [ ] main의 관리 대상·판본·영수증 기록 후 중단 복구와 통합 회귀 확인.
- [ ] 전체 lint/typecheck/backend·viewer 테스트와 새 tarball 설치 예제 검증.
- [ ] Standards/Spec 독립 검토 지적을 해결하고 최종 증거 기록.
- [ ] 관련 변경만 commit/push한 뒤 GitHub PR을 만들고 현재 대화에 첨부.

## 한계

형식·인용·권한·hash 검증은 문장의 의미와 진실성을 보증하지 않는다.
모델의 발견 품질은 별도 평가다. 전체 웹툰 제작 상태/시점 관리나 새 UI를 추가하는 범위가 아니다.
기존 추적과 lore 사이에서 주장을 자동 변환하거나 질문을 자동 해소하지 않는다.
