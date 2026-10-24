# 리니베라 · Linivera

**여러 AI 도구의 작업을 하나의 프로젝트로 이어갑니다.**

[English](README.md) · [사용 안내](docs/README.md) · [예시](docs/examples.md) · [다운로드](https://github.com/fbwndrud/linivera/releases)

리니베라는 AI와 함께 만드는 프로젝트의 자료, 생성 결과, 검토 기록을 관리하는 로컬 작업 공간입니다. 글·그림·음원·영상·3D 파일을 함께 보관하고, 어떤 자료로 무엇을 만들었는지 연결합니다.

이야기의 설정을 그림에 반영하고, 고른 그림과 음원을 영상에 쓰고, 그 결과를 다음 작업에 다시 활용할 수 있습니다. 설정이나 원본이 바뀌면 연결된 결과 중 다시 확인할 부분을 찾습니다. 대화가 바뀌어도 작업을 이어갈 자료와 기록은 내 컴퓨터에 남습니다.

## 무엇을 할 수 있나요?

| 하고 싶은 일 | 리니베라에서 하는 일 |
|---|---|
| 자료와 결과 모으기 | 문서·그림·음원·영상·3D 파일의 원본과 수정본을 보관하고 검색합니다. |
| 여러 도구의 작업 잇기 | 생성 요청, 사용한 자료, 결과 파일을 연결해 다음 제작에 재사용합니다. |
| 이야기 이어 쓰기 | 목차와 장면을 구성하고 인물·설정·복선·근거를 추적합니다. |
| 결과 검토하고 고르기 | 생성 후보를 검토하고, 내가 고른 결과와 선택 이유를 기록합니다. |
| 수정할 범위 찾기 | 자료나 설정이 바뀌었을 때 영향을 받는 후속 작업을 확인합니다. |
| 짧은 영상 조립하기 | 이미지와 음원을 샷·타임라인·영상으로 연결합니다. 로컬 FFmpeg가 필요합니다. |
| 확인하고 공유하기 | Studio에서 원고·자료·검토 기록을 살펴보고, 원고를 웹이나 EPUB으로 내보냅니다. |

연결한 AI 프로그램이 글을 쓰고 생성 도구를 실행하며, 리니베라는 그 자료와 결과를 이어 관리합니다. AI가 내놓은 후보를 채택하는 결정은 사용자가 합니다. 같은 AI가 검토한 결과에는 자기검토 표시가 남습니다.

![Studio에서 원고와 검토 기록을 살펴보는 화면](https://github.com/fbwndrud/linivera/releases/download/v0.1.1/linivera-studio-preview.png)

*미리 정한 입력·AI 응답·모의 승인으로 구성한 예시 화면입니다. Studio는 한국어와 영어를 지원합니다.*

## 설치

MCP를 지원하는 AI 프로그램과 **Node.js 24**를 준비하세요. MCP는 AI 프로그램이 리니베라의 도구를 호출하는 연결 방식입니다.

사용 중인 AI에게 이렇게 요청하면 됩니다.

> https://github.com/fbwndrud/linivera 를 보고 리니베라를 MCP로 연결해 줘. 설치와 연결을 확인한 다음, 내가 정한 폴더에서 프로젝트를 시작하자.

<details>
<summary>직접 연결하기</summary>

Claude Code에서는 사용할 프로젝트 폴더에서 실행합니다.

```sh
claude mcp add --scope project linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz
```

Codex에서는 다음을 실행합니다.

```sh
codex mcp add linivera -- npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz
```

등록 후 AI 프로그램의 MCP를 재연결하세요. Windows 설정과 다른 연결 방법은 [연결 안내](docs/connect.md)를 참고하세요.

</details>

## 먼저 체험하기

다음 명령으로 작은 이야기 예시와 Studio를 열 수 있습니다.

```sh
npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz demo --language ko
```

터미널에 표시된 주소를 브라우저에서 여세요. AI 계정 없이 미리 정한 응답으로 작업 흐름을 체험합니다. 예시는 새 임시 폴더에 저장되며, 서버는 Ctrl+C로 종료합니다.

## 내 프로젝트 시작하기

연결한 AI에게 만들고 싶은 것을 말하세요. 예를 들어:

> 짧은 이야기와 그 이야기에 쓸 그림을 함께 만들고 싶어. 독자와 분위기부터 같이 정하자. 자료와 결과는 리니베라로 관리하고, 후보를 보여 준 다음 내가 고르게 해 줘.

프로젝트를 저장할 폴더와 작업 목적을 정한 뒤, 작은 작업 하나부터 시작하세요. 자료를 모으고, AI와 작업하고, 결과를 고른 다음 다음 작업에 이어 씁니다. 중요한 작업은 폴더 전체를 백업하세요.

## 더 알아보기

- [목적별 사용 안내](docs/README.md): 집필, 자료 관리, 제작 도구 연결의 시작점
- [첫 작품 만들기](docs/writing-guide.md) · [그림 관리](docs/assets.md) · [생성 결과를 다음 작업에 연결하기](docs/production-data.md)
- [Studio 사용법](docs/studio.md) · [완성된 예시 둘러보기](docs/examples.md)
- [설치·업데이트](docs/production.md) · [지원 환경](docs/compatibility.md) · [백업·복구](docs/operations.md)
- [개발에 참여하기](CONTRIBUTING.md) · [변경 이력](CHANGELOG.md) · [문제 신고](https://github.com/fbwndrud/linivera/issues)

[Apache-2.0](LICENSE) · [저작권 및 제3자 고지](NOTICE)
