# 이전 영상·리서치의 ComfyUI 적용 확인 — 2026-10-10

상태: **로컬 기능 검증, 캐릭터 모션은 concept**. 결과는 [전신 걷기 v11](../../out/fantasy-sprite-pilot-v11/README.md)에서 재생할 수 있다. 현재 환경은 ComfyUI 0.33.1, RTX 4070 Laptop 8 GB, `--lowvram`이다.

## 연결한 기능과 실제 결과

| 이전 조사에서 가져온 원칙 | ComfyUI 연결 | 이번 확인 |
|---|---|---|
| 먼저 한 장의 시각 기준을 정하고 변형한다 | 전체 캐릭터 [시안](../../out/fantasy-sprite-pilot-v11/painterly_seed.png)을 img2img 시작 그림과 IP-Adapter 공통 참조로 입력 | 8개 전신 프레임이 오른쪽 방향과 붉은 망토·검사 정체성을 대체로 유지했다. 프레임별 장식·모자 차이는 남았다. |
| 포즈와 정체성을 별도로 제어한다 | 직접 작성한 8개 OpenPose PNG + ControlNet 0.8 + IP-Adapter Plus 0.65 + SDXL img2img 0.72 | [8개 API 그래프](../../out/fantasy-sprite-pilot-v11/graphs/walk_00.api.json) 실행 완료. 포즈 변화는 보이지만 프레임 0·4의 반대 접지가 거의 같아 완성 보행은 아니다. |
| 출력 전체를 즉시 재생·검수한다 | VideoHelperSuite `VHS_LoadImagesPath` → `VHS_VideoCombine` | [MP4](../../out/fantasy-sprite-pilot-v11/comfy-output/gdt_mythic_fullbody_walk_concept_00001.mp4) 8프레임·10 FPS·512×512 디코딩 확인. [HTML](../../out/fantasy-sprite-pilot-v11/walk-review.html)에서 원본과 게임 크기 128px를 동시 재생한다. |
| 출력 팔레트도 비교한다 | 설치된 `PixelArtPalette` 노드, DAWNBRINGER-32, 128px | [한 프레임 출력](../../out/fantasy-sprite-pilot-v11/pixel-preview.png) 성공. 어두운 회화풍과는 별도의 선택형 도트 변환이며 이 결과를 본 시트의 기본 화풍으로 채택하지 않았다. |
| 기준 그래프와 매개변수를 보존한다 | 프레임별 API JSON, 시드·가중치·모델 해시 manifest | [모델 4개 해시 검사](../../out/fantasy-sprite-pilot-v11/model-preflight-report.txt) 통과. 생성 시간 합계 167.5초, 모델·그래프·출처는 [manifest](../../out/fantasy-sprite-pilot-v11/manifest.json)에 있다. |

## 바로 넣지 않은 것

- [PXF 조사](hero-inc-pxf-motion-research-2026-10-09.md)의 노드형 FX 편집기는 웹 공방의 자체 `pxf.graph@1` 형식이다. 현재 ComfyUI 노드로 확인되지 않았으므로 JSON이나 공개 갤러리 에셋을 가져오지 않았다. **기준 FX → 파라미터 변형 → 게임 화면 검수**라는 운영법만 별도 FX 그래프 설계에 적용할 수 있다.
- [모션 그래픽 영상](https://www.youtube.com/watch?v=wOF1EDpWxQw)의 오디오·대사·임팩트 시간 큐는 이미지 생성 노드가 담당할 일이 아니다. 이전 [로컬 모션 파일럿](comfy-2d-local-pilot-2026-10-09.md)은 코드의 단일 프레임 시계로 이 부분을 실행했다. 이번에는 ComfyUI의 프레임→MP4 출력만 다시 확인했고 음성 동기나 hit-stop은 시험하지 않았다.
- `out_hades`는 텍스처 인벤토리와 추출 메모를 제공하지만 디코딩된 PNG/JPEG/WebP는 없었다. 그래서 그 폴더를 ComfyUI 이미지 참조로 넣지 않았다. 어두운 신화풍과 윤곽·색 대비를 설명하는 시각 기준으로만 사용했고, [Supergiant 공식 Hades 소개](https://www.supergiantgames.com/games/hades/)를 별도 참고했다. 게임 원본 이미지는 산출물에 복사하지 않았다.
- 앞선 조사에 기록된 BiRefNet 모델은 이번 ComfyUI 서버의 활성 노드 목록에서 확인되지 않았다. 128px 컷아웃은 회색 배경 거리로 임시 추출했고, [스프라이트 QA](../../out/fantasy-sprite-pilot-v11/sprite-qa-report.md)에 프린지·고아 섬·구멍 경고가 남았다.
- 설치된 xinsir Union ControlNet과 LCM LoRA는 이 캐릭터 보행 실험에 넣지 않았다. Union이 반대 발 접지 문제를 해결하는지, LCM이 8 GB에서 정체성을 유지하면서 시간을 줄이는지는 아직 측정하지 않았다.

## 판단

**가능한 범위:** ComfyUI를 기준 전신 그림, 포즈 조건, 참조 정체성, 배치 출력, 영상 변환, 선택형 도트 출력의 허브로 쓸 수 있다. 이 PC에서 전부 실제 실행했다.

**남은 핵심 문제:** 전신 생성은 파츠 겹침을 없앴지만 자동으로 좋은 걷기 사이클을 만들지는 못했다. 접지 실루엣이 반복되고 발 교차·장비 디테일이 흔들린다. 현재 결과를 게임 애니메이션으로 승격하지 않는다. 다음 품질 단계는 승인된 전신 기준과 양쪽 접지 키 포즈를 사람이 확정한 뒤, 그 사이만 생성하고 발·허리·장비를 실제 크기로 프레임마다 검수하는 것이다.
