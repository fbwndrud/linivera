# 판본 결속 로컬 벡터 검색

`folio_embeddings`는 사용자가 이미 선택한 owned text/plain, application/json,
image/png, image/jpeg, image/webp, image/gif 원본만 색인한다. 후보와 승인 결과는
자동으로 선택하지 않는다. 승인 결과 색인은 이 slice의 범위 밖이다.
미관측 외부 URI는 다운로드하지 않으며 coverage.missing에 external-unobserved로
표시한다. audio/wav, audio/mpeg, video/mp4는 opaque 보관만 지원하고
벡터 실행은 media-unsupported다. Google 모델 자체의 네 모달리티 능력과
Linivera에서 실제 검증한 text/image 경로를 구분한다.

## MCP

모든 호출에는 사용자 선택 작업 폴더의 절대 `root`와 `op`가 필요하다.

- `index`: 선택 원본 전체. 선택 인자 `dimension`=128|256|512|768(기본768),
  `freshness`=requireCurrent|allowStale(기본requireCurrent). 최대100개 원본.
  응답은 profile/profileDigest, generationId, workspaceCheckpoint,
  inputManifestId, outputHashes, coverage, freshness다. 입력 없음은
  EMBEDDING_CONTENT_UNAVAILABLE, 선택 개수 초과는 EMBEDDING_INPUT_INVALID.
- `search`: 필수 `generationId`, `text`(1~32768자, 공백만 거부).
  선택 `freshness`(기본requireCurrent), `limit`(기본10, 1~100).
  generation의 dimension으로 질의를 실행한다. 응답 results에는 실제 resourceId,
  revisionId, contentHash, selectionRevision, sourceCheckpoint, cosine score가 있다.
  manifest/checkpoint/currentCheckpoint/freshness/coverage/evidence를 함께 반환한다.

`requireCurrent` 검색은 workspace checkpoint 변경과 누락 coverage를 거부한다.
`allowStale`은 실제 과거 generation을 읽고 stale 또는 partial 표시를 반환한다.
이 옵션도 손상이나 벡터 공간 불일치를 허용하지 않는다. 검색 실패는 원본 선택,
작품 승인, 자기검토, 품질 검토를 만들어 내지 않는다.

## 불변 보관과 공간 계약

`.folio/projections/vectors/<generationId hex>.json`에 `{manifest,entries,vectors}`를
추가 전용으로 저장한다. generationId는 이 canonical JSON의 SHA256이다.
manifest version=1, kind=vector, generatorRevision=folio-vector-v1,
workspaceCheckpoint, inputManifestId(검증된 기록장 markers hash), profile,
profileDigest, coverage(scope=selected-sources), outputHashes를 결속한다.
entries는 그 checkpoint에서 선택된 지원 owned 원본의 exact revision/content hash와
선택 marker를 보존한다. 모든 읽기에서 원본 bytes hash와 기록장 prefix를 재검증한다.

profile의 정확한 키는 model, modelRevision, processorRevision, processorConfig,
runtime, dtype, dimension, normalization, prefixes다. processorConfig에는 고정 모델
snapshot의 JSON 구성 파일 SHA256들이 들어간다. runtime은 Python, torch,
torchvision, transformers, sentence-transformers, numpy, Pillow, huggingface-hub
실제 버전이다. dtype=float32, normalization=l2; 차원은128/256/512/768이며
MRL truncation 뒤 다시 정규화한다. Document와 SearchQuery prefix를 분리하고
미디어 prefix는 빈 문자열이다. 질의와 문서의 profileDigest가 exact 일치해야 한다.
NaN/Infinity/zero/차원 오류/정규화 오류와 저장 generation 손상을 거부한다.

