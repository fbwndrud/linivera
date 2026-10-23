# Chroma 도구별 자료 관리 지원표

기준: 2026-10-22 [공식 크레딧 팩](https://submit.chromaawards.com/pack)의 기존 조사
37개 파트너와 2026-10-23 저장소 구현. 23일 공식 팩 재조회는 HTTP 403이어서
파트너 명단은 기존 조사 기준을 유지한다. 파트너 참여와 API 제공은 별개다. 실제 계정의 export
가능 여부는 상품·요금제에 따라 확인해야 한다. 아래 `형식 조건`은 그 형식의 파일을
사용자가 확보했을 때만 적용된다. 모든 공급자 API를 직접 실행한다는 뜻이 아니다.

- **자동 해석**: 보관 바이트에서 구조를 추출한다. 일반 이미지/영상/음원은 파일로
  식별하며 장면·내용·음질을 자동 이해하지 않는다.
- **수동 연결**: 정확한 Resource 판본을 bundle 역할, usage, generation-request
  inputBindings, structureBindings로 지정한다. URI만 등록하면 관측하지 않은 참조다.
- **파일 보관**: 명시한 파일의 hash와 바이트를 보관한다. 압축 해제·편집기 복원·
  의존성 설치·실행은 포함하지 않는다. 파일당 2GiB, bundle 8GiB/4,096개.
- **이후 작업**: 선택한 구조 map의 원본 및 연결 파일까지 Input에 고정한다.
  미연결 필수 참조는 차단하며, 원본 교체 시 기존 결과는 재검토 대상으로 남는다.

| 순서 | 데이터 관리 효과 | 상태 |
|---|---|---|
| P0 | 구조 원본·연결 판본의 재계산·무결성·Input 폐쇄 | 이번 구현·검증 완료 |
| P1 | workflow/run → 다음 입력, 모델/재질/리그/클립, 자막 cue → 미디어 | 이번 기본 형식 구현·검증 완료 |
| P2 | XMEML/OTIO 편집·명시적 커스텀 의존성·3D 확장 참조 | 기본 범위 구현. 전용 형식·효과/codec 실행은 별도 |
| P3 | 게임 코드/씬·sprite/atlas·DB·환경·배포 의존성 | 수동 역할을 세부 연결로 확장할 후보 |
| P4 | 공급자별 추가 응답·brief/권리/배포 성과의 의미 연결 | 실제 계약/샘플 확보 후 확장 |

| 파트너 | 자동 해석 / 형식 조건 | 수동 연결 | 파일 보관 | 남은 연결 우선순위 |
|---|---|---|---|---|
| ElevenLabs | TTS timestamps → audio/alignment/normalization | 원문·음성·사용 구간 | 음원·정렬 JSON | P4 다른 음성 기능·화자 의미 |
| CapCut | SRT cue 시간, SRT export 조건 | 영상·음원·자막·프로젝트 bundle | 내보낸 미디어·프로젝트 | P2 트랙·전환·효과 |
| Cantina | 전용 파서 없음 | 세션 명령·관측 결과·다음 입력 | 확보한 미디어·기록 | P4 세션별 대상/상태 |
| Runware | 전용 응답 파서 없음 | 요청·결과·모델·참조 입력 | JSON·이미지·영상 | P4 응답/배치 역할 |
| Kling AI | 전용 파서 없음 | 이미지/영상·참조·버전 | 미디어·메타데이터 | P4 shot/변형 관계 |
| OpenArt | 전용 파서 없음 | 캐릭터·참조·변형 | 미디어·메타데이터 | P4 일관성 참조 |
| Meshy | text-to-3D preview 응답 역할; glTF/GLB 구조 | 모델·재질·텍스처·리그 | GLB/glTF/FBX/OBJ/이미지 | P2 refine/rig API·FBX 의미 |
| Floyo | ComfyUI API/UI 노드·링크·v2 선언 의존성 | 패키지·loader 파일·체크포인트·결과 | workflow·실행 JSON·미디어 | P2 숨은 Python 의존성·실행 호환성 |
| Dreamina AI | 전용 파서 없음 | 이미지/영상·프롬프트·변형 | 미디어·JSON | P4 생성 관계 |
| Alibaba Cloud | 공급자별 파서 없음 | 모델 요청·결과·자료셋 역할 | 확보한 파일·기록 | P4 서비스별 계약 |
| Magnific | 전용 파서 없음 | 원본·업스케일·설정 | 이미지·설정 | P4 변환 영역/설정 |
| Hyper3D | Rodin export 역할; glTF/GLB 구조 | 모델·재질·텍스처·리그 | 모델·텍스처·manifest | P2 Rodin native 응답·기타 3D |
| ReelShort | 전용 파서 없음 | 배포 brief·제출판·영상 | 확보한 문서·미디어 | P4 배포 성과 연결 |
| Cars24 | 전용 파서 없음 | 브랜드 brief·권리·제출판 | 제공 문서·자료 | P4 brief 기준 연결 |
| Ashurst Perkins Coie | 전용 파서 없음 | 법률/권리 문서·적용 자료 | 확보한 문서 | P4 권리 조건 의미 |
| Fairground | 전용 파서 없음 | 제출 brief·배포판·참조 | 확보한 문서·미디어 | P4 제출 요건 연결 |
| Escape | 전용 파서 없음 | brief·작품·배포판 | 확보한 문서·미디어 | P4 제출 요건 연결 |
| FAL | flux/schnell 응답 역할 | 다른 endpoint 요청·출력·변환 | 미디어·원본 응답 | P4 endpoint별 역할 |
| Creatify | 전용 파서 없음 | 아바타·대본·광고 버전 | 영상·음원·대본 | P4 shot/화자 |
| MiniMax | 전용 파서 없음 | 영상·음성·텍스트 역할 | 미디어·JSON | P4 다중 출력 계약 |
| PixVerse | 전용 파서 없음 | 참조·영상·변형 | 영상·이미지·JSON | P4 shot/변형 |
| LTX | 전용 파서 없음 | 대본·shot·참조·영상 | 내보낸 파일·기록 | P2 편집 타임라인 |
| TapNow | 전용 파서 없음 | workflow·결과·역할 | JSON·미디어 | P4 고유 workflow 구조 |
| Wonder Studios | 전용 파서 없음 | 제작 brief·자료·사용 맥락 | 확보한 파일·문서 | P4 제공 도구/자료 확인 |
| Martini | run/action/item JSON + XMEML 5 편집 export | asset ID/미디어/선언 → 실제 판본 | run·workflow·XML·미디어 | P2 효과/복원, P4 live 실행 |
| Fixed Seed | 전용 파서 없음 | 캐릭터·참조·변형 | 내보낸 미디어·기록 | P4 고유 구조 확인 |
| Oxen | 전용 파서 없음 | 데이터셋 판본·실험·모델·결과 | 확보한 export·manifest | P4 행/스키마·실험 lineage |
| Reactor | 전용 파서 없음 | workflow·자료·결과 | 확보한 파일·기록 | P4 고유 구조 확인 |
| Luma | glTF/GLB 구조, 해당 export 조건 | 영상·3D·참조·리그 | 영상·모델·텍스처 | P2 splat/전용 형식 |
| VEED | SRT cue 시간, 해당 export 조건 | 영상·음원·자막·프로젝트 | 미디어·SRT·프로젝트 | P2 트랙·효과 |
| Passionfroot | 전용 파서 없음 | 협업 brief·제출판·권리 | 확보한 문서·참조 | P4 협업 기준/성과 |
| Adobe | SRT/glTF/GLB와 XMEML/OTIO, 해당 파일 확보 조건 | 편집·재질·소스·참조 | 확보한 프로젝트·미디어 | P2 PSD/AE/전용 편집 형식·효과 |
| Rosebud | glTF/GLB, 해당 export 조건 | 코드·씬·소재·빌드·DB | 소스·소재·빌드 | P3 코드/씬·DB/배포 |
| SpriteCook | 전용 파서 없음 | sprite·animation 역할 | 이미지·시트·기록 | P3 프레임/atlas 메타데이터 |
| Nimble Fox | 전용 파서 없음 | 게임·소재·소스·빌드 | 확보한 파일·기록 | P3 고유 export 확인 |
| Pickford | 전용 파서 없음 | 상호작용·분기·자료 | 확보한 파일·기록 | P3 분기/상태 모델 |
| Bolt | 전용 파서 없음 | 소스·빌드·자료·DB·플랫폼 | 확보한 export·manifest | P3 lockfile/DB/배포 |

사용 절차와 정확한 해석 범위는 [구조 연결](structure-links.md)을 따른다.
자동 해석의 지원 범위는 ComfyUI 기본/선언 연결, Martini 관측 run, glTF 2 기본/지원 확장
참조, SRT 시간 구간, XMEML/OTIO 편집 구조다. 미지원 커스텀 노드/확장 필드는 원본에 남고 `coverage.unknown`에
표시된다. 구조 해석·파일 완전성·프로젝트 복원·생성 품질·승인은 각각 다른 판단이다.

공급자 전용 파서가 없는 도구도 자료를 잃지 않고 반복 작업에 연결할 수 있다.
단, 외부 ID를 실제 파일로 연결하고 누락 자료를 확인하는 작업은 현재 수동이다.
[P2의 형식별 범위와 남은 부분](editing-dependencies.md)을 확인한다.
