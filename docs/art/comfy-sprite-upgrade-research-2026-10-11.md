# ComfyUI 스프라이트 강화 조사 — 2026-10-11

상태: **조사·실험 설계**. 새 모델 추론·설치·다운로드는 하지 않았다. 공식 저장소, 모델 카드, ComfyUI 문서를 기준으로 검토했다. 대상 커밋 `48413a5` + 기존 미커밋 변경. 공개 데모와 기능 설명은 우리 캐릭터의 품질 검증을 대신하지 않는다.

## 결론

강화할 핵심은 **쓸 만한 전신 동작을 입력하고 시간축으로 유지하는 기능**이다. 기존 SDXL 프레임별 OpenPose/IP-Adapter와 다리 파츠 합성은 사용자 검수에서 실패했다. v15는 허리 접합 수정으로 승인될 상태가 아니며 걷기 동작 전체가 거절되었다. 기존의 “코드 합성이 답”이라는 문장을 현재 캐릭터의 생산 방식으로 확정하지 않는다.

우선순위는 다음과 같다. 이는 공식 성능 순위가 아니라 현재 실패와 하드웨어를 고려한 제안이다.

1. **동작 원본:** 정측면 보행 영상 또는 Blender 전신 보행을 먼저 확보하고 실시간 재생에서 동작을 확인한다.
2. **로컬 대조 실험:** VACE 1.3B의 제어 영상 경로와 SD1.5 AnimateDiff의 시간축+제어 경로를 짧게 비교한다. 실행 가능성은 실측해야 한다.
3. **품질 기준 비교:** Wan-Animate-2와 SCAIL-2를 같은 동작·캐릭터로 더 큰 GPU에서 비교한다. 8GB에서의 성공을 전제하지 않는다.
4. **후처리:** BiRefNet/BEN2/SAM 계열로 알파를 만들고, 픽셀 작업에만 PixelOE와 시트 공통 팔레트를 적용한다.
5. **전용 스프라이트 경로:** Sprite Sheet Diffusion은 별도 연구 환경에서 재현하고, PixelLab은 유료 API 대조군으로 검토한다.

## 현재 PC와 기존 기능

이번 읽기 전용 조사에서 `nvidia-smi`는 RTX 4070 Laptop GPU **8188 MiB**, Windows 물리 메모리는 **34,092,212,224 bytes (약 31.8 GiB)**를 보고했다. 기존 문서의 환경은 ComfyUI 0.33.1, Python 3.13 임베디드, `--lowvram`이다. 버전은 이번에 서버 API로 재확인하지 않았다.

현재 `custom_nodes` 디렉터리에는 `ComfyUI-VideoHelperSuite`, `ComfyUI_IPAdapter_plus`, `pixelart_palette`가 있다. 디렉터리 존재만 확인했으며 활성 import 성공을 의미하지 않는다. BiRefNet·Union SDXL·LCM은 [이전 설치 기록](comfy-2d-local-pilot-2026-10-09.md)이 있지만, [직전 실험](comfy-research-integration-2026-10-10.md)에서 BiRefNet 활성 노드는 확인되지 않았다. 먼저 기존 모델을 실제 노드와 연결하는 것이 필요하다.

## 생성·모션 후보 비교

