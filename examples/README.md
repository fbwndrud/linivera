# 합성 예제

생성 이미지가 있는 전체 작품은 MCP 본체와 **별도 ZIP**으로 배포한다. [예시를 고르고 여는 방법](../docs/examples.md)을 참고한다. ZIP은 원고·이미지·근거·기록장·읽기 전용 Studio·Web·EPUB를 함께 보존한다. 아래 내장 예시는 작은 합성 작업 흐름 검증으로 유지한다.

모두 테스트용으로 미리 작성한 합성 입력이다. 실제 작품을 가져온 자료나
Linivera의 모델 집필 실행으로 생성한 결과물은 아니다.

| 입력 | 보여 주는 흐름 |
|---|---|
| `story.json` | 단일 장면: 계획 → 본문 → 추출 → 검사 → 승인 → 커밋 |
| `guide.json` | 안내서: 장 계획 → 절 생성 → 용어 정의 → 절 커밋 → 장 돌아보기 |
| `picturebook.json` | 그림책 원고: 책 → 두 펼침면, 읽을 글과 그림 설명 구분 |
| `fairytale.json` | 동화: 장 → 두 장면, 선택과 결과 연결 |
| `assets.js` | 합성 SVG: 설명서 → URI/파일 인계 → 자기검토 → 승인 → 교체 → 재검토·재승인 |
| `tracking.js` | 세 장르 추적 계획 → 실제 승인 → 숨은 후보 → 원고 확정 → 과거 보충 → 후속 근거 → 재검토·재연결·무결성 공격 거부 |

저장소 루트에서 설치 후 실행한다.

```sh
npm ci
npm run examples
node examples/run.js story
node examples/run.js guide
node examples/run.js picturebook
node examples/run.js fairytale
npm run assets:verify
node examples/tracking.js
```

각 실행은 OS 임시 폴더에 새 작품을 만든다. 출력 JSON의 `root` 아래 `tree/`에서
본문을 읽을 수 있다. `.folio/ledger/receipts.jsonl`에서 영수증·커밋 기록을 확인한다.
예제 실행 파일은 Node MCP SDK로 실제 `bin/linivera-mcp.js`에 연결한다.

직접 위치를 고르려면 **존재하지 않는 새 폴더**를 넘긴다. 부모 폴더는 있어야 한다.

```sh
node examples/run.js all --out /absolute/path/to/new-demo
```

CI에서는 다음 명령으로 검증하고, 이 실행이 만든 임시 폴더를 정리한다.

```sh
npm run examples:verify
```

예제 호스트는 미리 작성한 계획·본문·추출 답을 반환하고, 모델 검사에는
`checked` 목록과 빈 지적을 반환한다. 막는 지적과 참고 의견이 없을 때만
예제 승인을 자동 수행한다. 이는 설치·통신·상태 전이·커밋 검증이며,
모델의 검토 정확도나 문학적 품질을 검증한 결과가 아니다.
실제 집필에서는 호스트가 요청 내용을 수행하고, 작가가 승인한다.

자산 예제는 실제 stdio MCP로 두 임의 출처와 출처 없는 결과를 동일하게 인계한다.
외부 URI 승인 거부, 원본 삭제 뒤 사본 사용, 오래된 승인 거부, 직접 사용 위치와 이력을 확인한다.
합성 SVG와 빈 지적을 사용하며 실제 이미지 생성·시각 검토 정확도 검증은 아니다.
자산 예제는 실행이 만든 임시 폴더를 항상 정리한다.

추적 예제는 inline 합성 문장·인터뷰 답·작가 결정을 사용하고 임시 작품을 항상 삭제한다.
실제 모델 발견 정확도나 모든 장르의 의미 검증 인증이 아니다.
네 위임 중 새 기준·과거 보충은 false로 두어 일회 기록 보충 승인을 검증한다.
후보 비공개, 관리 대상 path:null, 원문 hash 보존, 다음 요청 근거, 보충과 재검토의 차이,
연결 복원, 잘못된 입력, 기능을 꺼도 기록 삭제를 거부하는 경계를 확인한다.

## English fixtures

`node examples/project-continuity.js`와 `--sheet`는 합성 파트너 파일을 공통 Adapter로
보관하고 MCP 재시작 후 프로젝트/atlas/DB 데이터를 두 단계 후속 작업에 사용한다.
DB 또는 스프라이트 판본 변경의 전이 재검토를 검증한다. 실제 브로커/공급자 호출·
모델 생성·게임 복원/배포는 수행하지 않는다. 임시 자료는 항상 정리한다.

CLI examples now default to English. Use `node examples/run.js all --language en --verify`, or the one-command demo in [Getting started](../docs/getting-started.en.md). Use `--language ko` for the original Korean fixtures. The JavaScript `runExamples` API keeps its original Korean default. Both versions use fixed synthetic responses and simulated approval; they never approve a real user work.
