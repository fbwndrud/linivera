# 예시를 고르는 방법

Linivera 본체에는 작은 합성 예시가 들어 있다. 이미지가 있는 전체 작품 예시는 별도 ZIP으로 제공한다. ZIP 안에서는 원고와 그림을 분리하지 않는다. 그림 ID·파일·사용 위치·근거·기록장을 함께 유지해야 다른 컴퓨터에서도 작품을 확인할 수 있기 때문이다.

## 처음에는 작은 예시

Studio의 **설정 → 예시 모음**, 작품 개요의 **예시로 시작하기**에서 안내를 볼 수 있다. 자료 전용 작업 공간에도 **예시 모음**이 있다.

> Linivera의 story 합성 예시를 새 폴더에서 실행하고 화면을 열어 줘. 원고와 검토 기록을 함께 설명해 줘.

`story`, `guide`, `picturebook`, `fairytale` 중 고른다. 그림책 합성 예시는 글과 삽화 요청을 보여 준다. 생성 이미지가 있는 전체 그림책은 별도 작품 묶음에서 확인한다. 이 입력은 작게 고정되어 있으며 AI 응답과 승인도 모의 처리다. 실제 AI 글 품질을 보장하는 실험은 아니다.

명령으로 실행한다면 Linivera 소스 또는 설치 패키지 폴더에서 실행한다. 출력 부모는 존재해야 하며 마지막 출력 폴더는 새 이름이어야 한다.

```sh
node examples/run.js all --language ko --out ./my-new-examples
```

기존 [합성 예시 안내](../examples/README.md)에 개별 실행과 로컬 검증을 설명했다. 0.1.3의 제작 데이터·P0~P4·필수 맥락 묶음 예제도 여기서 찾을 수 있다. 전체 사용 경로는 [문서 안내](README.md)를 따른다.

## 전체 작품 예시

