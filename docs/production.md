# 로컬 설치와 첫 실행 검증

Linivera는 로컬 폴더에서 실행한다. 현재 소스 버전은 **0.1.3**, 공개 설치 패키지는 **0.1.2**다. 0.1.3은 아직 공개 릴리스 전이며 새 제작 기능은 소스 또는 직접 만든 tarball로 사용한다. npm 공개 게시·클라우드 게시 서비스는 제공하지 않는다. Node 지원 범위는 package.json에 있으며 Node 24를 권장한다.

목적별 시작점과 제작 데이터 흐름은 [문서 안내](README.md), 변경 내역은 [CHANGELOG](../CHANGELOG.md)를 따른다.

## 릴리스에서 받기

[0.1.2 다운로드](https://github.com/fbwndrud/linivera/releases/tag/v0.1.2)에서 `linivera-0.1.2.tgz`와 `SHA256SUMS`를 받는다. 빌드된 화면을 포함한다. 가장 간단한 MCP 등록과 한 줄 데모는 [README](../README.ko.md#설치)에 있다. 전체 작품 ZIP은 엔진과 별도이며 [예시 안내](examples.md)에서 설명한다.

## 소스에서 준비하기

```sh
npm run setup
npm run production:verify
npm run viewer -- "/path/to/work"
```

setup은 잠긴 root/viewer 의존성을 설치하고 화면을 빌드한다. production:verify는 새 임시 합성 그림책을 공개 MCP로 작성·검토·모의 승인하고 그림 등록·연결, 선택한 Resource의 metadata 조회, HTTP 목록·상세, 웹·EPUB과 정적 검토 사본을 검증한다. 별도 Resource 전용 폴더는 folio_init 없이 같은 조회·내보내기를 검증한다. 결과 JSON은 synthetic, viewerResourceVisible, epubVerified가 true이고 outputsRetained가 false다. 성공과 실패 모두 임시 출력은 정리한다. EPUB 검증은 ZIP 항목·CRC·본문·목차·그림을 확인하며 외부 EPUB 인증 도구나 모든 리더의 렌더링 검증은 아니다.

이 합성 검증은 실제 작가의 승인이나 AI 품질 평가가 아니다. 실행에는 모델 가중치·Python·API 키가 필요 없다. 선택 기능인 embedding만 런타임이 없으면 EMBEDDING_RUNTIME_UNAVAILABLE로 답한다. [별도 런타임 안내](embeddings.md)를 따른다.

## 준비된 패키지 만들기와 설치하기

준비된 패키지에는 읽기 전용 `linivera-doctor`도 포함된다. package:verify는
실제 설치 bin의 사람용·JSON 출력, 없는 root 종료 코드와 파일·디렉터리
무변경을 합성 Resource 폴더에서 확인한다. 진단과 전체 백업의 새 폴더 복원,
MCP 재연결 수용 순서는 [운영 안내](operations.md)를 참고한다.

소스 setup 뒤 명시적으로 다음을 실행한다.

```sh
npm run package:build
npm run package:verify
```

package:build는 viewer build 후 npm pack --ignore-scripts를 수행해 현재 폴더에 tarball을 만든다. package:verify는 화면을 다시 빌드하고 임시 tarball을 개발 의존성 없이 새로 설치한다. 설치본의 stdio 스키마, 네 원고·자산·추적 예제, 전체 production 경로와 linivera-view 실행, 설치본 package.json과 MCP 초기 응답의 이름·버전 일치, 합성 영어 번역의 원본 결속 영수증·판본 HTTP 조회·Web/EPUB 실제 본문과 새 영어/한국어 원본의 기본 Studio 다운로드 언어 태그를 확인하고 임시 설치와 npm cache를 정리한다. 생성·회차 선택·P0~P4 구조·공식 도구 합성 호스트·맥락 묶음의 후속 두 작업과 역사 Input도 설치본에서 검증한다. 출고 카탈로그 10개 hash, 모순된 출력 형식 거부와 다른 회차 요청 거부도 확인한다. 단순 npm pack은 화면을 빌드하지 않으므로 배포에는 package:build를 쓴다.

직접 만든 0.1.3 tarball은 별도 설치 폴더에서 다음처럼 실행한다. 공개 0.1.2를 받았다면 파일 이름을 받은 파일로 바꾼다.

```sh
npm install --omit=dev --ignore-scripts /path/to/linivera-0.1.3.tgz
./node_modules/.bin/linivera-view "/path/to/work"
./node_modules/.bin/linivera-doctor "/path/to/work" --json
```

기존 `folio-0.1.0.tgz`를 설치하면 패키지 폴더는 `node_modules/folio`, 명령은 `folio-view`·`folio-doctor`, MCP 실행 파일은 `node_modules/folio/bin/folio-mcp.js`다. 위 새 이름의 명령은 새 패키지 설치본에 사용한다.

Windows에서는 같은 설치 폴더의 `node_modules\.bin\linivera-view.cmd`를 쓴다. MCP 호스트에는 `node /absolute/install/path/node_modules/linivera/bin/linivera-mcp.js`를 등록한다. 설치된 패키지는 화면을 포함하므로 setup을 다시 실행하지 않는다. 설치 hook, Python 설치와 모델 가중치는 없다. 선택 embedding용 Python 스크립트는 포함하지만 Python 자체는 의존성이 아니다. 화면 누락 패키지는 새로 빌드한 tarball로 교체한다.

## 기존 설치 갱신과 롤백

1. AI 앱의 MCP와 Studio를 종료하고 작품 폴더 전체를 백업한다. 설치 폴더와 작품 폴더는 분리한다.
2. 새 tarball은 새 설치 폴더에 설치한다. 소스는 `git pull --ff-only` 뒤 `npm run setup`으로 준비한다.
3. 별도 복사한 skill/folio 폴더 전체를 교체하고, MCP 실행 경로가 달라졌으면 등록 값을 갱신한다.
4. MCP를 재연결하고 serverInfo 이름·버전이 설치된 package.json과 일치하는지 확인한다. 앱이 캐시한 도구·지침은 새 대화에서 확인한다.
5. 작품 상태와 읽기 전용 doctor를 확인한 뒤 Studio를 다시 연다. 정적 검토 사본은 다시 내보낸다.

문제가 생기면 MCP 실행 경로를 이전 설치 폴더로 되돌린다. 이번 업데이트는 기존 작품 형식·`.folio` 기록장·`folio_*` 도구 이름을 유지한다. 최신 소스는 0.1.3 패키지를 준비한다. 공개된 v0.1.2 패키지와 최초 v0.1.0 다운로드는 그대로 보존한다. GitHub에 0.1.3을 게시하기 전까지 기존 npx URL로는 새 기능이 설치되지 않는다. 새 패키지에도 기존 `folio-*` 실행 명령을 포함한다.

## 화면과 내보내기

집필 작품은 **Manuscript / Review / Publish**를 사용한다. 원고와 시점별 추적,
대상·기준·그룹별 근거 비교, 선택한 읽는 판본의 Web ZIP·EPUB 다운로드를 제공한다. UI 언어 선택과 읽는 판본은 별도이며, 구간 본문·구간 영수증·출판 화면은 같은 판본을 사용한다. 설정·추적은 원본 기준이다.
부모 그룹과 본문 절의 목차를 보존하며 그룹 계획 메모는 출판하지 않는다.
이전 정적 사본에서 새 필드가 없으면 미포함으로 안내한다. [세 모드 사용법](studio.md)을 참고한다.

**Resources**는 선택한 원본과 승인된 결과, 판본·근거·자기검토·Review needed 상태를 읽는다. 후보는 목록에 자동 공개되지 않는다. **Not indexed**이면 호스트에서 명시적으로 metadata를 갱신한 뒤 다시 연다. 화면 조회가 선택·승인을 대신하지 않는다. Resource 전용 폴더는 집필 화면이나 단계 설정을 제공하지 않는다.

**Export review view**는 읽기 전용 화면 사본을 작품의 exports/viewer에 만든다. 다음으로 로컬에서 열 수 있다.

```sh
linivera-view --preview "/path/to/work/exports/viewer"
```

본문의 웹·EPUB은 folio_export로 작품 밖의 새 출력 폴더에 만든다. PDF는 웹 내보내기의 브라우저 인쇄를 사용한다. 수동 지면 좌표 배치는 지원하지만 자동 조판·클라우드 게시를 수행하지 않는다. EPUB은 흐르는 본문 형식이다. Resources의 binary 원본은 정적 화면에 포함하지 않는다.

## 정적 사본 교체와 복구

동시에 두 정적 내보내기를 실행하면 EXPORT_BUSY로 거부한다. exports/viewer의 기존 Linivera 사본은 임시 결과가 준비된 뒤 같은 exports 폴더의 고유 .viewer-*.backup 이름으로 옮긴다. 교체 실패 시 원래 위치로 되돌린다. 그 사이 다른 파일이 원래 위치를 차지하면 덮지 않고 EXPORT_RECOVERY_REQUIRED와 backup 경로를 알려 준다. 그 백업에 이전 사본이 남는다. 작가 파일로 만든 출력 폴더나 바뀐 target은 덮지 않는다.

프로세스가 강제 종료되면 exports/.viewer-export.lock, .viewer-*.tmp 또는 .viewer-*.backup이 남을 수 있다. 모든 Linivera 프로세스를 종료하고 기존 viewer·backup 내용을 확인한다. 보존할 사본을 따로 복사한 뒤, target이 없을 때 확인한 backup을 viewer로 옮긴다. 잠금은 자동 탈취하지 않는다. 확인을 마친 뒤 남은 잠금과 본인이 확인한 임시 폴더만 지우고 다시 내보낸다. 자동 손상 복구 기능이 아니다.

이미지는 화면 요약을 만든 실제 catalog 판본에 결속한다. managed 이미지는 그 판본의 경로와 contentHash, legacy 이미지는 설명서와 당시 파일 bytes의 fingerprint를 검증한다. 같은 ID의 새 파일이 들어와도 이전 승인 표시와 새 bytes를 섞지 않는다. 복사는 한 장씩 수행한다. 선언된 파일의 손상·누락은 실패이며, file:null 또는 알 수 없는 참조는 화면에 명시된 placeholder로 남는다.

이 교체 계약은 같은 로컬 파일시스템에서 Linivera의 잠금에 협력하는 프로세스를 전제로 한다. Node의 portable directory rename에는 no-replace 옵션이 없어 최종 존재 확인과 rename 사이에 비협력 프로세스가 빈 폴더를 삽입하는 경쟁까지 보장하지 않는다. 네트워크 공유 폴더·전원 손실 복구는 검증하지 않았다.

## 의존성 검증

SDK minimum은 patched 1.x이며 현재 lock은 1.32.1이다. [SDK advisory](https://github.com/advisories/GHSA-6qxp-vccf-f47h)는 OAuth 클라이언트 문제이며 MCP 서버와 stdio 클라이언트를 영향 대상에서 제외한다. 현재 Linivera stdio 경로의 exploitability를 주장하지 않는다. viewer의 source-map-js lock은 [1.2.2 수정판](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)이다.

ESLint 9 deprecation을 확인하고 10.12.0 및 @eslint/js 10.0.1로 갱신했다. 지원 Node 범위는 Linivera와 맞는다. [v10 migration](https://eslint.org/docs/latest/use/migrate-to-10.0.0)의 새 recommended 규칙을 모두 유지했다. no-useless-assignment가 찾은 사용되지 않는 초기값 세 개만 제거했다. preserve-caught-error를 맞추려고 사용자 경로·민감 원인을 공개 오류에 추가하지 않았다. 기존 FolioError 마스킹 경계는 유지하며 이 규칙이 사용자 정의 오류의 마스킹 정확성을 보증하지는 않는다.

감사는 root runtime(`npm audit --omit=dev`)과 viewer full(`npm --prefix viewer audit`) 결과를 구분한다. build의 graph chunk 크기 경고는 성공 종료와 별개다. 실제 로컬 결과와 미검증 범위는 [검증 기록](testing.md)을 따른다.


## 합성 규모 측정과 출시 판정

```sh
npm run benchmark:local
```

100개 원고의 고정 합성 답변·모의 승인, 추적 관측100개와 선택 Resource100개를
새 임시 폴더에 만든다. 상태·추적 조회·metadata refresh·Resource 조회·HTTP 목록과
100개 상세·정적 검토 사본·웹 export를 실제 실행한다. 환경·package/commit·판본과
checkpoint 근거, 작업별 milliseconds와 JSON 출력 bytes, export 전체 bytes를 기록한다.
AI 품질 점수나 처리 SLA는 만들지 않는다. 성공·실패 모두 자체 임시 폴더를 정리한다.
설치본에서는 `node /path/to/node_modules/linivera/scripts/benchmark-local.js`로 실행할 수 있다.
테스트 fixture import와 개발 의존성은 필요 없다. package:verify는 설치본 모듈의 모든
의존성 해석을 확인하며, 100개 실제 측정은 benchmark:local의 별도 실행이다.

현재 검증 결과와 남은 관문은 [출시 판정 기록](https://github.com/fbwndrud/linivera/blob/v0.1.0/docs/plans/2026-10-09-production-readiness.md)에
구분한다. 과거 vector profile의 input policy에는 명시 재색인이 필요하다.
개별8MiB·100개·합산32MiB는 core pin과 adapter 직접 호출에 모두 적용되며
source evidence의 개별 bytes 검증을 생략하지 않는다.


## 변경 영향 및 화면 내보내기 성능

Review의 Changes는 기존 stale/drift/recheck/flagged와 근거 연결·추적 coverage를 읽기 전용으로
모아 현재/당시 버전 및 영향받은 구간을 연결한다. 기록장 검증 실패를 정상 빈 목록으로 표시하지 않는다.
원고 main, 다른 판본, Resource 검색 최신성은 구분한다. 자동 승인·재작성·의미 정확도 보증은 없다.

정적 writing snapshot은 내보내기 한 번 안에서 Work·검토 상태·근거 상태를 재사용한다.
요청 간 캐시는 없다. 완료 전 fresh Work(원문·설정·자료·이미지·추적·판본), work.yaml 원문,
ledger/head 및 run 파일 hash를 다시 읽는다. 변화하면 VIEW_CHANGED로 거부한다.
Resource 체크포인트와 실제 이미지 복사의 기존 버전/bytes 검증도 유지한다.
한꺼번에 만드는 정적 JSON의 크기나 사용자 의미 판정 비용까지 줄이는 기능은 아니다.
실측과 잔여 출시 관문은 [변경 영향 구현 결과](https://github.com/fbwndrud/linivera/blob/v0.1.0/docs/plans/2026-10-10-impact-and-performance-results.md)를 따른다.
