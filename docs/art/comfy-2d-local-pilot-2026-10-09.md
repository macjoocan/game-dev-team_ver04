# 로컬 ComfyUI 2D 아트·모션 파일럿

상태: **concept**. 대상은 `D:\ComfyUI\ComfyUI_windows_portable`의 ComfyUI 0.33.1, RTX 4070 Laptop 8 GB, `--lowvram`이다. 모델 가중치와 노드는 저장소에 포함하지 않는다. 재현 그래프·프레임·검수 HTML은 `out/comfy-motion-pilot/`에 있다.

## 설치와 실행 결과

| 자산 | 용도 | SHA-256 또는 리비전 | 상태 |
| --- | --- | --- | --- |
| [LCM LoRA SDXL](https://huggingface.co/latent-consistency/lcm-lora-sdxl) | 빠른 SDXL 샘플링 | `a764e6859b6e04047cd761c08ff0cee96413a8e004c9f07707530cd776b19141` | 설치·8스텝 장면 생성 확인 |
| [Comfy-Org BiRefNet](https://huggingface.co/Comfy-Org/BiRefNet) | 배경 제거 | `9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154` | 설치; 앞선 파일럿에서 같은 모델의 마스크 비교 완료 |
| [xinsir Union SDXL ControlNet](https://huggingface.co/xinsir/controlnet-union-sdxl-1.0) | 엣지·포즈 제어 후보 | `a9e13fd61f3193887791c8a0dd07a07202174dc47d5ddaea94ea1344f07c7467` | 설치·노드 선택지 확인; 이번 파일럿에서 추론 미실행 |
| [VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) | PNG 시퀀스 MP4 출력 | `4d907bee61e92c2e65af3bd6383a4e4d356126d1` | 설치·48프레임 H.264 출력 확인 |
| [pixelmon PixelArtPalette](https://github.com/grymmjack/pixelmon) | 팔레트와 픽셀 격자 변환 | `8260ab3c77101a069faf2d220a4bbe6d05dca163` | 설치·128×85 장면 생성 확인 |

`ComfyUI-PixelArt-Detector`와 `comfyui-controlnet-aux`는 내려받았지만 현재 `disabled_custom_nodes/`에 둔다. Python 3.13 임베디드 환경에서 import 시 추가 패키지 설치와 의존성 충돌 위험이 있어 이번 구성을 활성화하지 않았다. 공식 노드 Canny와 직접 그린 OpenPose 포즈가 기본 제어 경로다.

## 영상 노하우 적용

[모션 그래픽 영상 조사](hero-inc-pxf-motion-research-2026-10-09.md)의 `정확한 시간 큐 + 코드 기반 렌더` 방식을 작은 전투 스킬 소개에 적용했다. `build_motion.py`는 48개 프레임의 단일 시계를 사용해 캐릭터 이동, FX, UI 텍스트를 동기화한다. HTML 검수기에서 속도, 프레임 단위 이동, 2프레임 임팩트 정지와 카메라 반동을 비교할 수 있다. 개별 요소의 독립 타이머를 쓰지 않아 반복 재생 시 타이밍이 어긋나지 않는다.

장면은 SDXL+Pixel Art XL+LCM LoRA로 생성했으며, 기존 concept 캐릭터 포즈와 FX를 코드로 합성했다. 영상 생성 모델이 캐릭터를 연속 생성한 결과가 아니다. HTML의 `전체 포즈` 모드는 13개 포즈를 이어 보여주므로 중간 프레임 부족과 정체성 변화를 눈으로 판정할 수 있다.

## 검수 결과와 공백

- 그래프 사전 검사 통과, ComfyUI 영상 그래프 실행 성공.
- HTML의 이미지 63개 경로 확인, JavaScript 문법 검사 통과.
- MP4 디코딩 결과 48프레임·12 FPS·640×360 확인.
- 브라우저 자동 화면 검수는 이 PC의 browser 연결 모듈 경로 오류로 실행하지 못했다. HTML 파일을 직접 열어 눈으로 최종 확인해야 한다.
- 캐릭터 디자인 승인, 8~16프레임 동작 연속성, 실제 게임 삽입, 오디오 싱크와 타격감, 생산용 알파 정리는 남아 있다.
