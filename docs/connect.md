# Linivera 연결 안내

집필 방법은 [첫 작품 쓰기](writing-guide.md)에서 읽는다. 이 문서는 연결을 준비하는 사람을 위한 것이다.

## 현재 필요한 것

Linivera는 **로컬에서 실행되는 stdio MCP 서버**다. 설치 없이 쓰는 웹 서비스나 클라우드 작품 저장소는
제공하지 않는다. 소스 체크아웃 또는 준비된 tarball, 지원되는 Node.js, stdio MCP를 쓸 수 있는 AI 프로그램이 필요하다.
npm 레지스트리에는 공개 배포하지 않으며 준비된 패키지는 GitHub Releases에서 받는다. 공개 패키지와 소스 버전은 0.1.3이다. 기존 설치는 새 패키지 URL로 등록하고 MCP를 재연결한다.
AI 사용 비용은 연결한 프로그램의 조건에 따른다.

Node.js 지원 범위와 검증된 환경은 [호환성](compatibility.md)에서 확인한다.
소스를 받은 뒤 그 저장소 안에서 `npm run setup`으로 의존성과 화면을 준비한다.
준비된 tarball은 화면을 포함하므로 설치 후 `linivera-view`를 실행한다. 설치본에서 setup을 반복하지 않는다.
[설치 경로별 명령과 검증](production.md)을 따른다.

## 사용 중인 AI 프로그램에 등록하기

프로그램이 지원하는 MCP 등록 방식에서 다음 값을 사용한다.

| 항목 | 값 |
|---|---|
| 통신 방식 | stdio |
| 실행 명령 | `node` 또는 Node 실행 파일의 위치 |
| 실행 인수 | 소스 또는 설치된 Linivera 패키지 안의 `bin/linivera-mcp.js`의 전체 위치 |

대화 프로그램이 소스 위치를 실제로 읽을 수 있어야 한다. 위치 표시는 내 환경의 값으로 바꾼다.
등록 화면과 명령은 프로그램마다 다르므로 해당 프로그램의 연결 안내를 따른다.
설정을 저장했다는 표시만으로 연결 성공이라고 판단하지 않는다.

`mcpServers` JSON을 받는 앱에서는 다음처럼 등록한다. 다른 앱은 위 표의 값을 등록 화면에 넣는다.

```json
{
  "mcpServers": {
    "linivera": {
      "command": "node",
      "args": ["/absolute/path/to/linivera/bin/linivera-mcp.js"]
    }
  }
}
```

`args`의 예시를 실제 설치 위치로 바꾼다. Windows JSON 경로는 `C:/tools/linivera/bin/linivera-mcp.js`처럼 슬래시를 쓰거나 역슬래시를 두 번 적는다. tarball 설치본은 `node_modules/linivera/bin/linivera-mcp.js`를 가리킨다. 앱이 Node를 못 찾으면 `command`에 Node 실행 파일의 절대 경로를 쓴다.

`skill/folio/`에는 AI가 Linivera를 사용하는 규칙과 쉬운 설명 지침이 있다.
스킬을 지원하는 프로그램이면 폴더 전체를 그 프로그램의 스킬 설치 방식으로 등록한다.
스킬 자동 등록은 Linivera MCP 서버의 기능이 아니다. 서버는 연결 시 기본 사용 지침을 제공한다. MCP resources를 지원하면
`linivera://guides/getting-started`와 `linivera://guides/skill` 및 참조 문서를 읽는다.
resources도 지원하지 않으면 호스트 설정으로 같은 사용 규칙을 전달한다.

## 연결이 됐는지 확인하기

AI에게 “Linivera 도구 연결과 사용 지침을 확인해 줘. 아직 작품을 만들지 마”라고 말한다.
AI가 실제 도구 목록에 접근하고 Linivera 지침을 읽을 수 있으면 준비됐다. MCP initialize가 알리는 서버 이름·버전은 설치본 package.json과 일치해야 한다. 앱에 버전 표시가 없으면 호스트의 MCP 연결 로그 또는 MCP 클라이언트의 초기 응답으로 확인한다.
0.1.3은 `folio_motion`을 포함한 23개 도구를 제공한다. 기존 0.1.2는 22개이므로 설치본의 버전과 구분한다.
연결됐다고 말만 하거나 도구가 보이지 않으면 집필을 시작하지 않고 연결 설정을 확인한다.

작품 저장 위치는 소스 설치 위치와 별도로 작가가 고르고 확인한다.
호스트는 확인한 위치를 도구에 전달해야 한다. 서버가 접근을 작품 하나로 자동 한정해 주지는 않는다.
이 단계의 위치 확인을 마치면 집필 본문에서는 작품 이름과 현재 쓰는 부분을 중심으로 안내한다.

도구 ID는 호환성을 위해 `folio_*`를 유지하며 스킬도 `skill/folio/`에서 읽는다. 등록 이름 `linivera`와 도구 접두어가 달라도 정상이다. 기존 `folio-mcp` 실행 명령은 새 설치본에서도 동작한다.

## 생성 공급자 연결은 따로 확인하기

위 절차는 Linivera MCP 연결이다. 생성 공급자의 설치·도구 노출·인증·권한·plan·credits는
[연결 준비](connection-readiness.md)에서 따로 대조한다. Linivera 연결 성공이 공급자의
유료 실행 준비나 사용자 실행 승인을 뜻하지 않는다. 비밀키는 호스트 secret 관리에 둔다.
보관 파일에서 다음 제작까지의 순서는 [문서 안내](README.md)를 따른다.

## 기존 설치 업데이트

서버와 Studio를 종료하고 작품 폴더 전체를 백업한다. 소스는 `git pull --ff-only` 뒤 `npm run setup`, 준비된 패키지는 새 설치 폴더에 받은 tarball을 설치한다. 복사한 스킬도 새 설치본에서 교체한다. 실행 경로가 달라졌으면 앱 설정을 바꾸고 MCP를 재연결한다. 도구·지침을 캐시하는 앱은 새 대화에서 확인한다.

서버 재연결 없이 파일만 바꾸면 이전 코드가 계속 실행될 수 있다. 정적 Studio 사본은 다시 내보내야 새 화면이 들어간다. 상세 설치·롤백은 [설치 안내](production.md)를 따른다.

[첫 작품 쓰기로 돌아가기](writing-guide.md)
