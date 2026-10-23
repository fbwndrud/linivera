# PR #9 기존 리뷰와 최신 수정 대조

대조일: 2026-10-24. 대상은 [기존 GitHub 리뷰](https://github.com/fbwndrud/linivera/pull/9#pullrequestreview-5627519895)의
`d0b9249..4e13617` 구간에 남은 지적이다. GitHub connector로 원문을 다시 읽었다.
코드·회귀의 고정 비교점은 `5a8b579cb05c982c6f57998ebb58214ca8110f75`다.
이 문서는 원래 리뷰를 수정하거나 철회하지 않고, 당시 지적과 현재 상태를 연결한다.

`해결`은 해당 오류를 현재 경계에서 차단함, `의도된 범위`는 공개 계약이 보장하는 범위,
`후속 개선`은 현재 확인한 기능 오류와 구별한 설계 판단이다. 이전 리뷰의 테스트 통과만으로
지적을 닫지 않았다. 아래 카탈로그 추가 보강은 `5a8b579` 이후 변경과 검증으로 구별한다.

## Spec 대조

| 기존 지적 | 판정 | 코드·공개 계약·검증 근거 |
|---|---|---|
| P2: `story` 보고를 `other-story` fixed Input에 재사용 | 해결 | [v2 준비](../../core/resources/input-snapshots-v2.js)의 `buildInputManifestV2`가 새 봉인에서 전체 typed closure를 `input.scopeId`로 검사한다. [새 작업](../../core/resources/input-closure.js)의 `assertNewOperationInputClosure`도 manifest scope를 검사한다. [격리 순회](../../core/context/isolation.js)는 보고의 `input.scopeId`를 읽는다. 원문과 같은 보고 자체를 다른 scope의 fixed root로 고른 합성 actual stdio MCP 재현에서 prepare가 `CONTEXT_SCOPE_MISMATCH`, 합성 과거 manifest의 새 작업 공통 검사도 같은 오류로 거절됨을 이번에 확인했다. |
| 카탈로그/비교 알고리즘 변경으로 과거 Input 검증 단절 가능 | 해결: 현재 replay 보존과 추가 전용 출고 정책·회귀 | `5a8b579`의 [대조](../../core/readiness/compare.js)는 새 보고 v2와 과거 v1의 요청 계약을 구분한다. [검증](../../core/readiness/verify.js)은 저장한 보고 version·checkpoint로 재계산하고, [새 실행 계약](../../core/readiness/request-contract.js)은 현재 계약을 별도로 강제한다. 추가 보강은 [registry](../../packs/production/catalog-registry.js)의 출고 hash 대조와 [정책](../catalog-history.md)으로 같은 ID의 변경·삭제·재출고를 거절한다. 미래 알고리즘 변경은 새 보고 버전과 기존 replay를 보존해야 한다. 아래 테스트는 실제 카탈로그 추가 후에도 기존 판본·Input이 유지됨을 확인한다. 임의의 미래 소스 변경 모두를 검증했다고 주장하지 않는다. |
| 보고 없는 legacy 입력 허용 | 의도된 호환 범위 | [assertReadinessForRequest](../../core/readiness/verify.js)는 보고가 없으면 반환한다. [대표 명세 문서](../capability-specifications.md)는 명세 경로를 쓰지 않던 역사 요청/Input의 의미를 바꾸지 않는다고 명시한다. [맥락 묶음 문서](../context-bundles.md)는 requirements 없는 package에는 역할 차단이 없으며 필요한 작업이 역할을 선언하도록 규정한다. 필수 선언 누락 차단과 기존 선언 없는 기록의 호환은 [requirements 회귀](../../test/context/requirements.test.js)에서 각각 확인한다. 모든 legacy 실행에 보고를 새로 의무화한 것으로 표시하지 않는다. |
| `ignoredWhen` 미평가, conditional은 `absent`만 처리 | 제한이 있는 구현, 현재 대표 명세 범위에서 허용 | [카탈로그](../../packs/production/capability-catalog.js)는 ElevenLabs 앞뒤 text의 `ignoredWhen`을 정적 정보로 제공한다. [비교](../../core/readiness/compare.js)의 `requirementNeeded`는 conditional `absent`만 계산하며 다른 연산자는 unknown을 돌린다. 현재 대표 명세에 conditional 필수 파일은 없다. [공개 명세](../capability-specifications.md)는 request IDs가 text보다 우선하며 양쪽의 binding이 둘 다 실제 소비됐다는 증거가 아니라고 명시한다. 자동 우선순위 판정/범용 조건 엔진은 미구현으로 남긴다. 새 조건·연산자를 카탈로그에 추가할 때 별도 구현과 회귀가 필요하다. |
| `pathId` 생략 시 경로 검사 생략 | 선택적 경로 계약, scope 차단과 구별 | [공개 schema](../../server/tools/resource-contracts.js)의 readiness/context에서 pathId는 선택 필드다. [contextSource](../../core/context/source.js)와 [isolation](../../core/context/isolation.js)은 호출자가 지정한 path/time을 검사한다. path를 생략한 scope 단위 작업에 특정 경로의 격리를 보장한다고 해석하지 않는다. path를 지정한 다른 경로 거절은 [context 회귀](../../test/context/continuity.test.js)의 `explicit context references cannot import another path...`, 보고/후보 격리는 [대조 회귀](../../test/readiness/compare.test.js)의 `nested scoped evidence...`로 검증한다. v2 manifest 자체에는 path/time 선언 필드가 없다. |

### scope와 역사 계약 수정의 증거 구분

[scoped-request-isolation 회귀](../../test/server/scoped-request-isolation.test.js) 3개는 실제 MCP에서
요청 하나만 root로 선택한다. iteration으로 확장된 다른 이야기 거절, 같은 이야기 실행·재시작
성공, 과거 cross-story Input/hash 읽기 성공과 새 작업 거절을 확인한다. 이는 위 보고 재사용
오류와 같은 공통 경계의 회귀이며, 원문 보고 재사용 자체의 이번 합성 재확인과 구별한다.
추가 보강에서는 같은 파일에 원문 보고 재사용 자체도 영구 MCP 회귀로 추가했다. 다른 scope의
fixed root 보고는 신규 준비·새 Operation에서 거절하고 합성 과거 Input/hash 읽기는 유지한다.

[historical-contract 회귀](../../test/readiness/historical-contract.test.js) 3개는 capability-readiness,
connection-check 단독, connection-readiness를 각각 포함한 과거 Input의 hash/manifest를
재시작 뒤 검증한다. 과거에 통과했던 Meshy 출력 계약 모순은 새 준비·새 실행·새 연결 점검에서
거절한다. 이 범위는 이미 `5a8b579`에서 해결했다. 미래 카탈로그 추가/변경의 보존을 대신하는
회귀로 집계하지 않는다. 자세한 수정은 [직전 독립 리뷰](2026-10-23-pr9-independent-review.md)에 있다.

### 카탈로그 보존 정책의 추가 완료 근거

- [공개 정책](../catalog-history.md): 기존 ID/전체 내용/출고 hash를 보존하고 새 판본은 새 ID와
  새 출고 파일로만 추가한다. 기록 스키마 version과 ID 판본 번호를 구별한다.
- [출고 v1](../../packs/production/catalog-release-v1.js)·[출고 목록](../../packs/production/catalog-releases.js):
  기능 4개·접근 6개의 기존 canonical JSON hash를 고정한다. 과거 출고 파일은 덮어쓰지 않는다.
- [registry](../../packs/production/catalog-registry.js): 삭제·교체·중복·과거 ID 재출고·미출고 새 ID를
  거절하며 정확한 ID별 복사본을 반환한다. 환경변수나 공개 입력으로 끄는 경로는 없다.
- [보존 단위 회귀](../../test/production/catalog-history.test.js): golden 출고 hash, 확인일/입력/접근
  경로/Chroma 근거 변경 거절과 새 판본 추가 후 정확한 구판 조회를 검사한다.
- [설치 교체 MCP 회귀](../../test/server/catalog-upgrade.test.js): 같은 작업 공간에 capability 보고
  v1/v2와 연결 보고를 포함한 Input을 봉인한 뒤 복제 설치에 합성 v2 명세·새 release를 추가한다.
  재시작한 실제 MCP에서 구/신 기능·접근 ID 조회, 과거 보고·Input/hash 읽기와 정상 신규 실행,
  구 ID로 위조한 명세 거절을 확인한다. 저장소·실제 공급자 자료는 바꾸지 않는다.
- [설치 tarball 검사](../../scripts/package-readiness.js): dev dependency 없는 설치본의 실제 MCP가
  기능·접근 출고 hash 10개와 일치함을 검사한다. 저장소 test fixture를 설치본에 주입하지 않는다.

최종 Node 24.19.0 `npm run check`: ESLint·TypeScript·전체 **2,058/2,058 통과**,
실패·취소·skip 0, 약 507초. 새 tarball 설치와 공개 예제 전체, 출고 hash 10개 MCP 대조,
P0~P4 단일 작업 공간·60개 판본·후속 두 작업도 전체 검사에 포함했다.
원격 CI는 사용자가 완료 조건에서 제외했으며 실행하거나 기다리지 않았다.

Standards/Spec 독립 재검토 모두 잔여 0건이다. 각 검토자의 관련 회귀 **25/25**가 통과했고,
Spec 검토자는 강화한 설치 교체 회귀 1개와 별도 합성 v2 기능 제약·접근 결속도 확인했다.
부분 실행은 서로와 전체 검사에 겹치므로 합산하지 않는다. 문서 로컬 링크 58개와
`git diff --check`도 확인했다. 현재 구현 오류와 명시한 후속 개선을 혼동해 닫지 않았다.

## Standards 대조

기존 리뷰도 이 항목들을 문서 규칙 위반이 아닌 판단 사항으로 분류했다. 현재 구현에 남은
중복이나 의존 방향을 모두 실행 오류로 승격하지 않고, 위치·영향·후속 개선을 기록한다.

| 기존 판단 사항 | 현재 판정과 근거 | 후속 개선 경계 |
|---|---|---|
| readiness 입력 필드 목록 세 곳 | 후속 개선 유지. [core records](../../core/readiness/records.js)의 `validateReadinessInput`, [계약](../../server/tools/resource-contracts.js)의 query rule, [공개 query](../../server/tools/resource-query.js)의 `readinessFields`에 각각 있다. | 필드 추가 시 core 검증·공개 schema·dispatch를 함께 변경해야 한다. 공유 선언으로 합치는 개선은 가능하나 현재 입력 필드 불일치는 발견하지 못했다. |
| 요청 결속/입력 누락 오류가 context 오류와 별도 | 의미가 다른 공개 오류로 유지. [readiness verify](../../core/readiness/verify.js)의 `CAPABILITY_READINESS_REQUEST_MISMATCH`는 정확 요청 결속, `CAPABILITY_INPUTS_INCOMPLETE`는 입력 계약·대조 충족이다. [context requirements](../../core/context/requirements.js)의 `CONTEXT_REQUIRED_MISSING`은 선택한 역할의 자료 포함 여부다. | 같은 오류로 합치면 현재 호출자의 원인 구분이 사라진다. [대조 회귀](../../test/readiness/compare.test.js)와 [역사 계약 회귀](../../test/readiness/historical-contract.test.js), [역할 회귀](../../test/context/requirements.test.js)가 각각의 차단을 검증한다. |
| 양쪽 `requirements`의 상태 뜻이 다름 | 명명 혼동의 후속 개선 유지. [readiness 문서](../capability-readiness.md)는 제공값/후보/불일치/검색 내 미보유를, [context 문서](../context-bundles.md)는 역할 충족/미포함/불완전을 정의한다. 두 결과는 같은 상태 기계가 아니다. | 상태 enum을 기계적으로 통합하지 않는다. UI나 새 소비자는 결과 종류를 구별해야 한다. 이름을 바꾸는 경우 공개/역사 JSON 호환을 함께 설계한다. |
| 공급자/명세 id 반복 분기 | 후속 개선 유지. [capabilities](../../packs/production/capabilities.js)의 `validateRequest`·`validateOutput`에 fal/ElevenLabs/Meshy별 분기가 있다. | 대표 계약 수가 늘면 순수 validator 등록표를 검토한다. 현재 [대표 기능 회귀](../../test/production/capabilities.test.js)는 세 연결기의 실제 prepare 검증 재사용과 출력 조건을 확인한다. 카탈로그 JSON에 실행 함수를 넣어 보관 형식을 바꾸지 않는다. |
| definition mapping·8MiB 상수 중복 | 후속 개선 유지. [records](../../core/readiness/records.js)의 `readinessEvidenceReferences`와 [verify](../../core/readiness/verify.js)의 `definitionIds`가 profile/pipeline/policy를 각각 매핑한다. [candidates](../../core/readiness/candidates.js)는 8MiB를 직접 쓰며 [resource schema](../../core/resources/schema.js)의 `MAX_RESOURCE_BYTES`와 현재 같다. | 공통 상수/함수 사용으로 변경 누락을 줄일 수 있다. 현재 서로 다른 한도나 의미를 적용하는 결함으로 재현되지는 않았다. |
| 같은 보고의 반복 재계산 | 비용 개선 후보 유지. [readiness verify](../../core/readiness/verify.js), [access verify](../../core/access/verify.js), [context references](../../core/resources/context-references.js)와 Input 준비/시작에서 무결성을 재검사한다. | 측정된 성능 회귀는 이번 대조에서 확인하지 않았다. 캐시를 도입한다면 정확 판본·checkpoint·보고/알고리즘 판본을 키로 쓰고 현재성/시간/권한 검사를 생략하지 않아야 한다. |
| core→packs→순수 adapter validator 의존 | 의존 방향의 후속 개선 유지. [core compare](../../core/readiness/compare.js)→[capabilities](../../packs/production/capabilities.js)→[request-schemas](../../adapters/production/request-schemas.js) 경로가 존재한다. 마지막 모듈은 값 검사만 수행한다. | core의 네트워크·모델 호출 금지 위반은 아니다. 공유 순수 계약 모듈로 옮기려면 기존 adapter와 capability 검증의 동일성을 보존한다. 이번 [대표 기능 회귀](../../test/production/capabilities.test.js)도 공급자를 호출하지 않는다. |

기존 구간 1의 `bindsRole` subject 비교·대상 역할 유일성·필수 binding incomplete 수정은
[역할 검사](../../core/context/requirements.js)와 [회귀](../../test/context/requirements.test.js)에
유지된다. 같은 내용 재읽기·검사 목록·브랜치 blob 링크의 기존 유보를 신규 해결로 집계하지 않는다.

## 이번 대조의 검증과 한계

초기 대조의 `5a8b579` 기준에서 Node 24.19.0으로 다음 6파일을 함께 실행하여
**40/40 통과**, 실패·skip 0을 확인했다. 이후 추가 회귀의 최종 결과는 위 완료 근거에 구별한다.

```sh
node --test test/server/scoped-request-isolation.test.js test/readiness/historical-contract.test.js \
  test/context/requirements.test.js test/context/continuity.test.js \
  test/readiness/compare.test.js test/production/capabilities.test.js
```

별도 원문 보고 재사용 합성 재현은 영구 테스트 수에 합산하지 않았다. 위 40개도 직전 전체
2,046개와 중복되므로 합산하지 않는다. 이번 문서 대조는 새 카탈로그 구현의 전체 검사 결과가 아니다.
실제 공급자·공식 MCP 설치/호출·실계정 인증·가입/결제·유료 생성·작품·외부 게시를 사용하지 않았다.
원격 리뷰/댓글 변경이나 병합은 이 문서 작업에서 수행하지 않았다.