| 후보 / 1차 출처 | 제공하는 기능 | 우리 작업에 적용할 방향 | 한계와 실행 우선순위 |
|---|---|---|---|
| [Wan-Animate-2 공식](https://github.com/Wan-Video/Wan-Animate-2), [ComfyUI 공식 워크플로](https://docs.comfy.org/tutorials/video/wan/wan-animate-2) | 참조 캐릭터+동작 영상 직접 입력. 중간 포즈 추출 없이 모션 전이 | 발 교차·골반 이동을 포함한 완성 동작을 입력하는 최우선 품질 비교 후보 | 14B. 공식 원본 실행 예시는 다중 A800 기준이다. Comfy는 INT8/증류 변형 제공. 8GB 검증 없음. 코드 Apache-2.0, 선택 가중치 조건 별도 확인 |
| [SCAIL-2 모델 카드](https://huggingface.co/zai-org/SCAIL-2), [ComfyUI 공식 문서](https://docs.comfy.org/tutorials/video/zai/scail2) | 참조 이미지+구동 영상, 애니메이션/영상 내 교체, 마스크 연결 | 동일 드라이버로 Wan-Animate-2와 비교. 캐릭터 전체와 장비 유지 여부 관찰 | Wan2.1 14B 기반. 최신 내장 `WanSCAILToVideo`·`SCAIL2ColoredMask`와 SAM3 추적 사용. 현재 버전 호환 확인 필요. 모델 카드 MIT. 8GB 보장 없음 |
| [SCAIL 1 공식](https://github.com/zai-org/SCAIL) | 3D 일관 포즈 표현으로 캐릭터 구동 | 2D 관절의 앞뒤 모호성을 줄이는 표현 비교 | 14B 연구 경로. SCAIL-2와 별개 모델·조건이다. 코드 Apache-2.0. 설치 우선순위는 후순위 |
| [VACE 공식](https://github.com/ali-vilab/VACE), [ComfyUI VACE](https://docs.comfy.org/tutorials/video/wan/vace) | 영상·참조·마스크·제어 신호, 영상 변형/부분 편집/첫끝 프레임 | Blender/실사 보행을 캐릭터 화풍으로 바꾸고 장비 영역을 선택 수정 | 1.3B/14B, 공식 문서 Apache-2.0. 1.3B는 로컬 후보지만 메모리·품질 미측정. 일반 Wan T2V와 다른 모델 |
| [Wan2.2 Fun Control 공식 Comfy 문서](https://docs.comfy.org/tutorials/video/wan/wan2-2-fun-control) | Canny·Depth·OpenPose 등 제어 영상 | 발끝 윤곽·다리 앞뒤·전신 실루엣을 포즈 점 외의 신호로 전달 | 14B 고/저노이즈 모델. 공식 640²·81프레임 측정은 24GB GPU 기준. 빠른 LoRA에서 dynamics 손실 가능성을 문서가 명시. Apache-2.0 |
| [AnimateDiff Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved), [Advanced ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet) | 시간축 motion module, sliding context, SparseCtrl·IP-Adapter·ControlNet 연계 | SD1.5 기반으로 작은 시퀀스를 공동 생성. 기존 독립 SDXL 프레임과 비교 | Evolved 코드 Apache-2.0. motion module/checkpoint/adapter 조건은 각각 확인. 8GB 후보라는 것은 크기에 따른 추론이며 실행 보장이 아니다 |
| [LTX 공식 Comfy 확장](https://github.com/Lightricks/ComfyUI-LTXVideo) | Depth/edge Union IC-LoRA, 참조·제어 관련 워크플로 | 제어 영상 화풍 변환의 보조 후보 | 현재 repo는 LTX-2 계열도 포함. 최신 19B/22B를 경량 모델로 취급하지 않는다. 사용할 버전과 모델 라이선스를 고정한 후 비교 |
| [MimicMotion 공식](https://github.com/Tencent/MimicMotion) | confidence-aware 포즈 조건, 긴 영상 latent fusion | 사람형 전신 보행에 대한 구형 대조군 | 공식 16프레임 U-Net 최소 8GB, VAE 16GB·CPU 대안 명시. 72프레임은 16GB 기준. SVD 기반 가중치 조건 확인 필요. 판타지 비율·무기 보존 미검증 |
| [Sprite Sheet Diffusion 공식](https://github.com/chenganhsieh/Sprite-Sheet-Diffusion) | 스프라이트 애니메이션 대상 fine-tune, 학습·평가 코드와 가중치 링크 | 일반 실사 영상 모델과 다른 전용 학습 경로 | README는 Animate Anyone 계열 추론 설정. 바로 설치할 Comfy 노드는 확인하지 못했다. 후속 소스 확인에서 README의 MIT 선언과 CC0 학습 데이터 선언을 확인했다. 기반 모델 조건은 별도 검토. 연구 재현 후보 |
| [LATENTMAN 공식](https://github.com/abdo-eldesokey/latentman) | Motion Diffusion Model 연계, 캐릭터 시퀀스 연구 코드 | 모션과 이미지 정체성 연결 방법 조사 | Python 3.8 등 별도 환경 전제. Comfy 노드·8GB 실행·명시 라이선스 미확인. 현재 서버에 직접 넣을 후보로 잡지 않는다 |
| [Qwen Image Edit 2509 공식](https://huggingface.co/Qwen/Qwen-Image-Edit-2509) | 다중 이미지 편집, 1~3입력 권장, 포즈 변환 예시 | 캐릭터 원화+전신 동작 키+장비 참조로 핵심 자세 정리 | Apache-2.0. 정지 이미지 편집이다. 잘 나온 두 장이 좋은 걷기 사이클을 증명하지 않는다. 로컬 메모리 미측정 |
| [ToonCrafter 공식](https://github.com/Doubiiu/ToonCrafter) | 두 만화 키 이미지 사이 생성 보간 | 사람이 확인한 전신 키 사이 보조 프레임 제작 | 공식 원본 약 24~27GB, 커뮤니티 경량 약 10GB/표 12GB. 8GB 기본 후보에서 제외. 잘못된 양끝의 체중 이동을 보정한다고 가정하지 않는다 |
| [RIFE/FILM Comfy 확장](https://github.com/Fannovel16/ComfyUI-Frame-Interpolation) | 영상 프레임 보간 | 성립한 모션의 재생 프리뷰를 부드럽게 만드는 보조 수단 | 접지·동작·장비 구조를 새로 설계하는 도구가 아니다. 도트 원본에 적용하면 중간색·고스팅 위험. 생산 기본값으로 사용하지 않는다 |
| [PixelLab 공식 API](https://api.pixellab.ai/v2/docs) | skeleton animation v3, text animation, interpolation, outfit transfer, 방향 회전 | 전용 픽셀 서비스가 우리 기준을 충족하는지 유료 대조군 구성 | 상용 원격 서비스. 문서는 skeleton 3~15프레임·최대256² 설명. 오픈소스/로컬 모델이 아니다. 비용·권리·정확한 API 조건 확인 후 사용 |

Wan2.1 공식은 일반 **T2V-1.3B**에 8.19GB를 적는다. 이 숫자를 VACE 1.3B나 14B 애니메이션의 메모리 수치로 가져오지 않는다. 8188MiB GPU에서는 모델뿐 아니라 activation·VAE·encoder가 필요하다. [Wan2.1 공식](https://github.com/Wan-Video/Wan2.1)

## 모션을 먼저 만드는 대안

**Blender 전신 리그 → 고정 카메라로 보행 렌더 → Comfy 영상 변환**을 권한다. 이는 이번 작업을 위한 설계 제안이며 아직 실행 결과가 없다. 전신 IK와 접지 키를 통해 관절 길이, 발끝 방향, 체중 이동, 앞뒤 다리 가림을 입력에서 확정한다. 렌더한 RGB·Depth·Normal·윤곽 중 사용하는 모델이 실제로 받는 신호만 전달한다. Blender는 Z/Normal 등 렌더 패스를 제공한다. [Blender 공식 패스 문서](https://docs.blender.org/manual/en/2.83/render/layers/passes.html)

이 방법에서도 확산 변환이 모션을 바꾸거나 프레임을 흔들 수 있다. 변환 전/후를 나란히 보여주고 원본 보행보다 나빠지는지 확인한다. 기존의 임의 사인파 다리 회전이나 단일 원화 하반신 잘라 붙이기는 이 전신 리그 경로의 검증을 대신하지 않는다. 2D 리깅도 관절 분리 원화·가려진 영역 그림·전신 체중 이동을 제대로 만든 경우에만 재평가한다.

[EbSynth 공식](https://ebsynth.com/)은 영상 위에서 수정한 키프레임을 전파하는 대안이다. 생성 모델 기반 전파가 아니며, 기존 동작을 유지하며 화풍을 옮기는 비교에 의미가 있다. 현재 Free/Pro/Studio로 나뉘고 PNG alpha·로컬 실행은 플랜에 따라 다르다. 예전 무료 데스크톱 안내를 현재 조건으로 쓰지 않는다. 오픈소스 Comfy 노드로 확인된 것은 아니다.

장기적으로 캐릭터 LoRA와 motion LoRA를 분리해 학습할 수 있다. 캐릭터 LoRA는 정체성, motion LoRA는 시간축 동작을 위한 후보다. [AnimateDiff Evolved의 MotionDirector 연계 안내](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)를 기준으로 호환 motion module을 먼저 고정한다. 이미 실패한 프레임을 학습 데이터로 쓰면 실패를 학습할 수 있으므로, 권리와 품질이 확인된 전신 시퀀스가 선행 조건이다.

## 알파·도트·내보내기 강화

| 후보 | 실제 역할 | 적용 시 확인할 점 |
|---|---|---|
| [BiRefNet](https://github.com/ZhengPeng7/BiRefNet) | 전경/배경 분리, 코드 MIT | 설치된 가중치의 활성 연결부터 확인. 다리 사이 구멍·검날·망토 끈 포함 프레임 전수 비교 |
| [BEN2 Base](https://github.com/PramaLLC/BEN2) | 배경 제거와 영상 처리, 코드 MIT | BiRefNet의 대조군. 공개 Base와 별도 commercial/full 모델 조건을 섞지 않는다 |
| [SAM2](https://github.com/facebookresearch/sam2), [Comfy 확장](https://github.com/kijai/ComfyUI-segment-anything-2) | 영상 객체 마스크 추적 | 단일 프레임마다 독립 마스크를 만드는 방식과 시간 안정성 비교. 다리 사이 배경에 negative point 사용 가능성 시험. 정확한 가는 경계 복원은 별도 검수 |
| [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) | 여러 배경제거 모델을 노드로 연결 | wrapper GPL-3.0. 지원 모델들의 라이선스는 별도. 모델명이 RMBG라고 모든 가중치가 같은 조건은 아니다 |
| [BRIA RMBG-2.0](https://huggingface.co/briaai/RMBG-2.0) | 배경제거 대조군 | 모델 카드가 비상업 용도와 상용 계약/API를 구분. 무료 상업용 기본 모델로 선정하지 않는다 |
| [LayerDiffuse](https://github.com/lllyasviel/LayerDiffuse) | 투명 이미지 생성 | 정지 원화 투명 생성 경로. 연속 보행의 alpha 일관성 보장 근거는 확인하지 못했다 |
| [Wan-Alpha 공식 Comfy 문서](https://docs.comfy.org/tutorials/video/wan/wan-alpha) | Wan2.1 14B 기반 RGB+alpha 영상 생성 | FX·연기·발광 등 반투명 시퀀스 후보. 전용 RGB/alpha VAE와 LoRA 사용. 모션 전이 모델과 바로 결합 가능하다고 가정하지 않는다. 8GB 미검증 |
| [PixelOE](https://github.com/KohakuBlueleaf/PixelOE) | outline expansion을 포함한 비신경망 픽셀 변환, Comfy 노드 제공, Apache-2.0 | nearest 축소와 비교할 후보. 프레임별 적응 윤곽/양자화는 시간축 떨림을 만들 수 있다. 시트 공통 팔레트 후검사 필요 |
| [VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) | 영상/프레임 로드·선택·분할·영상 출력 | 이미 설치됨. 모델 출력 FPS와 게임 타이밍을 구분하고 프레임 중복·순서·루프 경계 검사 |

다리 사이 배경 문제는 **가장 큰 연결 성분만 남기기**로 해결되지 않는다. 내부 배경도 올바르게 분리해야 한다. 고정 배경을 쓸 경우 색상 키와 learned mask를 비교하되 캐릭터의 동일색 부분이 지워지지 않는지 본다. 원본 RGBA는 보존하고 도트용 alpha 이진화는 별도 export에서 한다. FX의 반투명 알파를 캐릭터 도트 규격으로 이진화하지 않는다.

도트는 성립한 동작 위에서 격자·팔레트를 통일한다. 전체 시퀀스에서 팔레트 한 번 계산 → 모든 프레임 동일 팔레트 → 외톨이 픽셀/윤곽을 사람이 정리한다. 모델이 출력한 부드러운 그림을 48px로 내리거나 색 수만 줄이는 것은 사람이 설계한 pixel cluster와 같지 않다. 회화풍 Hades 참고 파일럿은 원래의 부드러운 화풍 export도 유지한다.

## 발견한 파이프라인 저장소 평가

[mor-o/comfyui-2d-character-pipeline](https://github.com/mor-o/comfyui-2d-character-pipeline)은 Qwen pose edit → Wan2.2 I2V → BiRefNet strip, VACE cosmetic inpaint → SAM3 strip의 연결 사례를 제공한다. API 그래프·driver·VRAM unload·시트 출력 구조를 살펴볼 가치가 있다. 일반 I2V가 우리의 정측면 접지 보행을 충족한다는 근거는 아니다. 코드/워크플로 재사용 전 LICENSE와 실제 샘플을 별도 확인한다.

사용자가 제시했던 [ComfyUI-GameAsset-Workflows](https://github.com/xl732236362/ComfyUI-GameAsset-Workflows)는 여전히 README에서 **LICENSE 없음/라이선스 부여 없음**, production animation **최소16GB VRAM**을 명시한다. production 첫 동작도 `sword_attack`이며 프레임 수8/12/16이다. 우리 8GB 걷기 문제에 바로 적용할 패키지로 선정하지 않는다. manifest·작업 API·엔진 export 검증이라는 설계 아이디어는 참고할 수 있다.

## 다음 실험을 구체적으로 구성하는 방법

### 공통 입력과 비교 화면

- 원본 동작: 고정 카메라 정측면, 좌우 반대 접지와 passing pose가 분명한 짧은 전신 보행. 직접 제작한 Blender 모션 또는 사용 권한 있는 촬영/모션을 사용한다.
- 캐릭터: 새 전신 참조 1장. 같은 원본을 전 후보에 사용한다. 기존 v14/15를 승인된 모션으로 취급하지 않는다.
- 출력: 모델이 요구하는 해상도·프레임 규칙으로 생성 후 공통 게임 크기로 비교. 모델 프레임 수를 임의로8로 고정하지 않는다.
- HTML: 원본 driver / 변환 원본 / RGBA / 실제 크기 export를 나란히 재생. 느리게·정상 속도·프레임 이동·ground line·루프 seam을 제공한다.

### 제한된 비교 순서

| 실험 | 새로 확인할 질문 | 범위 / 중단 기준 |
|---|---|---|
| A: 전신 동작 원본 | 생성 전부터 보행이 성립하는가? | 원본에서 발이 역행하거나 체중 이동이 틀리면 모델 실행 전에 수정 |
| B: VACE1.3B vs SD1.5 AnimateDiff+제어 | 로컬에서 동작을 유지하며 캐릭터로 변환 가능한가? | 같은 짧은 driver, 후보별2seed. 최초1회 실패가 OOM이면 offload/해상도 원인만 확인. 품질 실패를 프레임 추가로 덮지 않음 |
| C: Wan-Animate-2 vs SCAIL-2 | 최신 모션 전이가 같은 조건에서 확실히 나아지는가? | 더 큰 GPU에서 비교 권장. 로컬 시도 시 모델별 offload·peak VRAM·RAM·시간 기록. 외부 연산은 별도 실행 선택 |
| D: BiRefNet vs BEN2 vs 시간축 마스크 | 다리 사이 구멍과 장비를 유지하며 alpha가 안정적인가? | 모션이 성립한 한 시퀀스만 사용. mask/원본 overlay 전수 검사 |
| E: PixelOE vs 공통 palette nearest | 실제 크기에서 도트 윤곽과 색이 안정적인가? | 회화풍과 pixel export를 따로 비교. 나쁜 동작을 도트 품질로 승인하지 않음 |

필수로 볼 동작은 지지발의 미끄러짐, 반대발 교차, 무릎 굽힘, 골반/상체의 체중 이동, 다리 앞뒤 가림, 장비 궤적이다. foot direction이나 중심 좌표만 맞아도 전체 모션은 틀릴 수 있으므로 사람 재생 검수를 최종 기준으로 둔다. 접지 구간·발 관절을 입력에서 표시할 수 있으면 자동 지표는 경고 보조로 쓴다.

## GameDevTeam에 반영할 기능 설계

생성 backend를 `framewise-image`, `controlled-video`, `motion-transfer`, `render-stylize`, `sprite-specialist`로 선택 가능하게 하고 입력 계약을 분리한다. 모든 backend에 동일한 seed를 강제하기보다 모델이 제공하는 재현 조건을 기록한다.

공통 입력: 참조 원화, 동작 영상/제어 프레임, 모델별 mask, 목표 화풍, 게임 크기, FPS/타이밍, 루프 구간. 출력에는 backend·model revision/hash·graph·seed·runtime·peak memory·원본 시퀀스·알파·export·사용자 검수 상태를 보존한다. 승인 전 상태는 concept다.

현재 ComfyUI를 바로 대규모 갱신하는 대신 실험용 환경에서 최신 공식 workflow의 노드 존재와 model choices를 preflight한다. Python3.13에서 disabled였던 전처리 의존성 문제도 다시 확인한다. `comfy-run`의 정지 이미지 저장 계약에 영상/alpha를 억지로 끼우지 않고 output type을 명시한다. 기존 소스의 변경은 이번 조사 범위에 포함하지 않았다.

## 검증 기록과 공백

**주장:** 강화 후보와 실행 우선순위를 조사했다. 생산 모션을 확보했다는 주장은 없다.

**증거:** 위의 1차 출처, 하드웨어/설치 폴더 조회, review-loop의 v15 rejected 피드백. 기존 gate 실행 원문은 [art-gate-report](../../out/art-research-start-2026-10-11/art-gate-report.md)에 보존되었다.

**기준:** 현재 사용자 문제를 직접 해결하는가, Comfy 통합이 존재하는가, 로컬 메모리 조건에 맞는가, 코드와 선택 모델 조건이 확인되는가를 구분했다.

**공백:** 새 후보 추론, 실제 모델 다운로드 크기·해시·peak VRAM, 최신 Comfy 환경의 import, sprite 전용 학습 재현, 실제 게임 삽입은 미실행. 기존 art-gate는 `samples/hex-blender-sprite/walk`의 규격 검사1개만 실행하고7개를 건너뛴다. 그 충족 결과는 거절된 fantasy 모션이나 새 후보 품질의 근거가 아니다.

**잔여 위험:** 실사 중심 모델의 비현실적 비율/무기 보존, 생성 뒤 foot sliding·flicker, quantization에 따른 세부 손실, 자동 alpha의 내부 구멍·장비 누락, 도트 cluster의 수작업 부담. 이번 조사는 모든 존재하는 프로젝트를 망라한다는 의미가 아니라 생성·제어·리깅·전용 학습·알파·도트·출력·상용 대안의 각 방향을 조사한 것이다.
