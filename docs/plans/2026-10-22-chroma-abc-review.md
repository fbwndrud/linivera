# PR #3 A–C 독립 리뷰 반영

사용자 요청으로 별도 세션에서 PR #3의 `7ebf6bc`을 기준점 `891568e`와 비교했다. Standards 축 확정 결함은 0건, Spec 축에서 재현한 결함은 6건이다. 아래 수정은 PR #3에 반영하고 후속 PR #4에도 이어 붙인다.

- 정상 4,000,000-byte ElevenLabs 음원이 반복 base64 정규식의 stack overflow로 응답 map 저장 전에 유실됐다. 비재귀 문자 검사와 canonical decode/encode 대조로 바꿨다.
- fal download가 로컬 파일 descriptor를 거절해 큰 결과를 인라인 MCP 한도 밖으로 보냈다. 공통 capturedFile 계약으로 descriptor를 받고 기존 importFile 스트리밍 경로에 연결했다. 인코딩 후 전송 크기를 고려해 inline bytes 상한은 6MiB로 두며, 정확히 8MiB인 경계도 직렬화 전에 거절한다. ElevenLabs의 큰 음원은 호스트 captureAudio sink를 통해 파일로 반입하며 원래 응답의 hash를 고정한다.
- inputBindings가 비어 있으면 native payload와 requestDigest를 함께 바꿔 봉인과 다른 prompt를 전송할 수 있었다. fal·ElevenLabs의 모든 parameter를 순수 프로젝션으로 대조하며 호스트 raw 값과 core의 redacted 저장본 양쪽에서 검사한다. 기존 redaction의 바이트 의미는 유지한다.
- 완료 후 출력 개수가 달라져도 complete가 유지됐다. 현재 slot 충족을 다시 검사해 partial로 표시하고 과거 그룹의 정확한 prefix는 보존한다.
- 필수 외부 미관측 멤버가 complete 파일로 취급됐다. 반입 시 unavailable로 명시하며, typed 묶음의 반입·읽기에서도 보관 상태를 검사한다. reference-only 입력으로도 우회할 수 없다.
- 인접 정렬 쌍만 검사해 `a`, `a-b`, `a/child`의 파일·디렉터리 충돌을 놓쳤다. 모든 ancestor 경로를 검사하며 missing 파일에도 같은 규칙을 적용한다.

회귀는 합성 fixture만 사용한다. 실제 stdio MCP에서 4MB 인라인 음원·9MiB 파일 음원·9MiB fal 결과 파일을 회수하고, 서버 재시작과 원본 삭제 후에도 정확한 내용 hash·크기와 제출 그룹을 재검증한다. sink 누락·실패·잘못된 hash에서도 음원 응답을 새 생성 없이 다시 회수한다. mapping 없는 native 변조는 전송 전과 직접 core 이벤트 반입 모두에서 거절한다. 실제 공급자 호출이나 과금은 수행하지 않았다.

재검토에서 전송 인코딩 경계·큰 음원 sink·sink의 Buffer 변조·늦은 alignment-only 회수도 보완했다. 원 음원 hash는 sink 호출 전에 고정하며 정렬만 요청하면 sink를 호출하지 않는다. 별도 세션의 최종 재검토와 동일 반례 실행에서 미해결 결함은 없었고 관련 표적 8개가 통과했다. 전체 회귀와 후속 PR #4 통합 검증 결과는 각 PR의 검증 기록을 따른다.
