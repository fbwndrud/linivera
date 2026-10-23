# 파트너별 기능 명세 현황

웹/API/CLI/공식 MCP·스킬과 계정 조건은 [접근 경로 현황](partner-access.md)을 따르며,
[연결 준비 대조](connection-readiness.md)를 입력 대조와 함께 수행한다.

2026-10-23 기준. 명단은 [Chroma 지원표](chroma-support.md)의 기존 37개 파트너를 그대로
따른다. 공식 크레딧 팩의 당일 재조회 실패를 새 참여 확인으로 바꾸지 않는다.
파트너 참여·구조 파서·기능 실행 명세·실제 계정 권한은 각각 다른 상태다.

- **공식 일부**: 공식 문서에서 확인한 대표 기능만 실행 가능한 명세로 제공한다.
- **미조사**: 공급자의 최신 입력/출력 API 계약을 이번에 확인하지 않았다. API 부재를 뜻하지 않는다.
- **로컬 선언**: 모든 행에서 확보한 로컬 자료를 `local-broker-v1`의 사용자 선언 계약에
  연결할 수 있다. 공급자 공식 확인으로 승격하지 않는다. 기존 manual/export 연결기도
  공급자 API 입력/출력 명세를 증명하지 않는다.
- **자료 일부**: 이미 있는 구조/응답 파서는 해당 확보 파일 범위만 해석한다.

공식 일부의 근거/확인일/identity/제약/미확인은 [기능 명세](capability-specifications.md)와
카탈로그를 따른다. 아래 미조사 행에는 공식 확인 날짜를 부여하지 않는다.

| 파트너 | 최신 기능 명세 조사 | 실행 가능한 대표 명세 / 기존 경로 | 자료 일부·남은 확인 |
|---|---|---|---|
| ElevenLabs | 공식 일부, 2026-10-23 | elevenlabs-tts-timestamps-v1 + 로컬 선언 | 다른 모델/codec·화자·권한 미확인 |
| CapCut | 미조사 | 로컬 선언·수동 파일 | SRT 시간만; native 프로젝트/효과 미확인 |
| Cantina | 미조사 | 로컬 선언·수동 파일 | 세션별 입출력 미확인 |
| Runware | 미조사 | 로컬 선언·수동 파일 | 고정 imageInference 응답만; 최신 실행 계약 미확인 |
| Kling AI | 미조사 | 로컬 선언·수동 파일 | legacy 단일 조회 파서만; 최신 endpoint 미확인 |
| OpenArt | 미조사 | 로컬 선언·수동 파일 | 캐릭터/변형 계약 미확인 |
| Meshy | 공식 일부, 2026-10-23 | meshy-text-to-3d-preview-v1 + 로컬 선언 | glTF/GLB; refine/rig/기타 모델 명세 미구현 |
| Floyo | 미조사 | 로컬 선언·기존 Floyo 수동 export | ComfyUI 구조만; 숨은 실행 의존성 미확인 |
| Dreamina AI | 미조사 | 로컬 선언·수동 파일 | 생성/변형 API 계약 미확인 |
| Alibaba Cloud | 미조사 | 로컬 선언·수동 파일 | 서비스/상품/모델별 계약 미확인 |
| Magnific | 미조사 | 로컬 선언·수동 파일 | 업스케일 규격·설정 미확인 |
| Hyper3D | 미조사 | 로컬 선언·기존 Rodin 수동 export | glTF/GLB만; native API 계약 미확인 |
| ReelShort | 미조사 | 로컬 선언·수동 문서 | delivery-record 선언 가능; native 성과 의미 미확인 |
| Cars24 | 미조사 | 로컬 선언·수동 문서 | brief/권리 선언 가능; 원문 의미 미확인 |
| Ashurst Perkins Coie | 미조사 | 로컬 선언·수동 문서 | 권리 보고/증거 연결; 법적 판단 수행하지 않음 |
| Fairground | 미조사 | 로컬 선언·수동 문서 | 제출 계약 미확인 |
| Escape | 미조사 | 로컬 선언·수동 문서 | 제출 계약 미확인 |
| FAL | 공식 일부, 2026-10-23 | fal-flux-schnell-v1 + 로컬 선언 | 다른 endpoint/모델 계약 미확인 |
| Creatify | 미조사 | 로컬 선언·수동 파일 | 아바타/광고 버전 계약 미확인 |
| MiniMax | 미조사 | 로컬 선언·수동 파일 | 고정 video_generation 응답만; 최신 실행 계약 미확인 |
| PixVerse | 미조사 | 로컬 선언·수동 파일 | 영상/변형 계약 미확인 |
| LTX | 미조사 | 로컬 선언·수동 파일 | shot/영상 API 계약 미확인 |
| TapNow | 미조사 | 로컬 선언·수동 파일 | workflow 고유 구조 미확인 |
| Wonder Studios | 미조사 | 로컬 선언·수동 파일 | 제공 도구별 기능 계약 미확인 |
| Martini | 미조사 | 로컬 선언·기존 Martini 수동 export | run/action/item·XMEML만; live 실행 계약 미확인 |
| Fixed Seed | 미조사 | 로컬 선언·수동 파일 | 고유 캐릭터/변형 계약 미확인 |
| Oxen | 미조사 | 로컬 선언·수동 파일 | 데이터셋/행/실험 API 계약 미확인 |
| Reactor | 미조사 | 로컬 선언·수동 파일 | 고유 workflow 계약 미확인 |
| Luma | 미조사 | 로컬 선언·수동 파일 | 확보 glTF/GLB만; splat/영상 API 미확인 |
| VEED | 미조사 | 로컬 선언·수동 파일 | 확보 SRT만; native 편집 API 미확인 |
| Passionfroot | 미조사 | 로컬 선언·수동 문서 | 협업/성과 계약 미확인 |
| Adobe | 미조사 | 로컬 선언·수동 파일 | 확보 SRT/glTF/GLB/XMEML/OTIO만; 제품별 API 미확인 |
| Rosebud | 미조사 | 로컬 선언·기존 게임 수동 export | project-manifest 선언; 실행/복원 미확인 |
| SpriteCook | 미조사 | 로컬 선언·기존 게임 수동 export | 확보 Aseprite JSON만; native atlas 미확인 |
| Nimble Fox | 미조사 | 로컬 선언·기존 게임 수동 export | project-manifest 선언; 고유 엔진 계약 미확인 |
| Pickford | 미조사 | 로컬 선언·기존 게임 수동 export | project-manifest 선언; 실시간 상태 미확인 |
| Bolt | 미조사 | 로컬 선언·기존 게임 수동 export | project-manifest 선언; DB/배포 실행 복원 미확인 |

수동/브로커 경로는 호스트가 이미 확보한 bytes/path를 보관한다. 임의 파트너의 네트워크를
자동 연결하거나 미관측 원본 생성 입력을 추정하지 않는다. 권리 보고와 내부 실행 승인은
별도로 확인하며, 알려지지 않은 조건은 보고서의 미확인으로 남긴다.
