# Chroma Awards 조사와 새 Mac mini 인수인계

작성일: 2026-10-24. 브랜치: `codex/chroma-research-handoff-2026-10-24`.
기준 코드: `0853cfd5a0b7fd2f82f27335094aabbdac4b8ad9` (`main`, 소스 버전 0.1.3).

## 이 브랜치에서 받는 것

Chroma 원문 조사·전략·설계·사용 안내 **40개**를 기존 위치에서 읽을 수 있다.
주 작업 폴더와 기존 Chroma 복제본 3곳의 관련 문서 **22개 고유 판본**을 대조했다.
최신 정본은 기준 main에 이미 포함되어 있어 원문을 중복 복사하지 않았다.
Git 이력에 없던 초기 계약/계획 **2개 판본**은 아래 별도 커밋으로 보존했다.
기존 사용자 파일·미커밋 작업·실제 작품·자격 증명·채팅 원문은 이 브랜치로 이전하지 않는다.

## 새 기기에서 시작

새 폴더에 이 브랜치를 clone하고, 저장소 루트에서 다음 순서로 확인한다.

1. `AGENTS.md`와 이 문서를 읽는다.
2. `shasum -a 256 -c docs/plans/2026-10-24-chroma-research-handoff.sha256`로 자료를 확인한다.
3. 아래 최신 사용 안내와 최종 리뷰 대조를 먼저 읽고, 관심 분야의 조사 원문으로 내려간다.
4. `package.json`의 지원 Node를 확인하고 `npm run setup`으로 의존성과 Studio를 준비한다.
5. `node examples/chroma-continuity.js`로 합성 P0~P4 통합을 새 기기에서 실행한다.
6. 새 기능을 수정할 때는 이 인수인계 브랜치를 기준으로 새 `codex/` 작업 브랜치를 만든다.

새 세션에는 [이어가기 프롬프트](2026-10-24-chroma-mac-mini-prompt.md)를 전달한다.
이전 Mac의 절대 경로·캐시 Node·MCP 실행 설정을 그대로 재사용하지 않고 실제 clone 경로와
현재 호스트에서 확인한다. Node/설치·도구 노출·인증은 서로 다른 준비 상태다.

## 현재 상태와 기록 읽는 법

- 기준 main에는 PR #2~#11이 병합돼 있다. 새 작업 시 원격 최신 상태를 다시 확인한다.
- 오래된 계획의 미병합 PR·작업 중 상태·테스트 수치는 그 문서 작성 당시의 기록이다.
- [최종 리뷰 대조](2026-10-24-pr9-review-reconciliation.md)는 2,058/2,058 backend 검사와
  새 tarball·카탈로그 역사 보존·합성 통합 결과를 기록한다. 새 Mac의 실행 결과는 별도 기록한다.
- 기능 명세 4개, 접근 명세 6개의 대표 범위와 37개 파트너 조사표를 구분한다.
- 합성 transport/공식 도구 fixture와 실제 리니베라 MCP로 연결·보관·후속 두 작업을 검증했다.
  실제 공급자 인증·공식 MCP 실호출·유료 생성·게시·편집기/엔진 복원은 별도 확인 범위다.
- 2026-10-23 공식 Chroma 팩의 403 때문에 웹/API/MCP 크레딧 적용·활성화·기한은 미확인이다.
  초기 크레딧 조사에 있는 수치·일정을 현재 계정의 확정 혜택으로 사용하지 않는다.
- 공급자 조건을 갱신할 때 공식 출처·확인일을 남긴다. 출고 카탈로그는 기존 ID/hash를
  유지하고 새 ID/새 출고 판본을 추가하는 정책을 따른다.

## 먼저 읽을 사용 안내

| 문서 | 내용 |
|---|---|
| [chroma-support.md](../chroma-support.md) | 파트너별 자동 해석·수동 연결·파일 보관 |
| [partner-access.md](../partner-access.md) | 37개 파트너 사용 경로·가입·인증·크레딧 확인 범위 |
| [capability-partner-support.md](../capability-partner-support.md) | 파트너별 기능 명세 지원 범위 |
| [capability-specifications.md](../capability-specifications.md) | 대표 기능별 입력·출력 명세 |
| [capability-readiness.md](../capability-readiness.md) | 보유 자료 대조와 보고 보관 |
| [connection-readiness.md](../connection-readiness.md) | 연결·계정 준비와 실행 전 검증 |
| [context-bundles.md](../context-bundles.md) | 필수 역할·정확한 판본의 맥락 묶음 |
| [catalog-history.md](../catalog-history.md) | 추가 전용 출고 명세·과거 보고 보존 |
| [production-data.md](../production-data.md) | 생성 요청·결과·그룹·보관 계약 |
| [continuity.md](../continuity.md) | 다음 작업·회차·격리·변경 전파 |
| [structure-links.md](../structure-links.md) | 구조 원본·binding·Input 폐쇄 |
| [editing-dependencies.md](../editing-dependencies.md) | 타임라인·커스텀 노드·3D 확장 |
| [project-data.md](../project-data.md) | 공통 브로커·프로젝트·atlas·외부 상태 |
| [delivery-data.md](../delivery-data.md) | 공급자 응답·브리프·권리·배포 성과 |

## 원문 조사·전략

