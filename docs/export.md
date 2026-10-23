# 지면과 내보내기

`folio_export`는 원고·설정·기록장을 읽기만 한다. 웹과 EPUB 출판물은 검사 영수증이 아니며 커밋이나 최신성 보증을 만들지 않는다. 잎 원고와 작품 제목이 없는 작품은 출판하지 않는다. 장면 제목이 빈 경우 표시 제목은 id다. 현재 초안·가져온 원고·손수정 원고도 내보낼 수 있고 경고와 본문 hash를 `manifest.json`에 남긴다.

먼저 `folio_export { root, op: "check", format: "web", variant: "main" }`로 확인할 항목을 본다. 그다음 `folio_export { root, output: "/기존/부모/새폴더", format: "web" }`를 부른다. output은 작품 밖의 아직 없는 폴더이고 부모는 있어야 한다. 기존 출력은 덮지 않는다. 결과의 index.html을 열어 읽고 브라우저 인쇄에서 PDF로 저장한다. 엔진은 PDF 파일을 직접 생성하지 않는다.

`format: "epub"`은 `book.epub`을 만든다. EPUB은 화면 크기에 따라 흐르는 형식이라 명시 지면 좌표를 적용하지 않는다고 경고한다. 지면에만 놓은 그림은 그림 부록에 포함한다. 특정 판본은 `variant: "en"`처럼 고른다. 출판 언어는 명시한 `language` → 원본의 `work.yaml language` 또는 선택 판본의 `lang` → `ko` 순으로 결정한다. 새 작품은 `folio_init { root, title, preset, language: "en" }`처럼 본문 언어를 저장한다. 기존 작품은 자동 변경하지 않으며, 사용자가 원하면 `work.yaml`에 `language: en`을 추가한다. 이 설정은 Studio UI 언어와 독립이다. Intl이 지원하는 언어 태그만 받으며 부적절한 값은 거부한다. 모든 잎의 판본 원고가 있어야 하고 빠진 원고를 main으로 채우지 않는다.

Web·EPUB의 목차는 본문 절과 부모 그룹 제목의 계층을 보존한다. 부모의 계획 메모는
출판 본문에 넣지 않는다. `manifest.json`의 contents에 목차와 anchor를 기록한다.
한국어 판본에서는 목차·자료 목록·출판 안내를 한국어로 표시한다. Studio의 화면 언어와
출판 언어는 별도이며 사용자 원고를 자동 번역하지 않는다. 웹의 긴 목차와 경고 목록은
접어서 보여 주되 미검토 초안 표시는 계속 보여 준다. EPUB에도 미검토 초안 표시를 넣는다.
긴 URL도 좁은 화면에서 줄바꿈하며 원고 내용과 경고 기록은 유지한다.
뷰어의 **Publish**에서도 상단 **읽는 판본 / Reading edition**에서 선택한 판본의 Web ZIP·EPUB을 직접 내려받을 수 있다. 선택하지 않으면 main이다. UI 언어를 바꿔도 원고나 출판 언어는 바뀌지 않는다.
이 다운로드는 작품·기록장이나 서버 출력 폴더에 쓰지 않는다. 정적 검토 사본에서는 비활성이다.
화면 미리보기는 연속 본문이며 자동 페이지 분할은 수행하지 않는다. [화면 사용법](studio.md)을 참고한다.

`layout.yaml`은 작가가 직접 쓰는 정본이다. 엔진은 좌표·원고를 자동 고치지 않는다. 예:

```yaml
version: 1
page: { widthMm: 210, heightMm: 297, marginMm: 15 }
pages:
  - id: left
    spreadId: opening
    side: left
    items:
      - { nodeId: intro, xMm: 15, yMm: 15, widthMm: 180, heightMm: 100, maxChars: 700 }
  - id: right
    spreadId: opening
    side: right
    items:
      - { assetId: cover, xMm: 15, yMm: 15, widthMm: 180, heightMm: 240, fit: contain }
```

nodeId는 잎 원고, assetId는 그림 설명서의 id다. 둘 중 하나만 쓴다. 펼침은 같은 spreadId의 left/right 두 페이지다. 노드는 한 번만 놓으며 그림은 반복해서 놓을 수 있다. 좌표와 크기는 mm다. 페이지·대상·숫자·상한 형식 오류는 거부한다. 겹침·페이지 밖·여백 침범·명시 maxChars 초과는 경고한다. maxChars는 글자 예산이며 실제 글꼴 조판을 보증하지 않는다. 인쇄 미리보기에서 넘침을 확인한다. 빠진 잎 원고는 경고와 함께 끝에 보존한다.

제목·문단·울타리 코드, Linivera 블록 번호/참조·각주·자료 인용·그림·게임북 선택지를 표시한다. 일반 Markdown 전체를 해석하지 않으며 미지원 문법은 글로 남긴다. 원문 HTML과 외부 링크는 실행하지 않는다. XML 금지 문자는 거부한다. 그림은 20MiB까지, 링크·특수 파일·작품 밖 경로는 거부한다. SVG는 정적 도형/글자/그룹/그라디언트 부분집합만 지원하고 스크립트·외부 참조·스타일시트·외부 개체·애니메이션을 거부한다. 일부 복잡한 정상 SVG는 지원되지 않을 수 있다.

페이지 500, 전체 배치 항목·잎·그림·결과 파일 각각 5000, 출력 총 64MiB, layout.yaml 1MiB, 지면 경고 200개까지다. 상한을 넘으면 절단 사유 또는 실패를 명시한다. `features.export: false`는 도구를 끄고 `features.layout: false`는 지면을 적용하지 않으며 이유를 경고한다. 기존 실행/잠금 digest는 바뀌지 않는다.

실패의 cleanupPending이 true이면 details.target/temp를 확인한다. 이 호출이 만든 바뀌지 않은 파일만 정리하며 타인이 넣은 파일은 보존한다. 성공의 EXPORT_TEMP_CLEANUP_PENDING은 결과는 완성됐고 임시 정리가 남았다는 뜻이다. 기존 `folio_view`의 검토 화면 정적 내보내기도 계속 쓸 수 있다.


Studio의 새 판본 선택 기능은 본문 미리보기와 Web/EPUB 다운로드에 같은 판본을 전달한다. 번역 누락은 `EXPORT_VARIANT_MISSING`으로 거부한다. 검토 이후 원본 커밋·원본 본문 또는 용어표가 바뀌면 `EXPORT_SOURCE_CHANGED`·`EXPORT_TERMS_CHANGED` 경고가 나온다. 경고는 자동으로 원고를 수정하거나 승인하지 않는다. 현재 소스와 새 판본 지원 Studio 묶음에 적용되며 이전 배포 파일은 그대로다.
