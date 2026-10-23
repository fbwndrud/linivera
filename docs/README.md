# 문서 안내

소스와 공개 설치 패키지 버전은 **[0.1.3](https://github.com/fbwndrud/linivera/releases/tag/v0.1.3)**이다.
아래 제작 기능은 0.1.3 패키지에 포함된다. 기존 설치는 새 패키지 주소로 등록하고
MCP를 재연결해 실제 서버가 알리는 버전을 확인한다.

## 처음 연결하고 사용하기

| 목적 | 안내 |
|---|---|
| 제품과 설치 경로 | [한국어 README](../README.ko.md), [English README](../README.md) |
| 연결 확인·업데이트·롤백 | [연결](connect.md), [설치와 첫 실행 검증](production.md) |
| 첫 글·원고·그림 | [English getting started](getting-started.en.md), [첫 작품](writing-guide.md), [그림책](storybooks.md), [그림](assets.md) |
| 자료·관찰·근거 | [공통 Resource](resources.md), [추적](tracking.md), [선택형 검색](embeddings.md) |
| 화면·읽기본 | [Studio](studio.md), [웹·EPUB 내보내기](export.md), [공개 예시](examples.md) |
| 백업·문제 대응 | [운영](operations.md), [복구](recovery.md), [지원 환경](compatibility.md) |

## 생성 도구와 다음 제작을 연결하기

1. [기능 명세](capability-specifications.md)와 [자료 대조](capability-readiness.md)로
   필요한 입력과 보유한 정확 판본을 비교한다. 후보 발견은 선택·권리·실행 승인이 아니다.
2. [파트너 접근 경로](partner-access.md)와 [연결 준비](connection-readiness.md)에서
   계정·프로젝트·인증·권한·plan·credits를 따로 확인한다. 설치나 양수 잔액만으로 준비 완료가 아니다.
3. [맥락 묶음](context-bundles.md)에 요청·자료·명세·점검·필수 역할을 고정하고 Input을 만든다.
4. [생성 데이터](production-data.md)의 실행·회수·후보 검토 경로로 파일을 확보·보관한다.
   signed URL·공식 도구 성공·로컬 파일 확보·Resource 보관 완료는 각각 다른 상태다.
5. [회차별 선택과 반복](continuity.md), [모션 제작](motion.md)으로 같은 판본을 재사용하고
   후속 결과까지 변경 재검토를 추적한다.

| 연결 단계 | 상세 문서 |
|---|---|
| P0/P1 원본·workflow·3D·자막 | [구조 연결](structure-links.md) |
| P2 편집·노드/3D 확장 의존성 | [편집 의존성](editing-dependencies.md) |
| P3 코드·씬·atlas·DB/환경 증거 | [프로젝트 데이터](project-data.md) |
| P4 응답·brief·권리·배포·성과 | [배포 데이터](delivery-data.md) |
| 파트너별 조사와 실제 구현 차이 | [지원표](chroma-support.md), [대표 명세 지원](capability-partner-support.md) |
| 구판과 현재 판정의 구분 | [카탈로그 판본 보존](catalog-history.md) |

전체 합성 경로는 `node examples/chroma-continuity.js`다. 같은 작업 공간의 60개 판본과
두 후속 작업을 연결하고 원본 삭제·MCP 재시작·현재 차단·역사 Input을 확인한다.
작은 단계별 예제와 실행 조건은 [예제 목록](../examples/README.md)에 있다.

## 지원과 검증의 경계

- 리니베라는 로컬 데이터·판본·검토 도구이며 호스팅·자동 가입/결제·자동 게시 서비스가 아니다.
- 공식 도구 재사용은 호스트 구현·인증·권한을 전제로 한다. 실제 공급자 설치/계정/유료 실행은
  합성 transport 테스트의 통과와 별개다. 비밀값은 호스트 secret 관리에 둔다.
- 구조·파일 hash·관계·원문 증거를 보관해도 재생/프로젝트 복원·품질·권리 유효성·성과 진실성을
  자동 승인하지 않는다. Chroma 크레딧은 기존 조사에서 미확인이며 준비 완료로 세지 않는다.
- 지원 OS·Node 범위와 실제 실행한 환경은 [호환성](compatibility.md), 검증 명령과 기록은
  [로컬 검증](testing.md)을 따른다. 원격 CI는 사용하지 않는다.

팩과 확장은 [팩 작성](packs.md), [기여 안내](../CONTRIBUTING.md), [보안](../SECURITY.md)을 참고한다.
