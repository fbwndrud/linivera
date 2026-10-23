# 로컬 검증

읽기 전용 진단은 `node --test test/diagnostics/*.test.js`로 검증한다.
파일 bytes·mode·inode·mtime·ctime·링크와 숨김/빈 디렉터리까지 전후 비교하며 index·gate 생성,
중단된 쓰기 복구, 승인·기록장 변경이 없는지 확인한다. 원고·Resource 사본을
모든 기록자 종료 후 새 폴더로 복사하고 공개 MCP를 두 번 재연결해 이력을
검증한다. `npm run package:verify`는 새 설치본의 실제 `linivera-doctor` bin도
합성 폴더로 실행한다. 이는 자동 손상 복구·전원 손실·실제 작품 검증이 아니다.

## 로컬 검증 명령

```sh
npm run setup
npm run check
npm --prefix viewer test
npm run examples:verify
npm run assets:verify
npm run production:verify
npm run package:verify
npm run benchmark:local
```

`check`는 lint·JS 타입 검사·전체 테스트다. `examples:verify`는 미리 작성한 합성 입력을
공개 MCP 서버로 실행해 네 원고 예제와 동적 추적의 본문·커밋·기록장·최종 상태를 확인한다.
`assets:verify`는 합성 SVG를 실제 MCP로 등록·인계·검토·승인·교체·재승인한다.
`package:verify`는 배포 tarball을 새 임시 폴더에 만들고, 개발 의존성 없이 설치한 뒤
설치된 네 원고 예제·자산 예제·동적 추적 예제와 production 경로에서 MCP·linivera-view 실행 파일을 검증한다. 생성·회차·구조·편집·프로젝트·배포와 통합 P0~P4의 후속 두 작업·역사 Input을 실행하고, 출고 명세 10개 hash와 현재 준비 차단도 확인한다.
`production:verify`는 모델 없는 합성 그림책·Resource 전용 workspace의 stdio→HTTP→웹/EPUB·정적 사본을 확인하고 정리한다.
viewer/dist를 명시적으로 빌드해 포함하며 설치 hook·모델 가중치·Python 설치는 없다.
추적 문서·스킬·예제 포함과 테스트·계획·작품 상태·출력 경로 제외,
개발 의존성의 실제 설치 경로 부재도 확인한다. 의존성 설치에는 레지스트리 접근이 필요하다.
이 검사는 원본 체크아웃의 `node_modules`를 설치본에 연결하지 않는다.

원고·팩·기록장에 영향을 주는 변경은 새 실패 경로를 재현하는 회귀 테스트로 검증한다.
커버리지 100%를 목표로 단순히 같은 구현을 반복하는 테스트를 추가하지 않는다.

## 검증 운영 방식

GitHub Actions CI는 사용하지 않는다. push·pull request 시 자동 검증은 실행하지 않으며,
변경 범위에 맞는 위 로컬 명령을 실행하고 결과를 기록한다.
OS·Node 지원 범위와 실제 검증한 환경은 구분한다.

## 2026-10-24 제작 데이터 통합 검증

#2~#9 병합 결과 `7221374`는 검증한 `3cde927`과 파일 tree가 같다.
macOS arm64·Node 24.19.0에서 lint·타입 검사·backend **2058/2058**과 새 tarball 설치를 통과했다.
통합 합성 P0~P4는 60개 판본·두 후속 작업·거절 21종·변경 9종의 재검토와 역사 Input을 확인했다.
카탈로그 판본 추가 뒤 재시작해도 구판 보고서·연결 점검·v1/v2 Input hash가 유지되는 회귀를 포함한다.
실제 공급자 호출·계정 권한·유료 생성·편집기 복원·외부 게시·법적 승인은 검증하지 않았다.

## 2026-10-24 문서·버전 0.1.3 검증

macOS arm64·Node 24.19.0에서 `npm run check`의 lint·타입 검사·backend **2058/2058**,
`npm --prefix viewer test` **74/74**를 통과했다. 실패·취소·skip은 모두 0이다.
전체 검사에 포함된 새 tarball 설치는 0.1.3 manifest/MCP identity·23개 도구·동봉 guide,
개발 의존성 부재·공개 예제·P0~P4 연속성·카탈로그 hash와 현재 준비 차단을 확인했다.
화면 build와 설치본의 상대 문서 링크 검증도 포함한다.

수정한 문서 19개의 로컬 링크·앵커 179개와 설치 대상 문서 114개의 상대 링크를 별도로 확인했다.
CHANGELOG도 패키지에 포함해 README·시작 안내의 링크가 설치 뒤에 열린다.
Studio의 실제 localhost HTTP 경로는 sandbox의 listen 제한을 해제한 로컬 실행에서 검증했다.
공개 v0.1.3 릴리스 게시·다른 OS/Node 조합·실제 공급자 실행 검증은 포함하지 않는다.

## 이전 로컬 검증 기록

2026-10-03 공개 준비 작업의 로컬 환경은 macOS·Node 24.19.0이다.
lint·타입 검사·테스트 728/728, 두 합성 예제, 개발 의존성 없는 tarball 새 설치를 확인했다.
다른 OS·Node 조합의 실행 결과는 이 로컬 기록에 포함하지 않는다.