배포 모음에서 **책 읽기**, **Studio 살펴보기**, **전체 ZIP**, **EPUB**를 고른다. 별도 생성 작품은 Git이나 npm 본체에 넣지 않는다. [0.1.0 릴리스](https://github.com/fbwndrud/linivera/releases/tag/v0.1.0)에서 작품별 ZIP과 전체 예시 모음을 받는다.

| 파일·폴더 | 용도 |
|---|---|
| `README.md` | 처음 여는 사람을 위한 안내와 예시의 승인 상태 |
| `work/` | Linivera로 이어 작업할 원고·설정·자료·이미지·기록장 사본 |
| `studio/` | 구조·인물·관계·근거·검토 기록의 읽기 전용 화면 |
| `web/index.html` | 브라우저에서 읽거나 인쇄할 원고 |
| `epub/book.epub` | 전자책 앱에서 읽는 EPUB |
| `manifest.json` | 포함 파일의 hash·모의 승인/승인 대기·콘텐츠 라이선스 상태 |
| `serve.mjs` | Node.js로 실행하는 전용 로컬 미리보기 서버 |

ZIP을 푼 폴더에서 `node serve.mjs`를 실행하고 표시된 주소를 연다. 읽기 전용 서버는 `work/`의 원고·기록장이나 작업 API를 제공하지 않는다. 엔진이나 모델은 ZIP에 넣지 않는다.

수정하려면 폴더 전체를 한 번 더 복사하고, 연결한 AI에게 `work/`의 상태와 대기 중인 질문을 먼저 확인하도록 요청한다. 모의 승인 기록을 실제 작가 승인으로 해석하지 않는다. 계속 쓰는 작업 사본에서는 사용자의 실제 의사에 따라 승인한다.

엔진 라이선스와 작품 콘텐츠 라이선스는 구별한다. 0.1.0 예시의 자체 제작 원고·그림·설정·노트는 CC0-1.0이다. 제3자 인용·코드·상표는 제외하며 Studio 소프트웨어에는 별도 라이선스가 적용된다. 조사 노트는 출처 원문의 완전 재배포본이 아니다.

## 배포 묶음 만들기

유지관리자는 이미 검토한 공개용 작품만 명시적인 manifest로 고른다. `examples` 배열의 각 항목은 `id`, `title`, `description`, 절대 경로 `root`, `approval`(`simulated` 또는 `pending`)과 명시적인 `contentLicense`(`CC0-1.0` 또는 `not-set`)를 가진다. `language`(예: `en`), `variant`(기본 `main`), 읽기본에만 적용하는 `titles`(노드 ID → 제목)를 선택할 수 있다. 모음 전체의 `galleryLanguage`는 `ko` 또는 `en`이며 기존 기본값은 `ko`다. 콘텐츠 라이선스를 생략하면 재사용 허락을 부여하지 않는 `not-set`으로 처리한다. 이 manifest와 출력물은 `.local-output/`에 둔다.

```sh
npm --prefix viewer run build
npm run examples:bundle -- .local-output/chosen-examples.json .local-output/new-example-release
```

출력은 원본과 분리된 새 폴더에만 만든다. 링크를 해석한 실제 경로로 경계를 확인한다. 실패 시 부분 출력은 보존하며, 다른 프로세스가 추가한 파일을 삭제하지 않는다. 복사한 작품의 진단이 실패하거나 링크·기기 파일·호스트 경로·토큰이 발견되면 빌드는 실패한다. 기록장을 마스킹하거나 수정해서 통과시키지 않는다. 원고와 기록장의 복사 전후 hash를 비교하고, SQLite 캐시·잠금·호스트 통신 로그를 제외한다. 살아 있는 원본을 수정하지 않는 별도 사본을 빌드 대상으로 사용하는 것이 좋다.

결과에는 작품별 ZIP, `SHA256SUMS`, `catalog.json`, 한국어·영어 배포 화면이 생긴다. 출력 폴더에서 `node serve.mjs`로 로컬 검토한다. 이 명령은 GitHub 업로드나 npm 게시를 하지 않는다. 공개 릴리스가 준비되면 ZIP·checksum·catalog와 정적 예시 모음을 함께 제공할 수 있다.

## English

[Download the English example library](https://github.com/fbwndrud/linivera/releases/download/v0.1.1/linivera-examples-en.zip). Individual `linivera-example-*.zip` downloads and checksums are in the [v0.1.1 release](https://github.com/fbwndrud/linivera/releases/tag/v0.1.1). Earlier v0.1.0 files remain unchanged.

- **The Last Light at Platform Nine:** an original three-scene story, 1,009 words.
- **Pip and the Pocket of Wind:** a four-spread picture-book manuscript, 107 words, with two illustrations.
- **Your First Work with Linivera:** a new, fixed synthetic beginner guide covering a brief, sources, review and sharing. It replaces the earlier Folio-titled guide in the new collection.
- **The Atlas of Borrowed Rooms:** four chapters and eight scenes, 2,657 words; a structural example rather than a full-length novella. The brass key has four recorded custody states with passage references.
- **The Mailbox After the Rain:** an English translation preserving its Korean original, with a term map and three source-bound review receipts. Studio, Web and EPUB open the English reading edition. Use **Reading edition** to switch the text and review records; settings and tracking describe the original.

All five use simulated approval and same-host review. They show the workflow and output format, not an independent assessment of translation or literary quality. The first-work guide uses scripted synthetic responses; the other works were created earlier by the assistant and recorded through public MCP tools. Their source records are preserved when repackaging.

Extract a downloaded ZIP, read its English `README.md`, then run `node serve.mjs` to open the read-only Studio. Web and EPUB are included. Copy the whole folder before editing. Original example content is CC0-1.0; third-party quotes, code and trademarks are excluded, and Studio software retains its own licenses.

For a first English example without downloading the whole collection, use the one-command [demo](getting-started.en.md#try-an-example-before-writing). The shipped CLI examples default to English; `--language ko` selects Korean. The `runExamples` JavaScript API retains Korean as its default for existing callers.
