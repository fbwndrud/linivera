# 리니베라 · Linivera

**원본부터 결과까지, 연결해서 관리하세요.**

[English](README.md) · [다운로드](https://github.com/fbwndrud/linivera/releases/tag/v0.1.2) · [첫 작품 쓰기](docs/writing-guide.md) · [문제 신고](https://github.com/fbwndrud/linivera/issues)

리니베라는 AI와 작업하는 프로젝트의 데이터를 내 컴퓨터에서 관리하는 도구입니다. 원본 문서·구조화 데이터·그림과 수정본·근거·검토 기록을 함께 보관합니다. 집필은 활용 사례 중 하나입니다. Studio에서 글을 읽고, 근거를 따라가고, 다시 확인할 부분을 볼 수 있습니다. 완성한 원고는 웹이나 EPUB으로 내보냅니다.

**0.1 계열은 로컬 사용을 위한 초기 버전입니다.** 집필하려면 stdio MCP를 지원하는 AI 프로그램이 필요합니다. 연결한 AI가 글을 쓰고, 이미지 도구를 지원하면 그림도 만듭니다. 리니베라는 파일과 기록을 관리합니다. 화면은 한국어와 영어를 선택할 수 있습니다.

![합성 예시를 연 Studio](https://github.com/fbwndrud/linivera/releases/download/v0.1.1/linivera-studio-preview.png)

*미리 정한 합성 입력·AI 응답과 모의 승인으로 만든 예시 화면입니다.*

## 설치

쓰는 AI 프로그램에 저장소 주소를 주고 부탁하세요.

> https://github.com/fbwndrud/linivera 를 MCP 서버로 등록해 줘. README에 나온 빌드된 릴리스 패키지를 사용하고, 연결을 확인한 뒤 새 작품을 시작하자.

**Node.js 24**가 필요합니다. 22.13 이상인 22 버전과 26 버전도 지원합니다. 릴리스 패키지에는 Studio가 들어 있어 저장소 복제·빌드·절대 경로 편집이 필요 없습니다. 첫 실행 때 npm이 패키지와 의존성을 내려받습니다. npm 레지스트리에는 아직 게시하지 않았으며 GitHub 릴리스에서 제공합니다.

<details>
<summary>직접 MCP를 등록하려면</summary>

Claude Code는 사용할 프로젝트에서:

```sh
claude mcp add --scope project linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.2/linivera-0.1.2.tgz
```

Codex:

```sh
codex mcp add linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.2/linivera-0.1.2.tgz
```

Grok CLI:

```sh
grok mcp add linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.2/linivera-0.1.2.tgz
```

Windows에서는 `-- npx` 대신 `-- cmd /c npx`를 사용합니다. 등록 후 AI 프로그램을 재연결하거나 다시 시작하세요. 첫 다운로드 중 시간 초과가 나면 아래 데모를 한 번 실행하고 재연결하세요. Codex의 `startup_timeout_sec`는 필요하면 60으로 늘립니다. JSON 설정은 [영어 README](README.md#installation)를 참고하세요.

</details>

## 먼저 열어 보기

다음 한 줄로 한국어 합성 원고를 만들고 Studio 서버를 엽니다.

```sh
npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.2/linivera-0.1.2.tgz demo --language ko
```

표시된 주소를 브라우저에서 여세요. 화면 상단에서 한국어와 영어를 선택합니다. 고정 응답과 모의 승인으로 동작하므로 AI 계정이나 모델 다운로드가 필요 없습니다. Ctrl+C로 종료합니다.

예시는 표시된 새 임시 폴더에 남습니다. 보관할 위치를 정하려면 `--out ./my-first-example`을 덧붙이세요. 이미 있는 폴더는 덮어쓰지 않습니다. 영어 예시는 `--language ko`를 빼면 됩니다.

<details>
<summary>소스를 받아 개발하려면</summary>

```sh
git clone https://github.com/fbwndrud/linivera.git
cd linivera
npm run setup
node bin/linivera.js demo --language ko
```

소스 개발 경로에서는 의존성을 설치하고 화면을 빌드합니다. 배포 파일은 `npm run package:build`로 만듭니다.

</details>

## 내 작품 시작하기

연결한 다음에는 원하는 작업을 말하세요.

> 리니베라로 짧은 이야기를 쓰고 싶어. 사용할 새 작품 폴더를 먼저 확인하고, 독자와 주인공, 분위기를 질문해 줘. 정한 설정과 원고를 함께 관리하고 초안을 화면에서 보여 줘. 채택 여부는 내가 결정할게.

MCP 연결 때 기본 작업 규칙을 보냅니다. MCP 리소스를 지원하는 호스트는 상세 지침도 서버에서 직접 읽으므로 이 경로에서는 별도 스킬 복사가 필요 없습니다. 리소스를 지원하지 않는 호스트는 `skill/folio/`를 지침 기능으로 연결합니다. [첫 작품 안내](docs/writing-guide.md)와 [영어 시작 안내](docs/getting-started.en.md)를 참고하세요.

리니베라는 어떤 내용을 검사했고 어느 버전을 채택했는지 기록합니다. 관련 자료·설정·그림이 바뀌면 다시 검토할 부분을 표시합니다. 반드시 해결해야 하는 검사 결과가 있으면 채택을 막습니다. 참고 의견만으로 본문을 고치지 않으며, 같은 AI의 검토는 자기검토로 표시합니다.

## 할 수 있는 일

| 하고 싶은 일 | 리니베라가 제공하는 것 |
|---|---|
| 작품을 순서대로 쓰기 | 목차, 단계별 집필, 검사, 작가 결정. 이야기·안내서·그림책용 기본 팩 |
| 중요한 설정 추적하기 | 인물·관계·복선과 사용자 지정 추적 규칙, 원문 근거 |
| 자료 정리하기 | 원본·수정본·파생 결과·메타데이터, 키워드 검색과 선택형 로컬 텍스트·이미지 벡터 검색 |
| 삽화 관리하기 | 그림 ID, 파일 hash, 버전, 검토 상태, 사용 위치. 생성은 연결한 AI 프로그램에서 수행 |
| 한눈에 확인하기 | 원고·검토·출판 화면, 변경 영향, 근거, 관계도, 추적 타임라인 |
| 읽을 수 있는 사본 만들기 | 웹 ZIP, EPUB, 읽기 전용 Studio 사본. PDF는 브라우저 인쇄 사용 |

원고는 Markdown, 설정은 YAML로 저장합니다. 작업과 결정은 작품 폴더 안의 추가만 되는 기록장에 남습니다. 폴더 전체를 백업하면 원고와 기록을 함께 보존할 수 있습니다.

선택 기능인 [벡터 검색](docs/embeddings.md)은 별도 Python과 고정된 Google 멀티모달 모델 가중치가 필요합니다. 설치본에는 포함하지 않습니다. AI의 해석이나 검사 결과도 틀릴 수 있습니다. 채택 기록은 작가의 선택을 나타내며 내용의 진실성을 보증하지 않습니다.

## 완성된 형태의 예시 보기

릴리스에 단편, 그림책, 초보자 실습책, 중편, AI 동향 조사서를 별도 ZIP으로 제공합니다. 각 ZIP에는 작품 사본, 사용한 그림, 웹·EPUB 판본, 읽기 전용 Studio가 들어 있습니다. ZIP을 풀고 README를 읽은 뒤 `node serve.mjs`로 화면을 여세요. [예시 안내](docs/examples.md)를 참고하세요.

앞의 네 예시는 모의 승인이고, 조사서는 작가 승인 대기 중인 초안입니다. 검토는 같은 AI 호스트가 수행했습니다. 작업 흐름과 결과 형태를 보여 주는 예시이며 작품 완성도를 독립적으로 평가한 결과는 아닙니다. 생성 작품은 릴리스에서 따로 내려받습니다. 소스와 엔진 패키지에는 작은 합성 예시만 포함합니다.

## 중요한 작업에 쓰기 전에

리니베라는 내 컴퓨터에서 실행합니다. 호스팅·인증·공동 편집·자동 게시 서비스는 제공하지 않습니다. MCP 서버는 절대 경로를 받으므로 연결한 AI 프로그램에서 접근을 내가 고른 폴더로 제한해야 합니다. Studio와 예시 서버는 내 컴퓨터의 loopback 주소에서 실행합니다.

중요한 작품은 먼저 백업하세요. [운영 안내](docs/operations.md)는 진단·복원·중단된 작업을, [호환성](docs/compatibility.md)은 확인한 환경과 검증 범위를 설명합니다. AI 구독과 생성 비용은 연결한 프로그램의 조건을 따릅니다.

영어 예시는 [영어 모음 ZIP](https://github.com/fbwndrud/linivera/releases/download/v0.1.1/linivera-examples-en.zip)으로 받습니다. 새 단편·그림책·실습 안내서·네 장짜리 이야기와 기존 한국어 단편의 영어 번역이 들어 있습니다. 네 장짜리 이야기는 2,657단어의 구조 실습용 예시입니다. 새 묶음의 Web·EPUB·Studio는 영어 번역을 엽니다. Studio 상단의 **읽는 판본**에서 한국어 원본과 번역본을 전환하세요. 본문·구간 검토 기록·출판 미리보기가 함께 바뀌며 설정과 추적 정보는 원본 기준입니다.

판본 선택은 현재 소스와 새 영어 Studio 묶음에 포함됩니다. 최초 `folio-0.1.0.tgz`와 기존 예시 ZIP은 변경하지 않았습니다. 현재 소스에서 `npm run package:build`를 실행하면 최신 MCP 서버와 빌드된 Studio를 함께 담은 설치 패키지를 만듭니다.

## Folio에서 리니베라로

이름이 리니베라로 바뀌었습니다. 기존 작품 폴더는 변환하지 않습니다. `.folio` 기록장·채택 버전·자료 ID는 그대로 사용합니다. 패키지는 `linivera`, 명령은 `linivera-mcp`·`linivera-view`·`linivera-doctor`이며, 이전 `folio-*` 명령도 동작합니다.

기존 AI 지침과 연결을 유지하려고 MCP 도구 ID는 `folio_*`, 스킬 ID와 폴더는 `folio`·`skill/folio/`를 유지합니다. 선택형 임베딩의 `FOLIO_EMBEDDING_*` 설정도 그대로입니다. 저장소는 [fbwndrud/linivera](https://github.com/fbwndrud/linivera)로 옮겼습니다. 기존 소스에서는 `git remote set-url origin https://github.com/fbwndrud/linivera.git`로 주소를 바꿉니다. 이전 릴리스 파일명과 checksum은 보존합니다.

## 이미 설치했다면 업데이트하기

1. AI 앱의 MCP 연결과 Studio를 종료하고 작품 폴더 전체를 백업합니다. 작품은 설치 폴더와 별도로 보관하세요.
2. npx로 등록했다면 설치 안내의 v0.1.2 패키지 주소로 등록 값을 갱신합니다. 소스 설치는 `git pull --ff-only`와 `npm run setup`을 실행합니다. 릴리스 파일은 새 설치 폴더에서 `npm install --omit=dev --ignore-scripts /path/to/downloaded-package.tgz`로 설치합니다.
3. 별도로 복사한 `skill/folio/`도 새 설치본의 폴더로 바꿉니다. 설치 위치가 달라졌다면 MCP 실행 경로도 고칩니다.
4. MCP를 재연결합니다. 앱이 도구나 지침을 기억한다면 새 대화를 시작하세요. 서버가 알리는 이름·버전이 설치본 `package.json`과 같은지 확인한 다음 작품 상태를 조회하고 Studio를 다시 엽니다.

실행 중인 서버와 예전에 내보낸 읽기 전용 Studio 사본은 자동으로 바뀌지 않습니다. 사본은 다시 내보내세요. 문제가 생기면 이전 설치본의 MCP 경로로 돌아갈 수 있게 남겨 두세요. 이번 변경은 작품 형식과 `folio_*` 도구 ID를 유지합니다.

## 더 읽기와 참여

- **집필:** [첫 작품](docs/writing-guide.md), [그림](docs/assets.md), [자료](docs/resources.md), [Studio](docs/studio.md), [내보내기](docs/export.md).
- **설치와 복구:** [연결](docs/connect.md), [설치](docs/production.md), [운영](docs/operations.md).
- **생성 도구의 데이터 연결:** [파일·묶음·실행·후보별 검토와 후속 제작](docs/production-data.md).
- **반복 제작과 회차 연결:** [판본 선택·수정 의도·지식 묶음·추가 데이터 유형](docs/continuity.md).
- **개발:** [기여 안내](CONTRIBUTING.md), [테스트](docs/testing.md), [보안](SECURITY.md). `npm run check`와 기여 안내의 검증을 실행하세요. 문제 신고에는 합성 재현 데이터를 사용하고 개인 작품이나 인증 정보를 올리지 마세요.

리니베라 코드는 [Apache-2.0](LICENSE)입니다. 별도 예시의 자체 제작 원고·그림·노트는 CC0-1.0이며, 제3자 인용·코드·상표는 제외합니다. Studio에는 제3자 라이선스와 소스 위치를 적은 `THIRD-PARTY-NOTICES.txt`를 포함합니다. [NOTICE](NOTICE)를 참고하세요.