2026-10-04 공통 자산 관리 구현 뒤 macOS·Node 24.19.0에서 lint·타입 검사·전체
테스트 **753/753**을 확인했다. 실제 stdio MCP 자산 예제와 개발 의존성 없는
tarball 새 설치에서 네 원고 예제·자산 예제도 통과했다.
[계획별 수용 결과](https://github.com/fbwndrud/linivera/blob/v0.1.0/docs/plans/2026-10-04-assets-implementation.md)에 반영 위치와 한계를 기록했다.
실제 생성 제공자와의 수동 실습·시각 검토 정확도 및 다른 OS·Node 조합은 이 기록에서 확인하지 않았다.

동적 추적의 A1–A20/A17b별 실제 테스트명과 최신 로컬 실행 결과는
[추적 수용 증거](tracking-verification.md)에 기록한다. 실제 stdio와 새 tarball 설치는
합성 답변으로 인터뷰 계획·후보·원고 채택·기록 보충·재검토·재연결을 확인한다.
실제 호스트의 발견 정확도나 모든 장르의 의미 검증을 인증하지 않는다.

## 2026-10-09 로컬 통합 검증

macOS·Node 24.19.0에서 fresh `npm run setup`, lint·타입 검사·전체 **1672/1672**,
viewer **37/37**, 네 원고·자산·추적 예제와 production 경로를 확인했다.
전체 root 테스트는 `--test-concurrency=2`로 실행했다. 첫 전체 실행에서 package:verify의
build 로그가 JSON stdout에 섞이는 회귀가 나왔고, build 진단을 stderr에 보존하도록 고친 뒤
새 tarball 설치 회귀와 전체 검사를 다시 통과했다.

새 tarball 설치는 개발 의존성이 없고 준비된 화면을 포함하며 실제 stdio 스키마·HTTP·linivera-view,
합성 그림책·Resource 전용 폴더·웹/EPUB·정적 사본을 확인했다. 모델 없는 기본 흐름이 통과하고
embedding 호출만 runtime-unavailable로 실패한다. 임시 작품·설치본·검증 cache는 정리했다.
SDK lock 1.32.1, ESLint 10.12.0, source-map-js 1.2.2에서 root runtime/full 및 viewer full/runtime
감사 모두 보고된 취약점 0건이다. 이는 이후 advisory까지 보증하는 결과가 아니다.

viewer build는 성공했으며 Graph chunk **1613.44 kB (gzip 501.80 kB)**가 기본 500 kB 경고를 낸다.
이미 별도 화면으로 지연 로딩되며 기본 JS는 291.09 kB다. 임의로 경고 상한을 높이지 않았다.
추가 분할 여부는 실제 graph 로딩·파싱·배치 비용을 측정한 뒤 결정할 후속 항목이다.

## 검증하지 않는 것

합성 호스트는 모델 요청에 미리 작성한 답을 돌려준다. 실제 모델의 집필 품질,
추출 누락률, 검사 정확도, 실제 호스트 UI의 사용성은 별도 실사용 검증이 필요하다.
SIGKILL 테스트는 전원 손실·파일 시스템 손상 테스트가 아니다.
100개 원고·추적 관측·Resource의 로컬 단일 실측은 [출시 판정 기록](https://github.com/fbwndrud/linivera/blob/v0.1.0/docs/plans/2026-10-09-production-readiness.md)에 남긴다.
수만 기록의 성능과 장기 작업 규모는 별도 측정이 필요하다.


Task6 경계 회귀는 `node --test test/acceptance/production-boundaries.test.js`로 실행한다.
vector32MiB 경계·overflow·worker 호출 전 거부·기존 profile 재색인과
HTTP token/Host·POST Origin·GET의 CORS 미허용·경로 주입·후보 숨김·XSS text·export
정본 무변경을 검증한다. benchmark:local은 합성100개 규모의 실제 시간과 bytes를 JSON으로
출력하고 전체 결과 수·근거·text를 검사한다. 상세 preview의 기존 길이 제한은 표시용이며
이 측정의 짧은 합성 text는 previewTruncated=false인지 확인한다. 모델 추론 속도·품질은
포함하지 않는다. 측정 환경과 미검증 범위는 출시 판정 기록을 따른다.

## 최종 로컬 출시 후보 검증

코드 `5fc61bc`에서 controller fresh lint·타입·전체 1713/1713, viewer 37/37, 설치본·공개 stdio/HTTP/export·100개 규모·실제 Google/Chrome을 확인했다. 독립 리뷰의 중단 복구 두 결함은 수정·재리뷰했다. [영구 증거](https://github.com/fbwndrud/linivera/blob/v0.1.0/docs/plans/2026-10-09-local-production-evidence/README.md)와 [최종 판정](https://github.com/fbwndrud/linivera/blob/v0.1.0/docs/plans/2026-10-09-production-readiness.md)에 원본/실측/미검증 범위를 남긴다. 다른 OS·Node 조합과 장기 실작품 검증은 통과했다고 주장하지 않는다.

## 2026-10-11 이름 변경 검증

macOS arm64·Node 24.19.0에서 lint·타입 검사·backend 1763/1763, viewer 70/70과 새 tarball 설치 검증을 통과했다. 이전 v0.1.0 데이터와 실행 명령의 호환성도 합성 데이터로 확인했다. 사용자의 요청으로 CI 워크플로를 제거했으며, 이후 검증은 위 로컬 명령으로 수행한다.
