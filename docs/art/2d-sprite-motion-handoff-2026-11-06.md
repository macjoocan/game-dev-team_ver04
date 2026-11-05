# 은발 검사 걷기 실험 인수인계 — 2026-11-06

**상태: 실험·사람 검수 대기. 게임용 애니메이션 아님.** 사용자는 다리 교차와 발 방향이 자연스럽고, 프레임마다 검·망토·포니테일과 캐릭터 형태가 유지되는 결과를 원한다. 모션이 뚝뚝 끊기거나 발·부츠가 검게 변하는 결과, 몸통과 다리가 겹치거나 끊어지는 파츠 합성은 이전 검수에서 문제가 됐다. 단일 프레임, 포즈 가이드 또는 자동 테스트 통과를 완성된 움직임으로 보고하지 않는다.

## 이번 실험과 검수

- 기준 원화는 사용자가 괜찮다고 한 은발 검사 키포즈. [원화](../../samples/2d-sprite-motion-pilot/reference-keypose.png).
- [marearts-moim-pose](https://github.com/MareArts/marearts-moim-pose) 커밋 `731b9fd9da4252263b29ce2d1809ee87b1f51689`의 앞·뒤 다리 깊이 가이드와 FLUX.2 Klein, Wan 2.2 Fun Control 14B를 시험했다. 도구는 Apache-2.0.
- 깊이 가이드는 12프레임 `relaxed`; 도구의 보행 수학 테스트 8개가 통과했다. 이것은 생성된 캐릭터의 자연스러움이나 발 방향을 증명하지 않는다.
- FLUX 단일 프레임 첫 시도에서 검과 긴 망토가 빠졌다. 프롬프트에 장비를 명시한 [두 번째 이미지](../../samples/2d-sprite-motion-pilot/one-frame-equipment-test.png)에서는 둘 다 보였다. 프레임 간 유지가 증명된 것은 아니다.
- 원본 파이프라인의 시작 프레임 검사는 3개 시드 모두 실패했다(`outside 15.9, legs 3, arms 15.8` 등). 무기·망토가 검출에 영향을 줬을 가능성이 있으나 원인으로 확정하지 않았다. 성공 판정을 덮어쓰지 않고, 검과 망토가 보이는 프레임으로 영상 모델만 별도 시험했다.
- Wan 시험은 25프레임 생성, 출력 후반 12프레임으로 [재생본](../../samples/2d-sprite-motion-pilot/video-probe-walk.gif)과 [비교표](../../samples/2d-sprite-motion-pilot/video-contact.png)를 만들었다. 검은 보이지만 포니테일이 짧은 머리로 바뀐다. 배경은 흰색이며 투명 처리·정규화·게임 내 검증은 하지 않았다. **결과는 정체성 미달, 미승인.**
- 이전 RIFE/FILM 보간은 발이 검어지거나 빠지고 잔상이 생겼다. 불량 중간 프레임을 원본 자세로 대체한 임시 시험은 부드러운 최종 해법이 아니다.

## 장비와 모델

시험 PC: Windows, RTX 4070 Laptop 8 GB VRAM, 시스템 RAM 약 32 GB, ComfyUI `0.33.1`, `--lowvram`. 별도 서버 `127.0.0.1:8191`, 별도 user/input/output 및 모델 경로를 사용했다. Wan 영상 25프레임은 한 번 측정에서 약 77초; 일회성 측정이며 적재 중 메모리 여유가 작았다. 원 도구 작성자는 64 GB 시스템 RAM 환경을 사용했다.

8개 파일을 내려받아 크기와 SHA-256을 검증했다. 출처·고정 revision·정확한 바이트·SHA-256은 [모델 목록](../../samples/2d-sprite-motion-pilot/model-candidates.json)에 있다.

| 구성 | 파일 수 | 용도 |
|---|---:|---|
| FLUX.2 Klein 4B FP8, Qwen 3 4B, FLUX VAE, depth LoRA | 4 | 원화와 깊이 가이드로 프레임 생성 |
| Wan 2.2 Fun Control 14B high/low 및 Lightning high/low LoRA | 4 | 깊이 가이드로 연속 영상 생성 |

모델 원본은 이 PC의 `D:\00.project\GameDevTeam\out\moim-silver-pilot\models`에만 있으며 **이 커밋에 포함되지 않는다**. 총 약 43.6 GB(십진). 기존 ComfyUI의 BiRefNet, UMT5 및 Wan VAE를 함께 사용했으며 이것들은 위 8개에 포함되지 않는다. 원 도구 README는 모델별 Apache-2.0 또는 MIT를 안내하지만, 상업적 사용이나 재배포 전 각 모델과 의존성의 조건을 직접 검토한다.

## 다른 PC에서 재개

1. [샘플 폴더](../../samples/2d-sprite-motion-pilot/)의 원화·정지 프레임·GIF를 먼저 보고 결함을 확인한다. GIF는 투명 스프라이트가 아니다.
2. ComfyUI, 모델을 설치하고 `model-candidates.json`의 고정 revision과 해시를 검증한다. 동봉한 `download_models.py`는 **원래 실험 경로를 전제로 한 기록**이므로 다른 PC에서는 경로를 수정하거나 그 경로에 파일을 복사해 사용한다. `image`와 `video` 단계로 나눠 실행한다. `extra_model_paths.example.yaml`의 Windows 절대 경로도 수정해야 한다. 자격 증명은 Git에 넣지 않는다.
3. 스크립트 `test_one_frame.py`, `test_video.py`는 원 도구의 위 커밋, 원래 `out/` 경로, ComfyUI 8191 및 별도 기존 모델을 가정하는 실험 기록이다. 그대로 가져가면 작동한다고 보장하지 않는다. 비디오 프로브는 원본 프레임 검사에 통과한 경로가 아니다.
4. 다음 시도는 동일한 원화·영상 조건에서 **포니테일 및 검 유지**를 최우선으로 비교한다. 필요하면 영역 마스크를 사용한 후처리나 인물 기준 이미지 조건을 검토한다. 검·머리 수정이 발이나 전체 움직임을 악화시키지 않는지 게임 크기의 루프와 프레임별 비교로 확인한다.
5. 기준 캔버스·피벗·발 접지·프레임 간 의상과 무기·잘림·알파·프레임 밝기·루프 경계를 검수한다. 사람 승인 전에는 프로덕션 manifest에 올리지 않는다. 검수 항목 ID는 로컬 `.review-loop/`의 `chr.silver.moim.video-probe@1`; Git에 포함된 샘플과 별개이며 다른 PC에 승인 기록이 자동으로 복제되는 것은 아니다.

## 범위와 출처

이 문서와 샘플은 현재 PC의 파일 및 실행 로그를 기반으로 작성했다. 모델 바이너리, 전체 원본 25프레임, 로컬 서버 설정, 계정 키와 다른 미커밋 작업은 이 인수인계에 포함하지 않는다. 원 도구의 코드는 복사해 플러그인에 통합하지 않았다. 생성 성공은 아트 품질 승인이나 실제 게임에서의 검증을 뜻하지 않는다.