입력 bytes와 선택 marker/checkpoint는 lock 안에서 pin한다. 모델은 lock 밖에서
실행한다. 저장은 기존 checkpoint와 판본을 재검증하고, 최신 checkpoint가 바뀌면
requireCurrent를 차단한다. allowStale 저장도 과거 checkpoint를 그대로 보존하며
늦은 추론을 현재 checkpoint에 소급 표시하지 않는다. index의 partial 응답을
완전한 검색 coverage로 해석하지 않는다.

## 선택 Python 런타임과 오프라인 설치

기본 MCP/집필/metadata 경로는 Python과 가중치 없이 실행된다.
벡터 사용자는 별도 Python3.12 환경에서 `adapters/embedding/requirements.txt`를
설치하고 `FOLIO_EMBEDDING_PYTHON=/absolute/venv/bin/python`을 MCP 실행 환경에
지정한다. 모델은 google/embeddinggemma-2, 고정 revision
`914f7f89142e33e77833254d9c9b90c3cef7303b`, Apache2.0, 기본768차원이다.
모델 접근 조건을 확인하고 같은 revision을 미리 다운로드해 로컬 Hugging Face
캐시를 준비한다. `HF_HOME`을 지정하면 worker도 같은 캐시를 사용한다.
worker는 HF_HUB_OFFLINE=1/TRANSFORMERS_OFFLINE=1/local_files_only=True로 실행한다.
Linivera 실행에 모델 API 키는 필요하지 않다. 가중치 접근/설치 단계의 저장소 조건은
별도다. CPU float32 기본이며 float16은 공간 계약에서 거부한다.

subprocess는 shell 없이 실행하며 stdout은 JSON만, stdout4MiB/stderr64KiB,
기본 timeout300초를 넘으면 강제 종료한다. 호출자에게 입력/비밀/원본 stderr를
반환하지 않는다. 요청마다 모델을 다시 로드하므로 CPU 지연과 메모리 사용이 크다.
대규모 처리·background 실행·모델 품질 보장·audio/video 추론은 제공하지 않는다.
로컬 회귀 검사는 가중치 없이 합성 벡터와 subprocess 실패를 검사한다. 실제 모델 검증은
별도 합성 text/image smoke이며 창작 결과물을 저장소에 커밋하지 않는다.

출시·모델 계약 근거: [Google releases](https://ai.google.dev/gemma/docs/releases),
[model card](https://huggingface.co/google/embeddinggemma-2),
[Sentence Transformers guide](https://ai.google.dev/gemma/docs/embeddinggemma/multimodal-embeddinggemma-with-sentence-transformers).

선택 원본 수100개 한도는 bytes를 읽기 전에 검사한다. 텍스트는 prefix 포함 실제
tokenizer 길이+special token 여유8이 min(8192, runtime tokenizer limit)를 넘으면
EMBEDDING_TEXT_TOO_LONG으로 거부한다. 긴 문서 자동 truncation을 전체 문서
색인으로 표시하지 않는다. processorConfig.folioInputPolicy가 이 정책을 결속한다.
이미지는 header 기준1600만 pixels를 넘으면 EMBEDDING_IMAGE_TOO_LARGE로
거부한다. resize/crop은 고정 processor 구성에 따른다. 8MiB 압축 bytes 한도는
메모리 사용 보증이 아니며 CPU decoding과 모델 추론의 지연/메모리 한계가 있다.

개별 입력8MiB·최대100개 외에 합산32MiB를 적용한다. core pin은 원본 증거의
개별 bytes·hash 검증 후 verified byteLength를 합산하고, 한도를 통과한 뒤에만
일괄 input buffers를 보관한다. 이는 한도 검사 전 파일 읽기가 없다는 뜻이 아니다.
adapter 직접 호출도 실제 bytes 길이로 같은 한도를 worker 실행 전에 검사한다.
processorConfig.folioInputPolicy의 maxInputBytes/maxInputs/maxBatchBytes는
고정 정책이다. 이 정책이 없는 이전 vector profile은 VECTOR_PROFILE_INVALID로
거부하므로 새 index를 명시 실행해야 한다. 원고·Resource·영수증 변환은 없다.