| 문서 | 내용 |
|---|---|
| [2026-10-21-chroma-awards-credits-research.md](2026-10-21-chroma-awards-credits-research.md) | 대회·파트너 크레딧 조사와 근거 |
| [2026-10-21-chroma-awards-rules-research.md](2026-10-21-chroma-awards-rules-research.md) | 참가·제출·권리 규정 조사 |
| [2026-10-21-chroma-awards-linivera-strategy.md](2026-10-21-chroma-awards-linivera-strategy.md) | 리니베라 활용 방향·제출 후보 |
| [2026-10-22-chroma-io-image-video.md](2026-10-22-chroma-io-image-video.md) | 이미지·영상 입력/출력 조사 |
| [2026-10-22-chroma-io-audio-editing-3d.md](2026-10-22-chroma-io-audio-editing-3d.md) | 음성·편집·3D 입력/출력 조사 |
| [2026-10-22-chroma-io-workflows-games.md](2026-10-22-chroma-io-workflows-games.md) | 워크플로·게임·프로젝트 조사 |
| [2026-10-23-chroma-provider-response-research.md](2026-10-23-chroma-provider-response-research.md) | 공급자 응답 형식·원문 근거 |
| [2026-10-23-partner-access-research.md](2026-10-23-partner-access-research.md) | 공식 사용 경로·MCP·스킬·인증 조사 |

## 설계·구현·검토 기록

| 문서 | 내용 |
|---|---|
| [2026-10-22-chroma-data-contracts.md](2026-10-22-chroma-data-contracts.md) | 공통 데이터 계약 |
| [2026-10-22-chroma-data-implementation-plan.md](2026-10-22-chroma-data-implementation-plan.md) | A~F 구현 계획과 검증 기록 |
| [2026-10-22-cross-tool-data-continuity.md](2026-10-22-cross-tool-data-continuity.md) | 도구 간 데이터·후속 작업 연결 |
| [2026-10-22-chroma-abc-review.md](2026-10-22-chroma-abc-review.md) | A~C 검토 기록 |
| [2026-10-22-chroma-structure-links.md](2026-10-22-chroma-structure-links.md) | P0/P1 구조 연결 |
| [2026-10-23-chroma-timeline-dependencies.md](2026-10-23-chroma-timeline-dependencies.md) | P2 편집·확장 의존성 |
| [2026-10-23-chroma-project-dependencies.md](2026-10-23-chroma-project-dependencies.md) | P3 프로젝트·외부 상태 증거 |
| [2026-10-23-chroma-provider-delivery.md](2026-10-23-chroma-provider-delivery.md) | P4 응답·브리프·권리·배포·성과 |
| [2026-10-23-chroma-p0-p4-audit.md](2026-10-23-chroma-p0-p4-audit.md) | 전체 점검 당시의 빈칸과 후속 기준 |
| [2026-10-23-chroma-context-bundle.md](2026-10-23-chroma-context-bundle.md) | 맥락 묶음·단일 작업 공간 통합 |
| [2026-10-23-capability-readiness.md](2026-10-23-capability-readiness.md) | 입출력 명세·보유 자료 대조 |
| [2026-10-23-access-readiness.md](2026-10-23-access-readiness.md) | 연결·인증·권한·크레딧 준비 |
| [2026-10-23-pr9-independent-review.md](2026-10-23-pr9-independent-review.md) | 별도 세션 리뷰·오류 수정·역사 호환 |
| [2026-10-24-pr9-review-reconciliation.md](2026-10-24-pr9-review-reconciliation.md) | 최종 리뷰 대조·카탈로그 보존·2,058개 검증 기록 |

## 제작 구조의 배경

| 문서 | 내용 |
|---|---|
| [2026-10-21-content-production-harness-review.md](2026-10-21-content-production-harness-review.md) | 초기 제작 흐름 검토 |
| [2026-10-21-creative-resource-lineage.md](2026-10-21-creative-resource-lineage.md) | 창작 자원 계보 설계 배경 |
| [2026-10-21-motion-production-extension.md](2026-10-21-motion-production-extension.md) | 영상·음성 제작 확장 배경 |
| [2026-10-21-resource-motion-implementation.md](2026-10-21-resource-motion-implementation.md) | Resource·motion 구현 기록 |

## 초기 로컬 초안 2개

보존 커밋: `9128805` (이 브랜치의 바로 앞 기록). 현재 파일은 최신 정본이다.
초안을 확인할 때만 다음 명령을 사용한다. 초안은 현재 구현 계약을 대체하지 않는다.

```sh
git show 9128805:docs/plans/2026-10-22-chroma-data-contracts.md
git show 9128805:docs/plans/2026-10-22-chroma-data-implementation-plan.md
```

| 초안 | SHA-256 |
|---|---|
| data-contracts | `5877eeb19b81f7cab97dd1b6b0b255093f62b05e6ee0024ee790460d42a589ab` |
| data-implementation-plan | `106898b332d1f6645e558d6f3a80418eb448c549973960032b60b30b4ffd1787` |

## 다음 판단

먼저 새 호스트의 합성 통합을 재현하고 구현·자료·연결 준비를 구별해 보고한다.
실사용이 필요하면 대표 파트너/기능을 정한 뒤 공식 조건·계정 준비·입력 자료를 확인한다.
명세 확대, 실제 공급자 연결 검증, 네이티브 복원은 기존 지원 범위와 구분하여 계획한다.
구체적인 후속 작업은 사용자의 다음 지시에 맞춰 정한다.
