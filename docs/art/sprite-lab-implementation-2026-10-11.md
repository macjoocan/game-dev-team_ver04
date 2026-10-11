# Sprite Lab 구현·로컬 실행 기록

2026-10-11 · Codex · 대상 커밋 `48413a5` 위 작업 트리. 아래 결과는 전부 concept이며 프로덕션 승인은 없다.

## [주장]

요청한 7방향의 실행 어댑터와 단계별 산출물, 설치 도구를 구현했다. 설치 성공·실제 추론 성공·사람 모션 승인을 구분한다. 현재 가장 먼저 볼 비교본은 PixelLab 걷기, 48px 보정본, Wan-Animate-2와 SCAIL-2 RGBA다.

검수: [로컬 대시보드](http://127.0.0.1:8788/index.html). 재시작하려면 `python -m http.server 8788 --bind 127.0.0.1 --directory out/sprite-lab`.

| 방향 | 구현·실제 실행 | 현재 품질 판단 |
|---|---|---|
| Wan-Animate-2 | 512²·25장·LightX2V+LCM 6스텝·CFG 1, 136.67초. BiRefNet RGBA export | 첫 비가속 설정의 색 붕괴는 줄었으나 칼 방향·디테일 변화. 자동 색 정합성 미달 |
| SCAIL-2 | RGB 드라이버+단일 정체성 빨강 마스크, 512²·25장·DPO+LightX2V·Euler 6스텝·CFG 1, 60.50초 | 첫 설정 대비 색/배경 안정. 장비 변화, 보행 검수 필요. 자동 색·형태 정합성 미달 |
| VACE / AnimateDiff | VACE 1.3B 포즈 제어 256²·25장, 약97초. AnimateDiff SD1.5 Canny+IP-Adapter 16장 | VACE 캐릭터 전이 확인. AnimateDiff는 마네킹·장면 드리프트가 커서 품질 미달 |
| Blender 연계 | Blender 5.2.2 LTS 전신 2링크 IK, 25장·256² 렌더, .blend·관절 기록·포즈 PNG | 관절 길이·접지·스윙 제어용 마네킹. 완성 캐릭터 리그·수작업 수준 모션으로 승인한 것이 아님 |
| PixelLab / Sprite Sheet Diffusion | PixelLab 승인된 유료 1건 완료. SSD 독립 Python 3.10·기반 모델·공개 가중치 3개 설치, 실제 추론 시도 | PixelLab 8프레임 요청에 이미지 9장 반환. 자동 실루엣 정합성 미달. SSD는 필수 전용 PoseGuider 누락으로 실행 대기 |
| BiRefNet / BEN2 / SAM2 | 원화 배경 제거 2종 실행. SAM2.1 tiny 마네킹 25장 점 추적, 서버38.65초 | 다리 사이 투명화 확인. 깃털·칼 경계 색 번짐, 실제 캐릭터 마스크 추적은 검수 필요 |
| PixelOE / 공통 팔레트 | PixelLab→48px·24색·이진 알파·외톨이 정리2회 | 도트 계약 exit 0. 모션·관절·장비 보존의 증명은 아님 |
| Wan-Alpha | 256²·9장 RGBA 불꽃, 20스텝·CFG 6, 118.54초. RGB/alpha VAE 동일 latent 디코드 | 알파 범위 0~255, 알파128 미만 픽셀 약66~77%. 8 FPS 반복 플래시 검사 충족, 12 FPS는 조건부. 스타일·작은 게임 화면 검수 대기 |

## [증거]

모델과 노드는 `D:/ComfyUI/ComfyUI_windows_portable/ComfyUI`에 설치했다. RTX 4070 Laptop VRAM 8188MiB, RAM 약32GB, ComfyUI 0.33.1 `--lowvram`, embedded Python `-s`. Wan 실행 중 실제 GPU 사용 약7.49GiB·100%, 프로세스 RAM 약12.25GB를 관측했다. 모든 작업은 GPU를 공유하므로 순차 실행한다.

- [설치·모델 버전/해시/조건](../../out/sprite-lab/models-manifest.json): 공식 HF LFS 해시 대조. 실패한 이전 설치 기록도 별도로 보존.
- [실제 서버 registry](../../out/sprite-lab/doctor/doctor.json): Wan·VACE·AnimateDiff·PixelOE·SAM2 노드 활성 확인. `pixellab_key_present`는 환경변수만 보는 값이다. 로컬 credential 파일 사용 여부와 다르다.
- [PixelLab job](../../out/sprite-lab/pixellab-walk/job.json), [manifest](../../out/sprite-lab/pixellab-walk/manifest.json): 작업 `f5dad887-da4a-4ad9-b852-579ddd2fd6fd`. 승인된 원화 128px 전송·걷기 1건만 제출. 키는 `.secrets/pixellab.env`에 있으며 Git 제외.
- [48px 도트 계약 원문](../../out/sprite-lab/pixellab-pixel-clean-review/pixel-qa.md): **exit 0**. 정리 전 48px는 외톨이 비율로 exit 1이었으며 결과를 덮어 성공으로 보고하지 않는다.
- [PixelLab 스프라이트 판정 원문](../../out/sprite-lab/pixellab-review/sprite-qa.txt): **exit 1**.
- [Wan RGBA 판정 원문](../../out/sprite-lab/wan-animate2-fast-alpha-review/sprite-qa.txt): **exit 1**.
- [SCAIL RGBA 판정 원문](../../out/sprite-lab/scail2-fast-alpha-review/sprite-qa.txt): **exit 1**.
- [Wan-Alpha 8 FPS 플래시 원문](../../out/sprite-lab/wan-alpha-review/flash-qa-8fps.txt): **exit 0·충족**. [12 FPS 원문](../../out/sprite-lab/wan-alpha-review/flash-qa.txt): **exit 0·조건부**, 4회/초·최대 영역17.8%. 프리뷰를 8 FPS·최대8 FPS로 제한했다. 검사는 normal 합성·어두운 배경·단일 에셋 조건이며 중첩 화면 안전을 보장하지 않는다.
- [SSD 가중치·환경 기록](../../out/sprite-lab/ssd-provenance.json), [실제 추론 오류](../../out/sprite-lab/ssd-inference.log), [현재 preflight](../../out/sprite-lab/ssd-preflight/result.json): 첫 시도 **exit 1**(legacy PoseGuider state_dict 불일치), 정확한 전용 가중치 경로로 수정 후 **exit 3**(누락). 공개 폴더에는 연구 UNet 2개와 motion module만 있다. [공식 저장소 이슈 #3](https://github.com/chenganhsieh/Sprite-Sheet-Diffusion/issues/3)도 같은 누락을 설명한다. strict=False로 덮거나 무작위 가중치로 성공을 만들지 않았다.
- 생성 폴더마다 `spec.json`, `graph.api.json`, `job.json`, `history.json`, `raw/`, `manifest.json`을 남겼다. export는 공통 캔버스·피벗·시트·조작 가능한 HTML을 남긴다.
- Python 검증 3건 통과: 시퀀스 공통 팔레트/이진 알파/내부 투명 구멍 보존, 혼합 캔버스 거절, 기존 유료 job 조회 시 POST 재제출 금지.
- [테스트 원문](../../out/sprite-lab/tests.txt) **exit 0**, [plugin validator 원문](../../out/sprite-lab/plugin-validation.txt) **exit 0**.
- 사람 검수 대상은 `.review-loop/items.json`에 `--harness codex`로 등록했다. 이전 v15 거절 피드백을 유지하며 승인 상태로 승격하지 않았다.

## [기준]

후속 [보행·칼 제어 비교 및 실제 PixelLab 비용](walk-prop-followup-2026-10-11.md)을 추가했다. 해당 job 응답은 USD 0·구독 생성량 2, 유료 크레딧 환산 $0.033919644를 기록한다.

원화 정체성·전신 연결·발 교차·접지·무릎/골반 체중 이동·칼/망토 보존·루프 경계를 사람이 본다. 프레임별 bbox에 맞춰 확대하지 않고 공통 캔버스를 유지한다. 픽셀 팔레트는 시퀀스 전체에서 하나로 만든다. 재생 페이지에서 1× 크기·확대·밝은/어두운/체커 배경, 프레임 넘기기, FPS를 바꿔 검수할 수 있다.

재사용 도구: [sprite-lab.py](../../skills/char-art-system/scripts/sprite-lab.py), [설치 도구](../../skills/char-art-system/scripts/sprite-lab-setup.py), [Blender 드라이버](../../skills/char-art-system/scripts/blender-walk-driver.py), [사용 문서](../../skills/char-art-system/references/sprite-lab.md). source와 plugin mirror를 맞춘 후 plugin validator로 확인한다.

## [공백]

- 실제 게임에 삽입하지 않았다. 바쁜 게임 화면·최소 목표 화면에서 가독성 검수하지 않았다.
- seed 원화 자체는 승인된 최종 디자인이 아니다. API 전송·유료 1건 승인과 프로덕션 디자인 승인은 별개다.
- 브라우저 자동화는 두 런타임 모두 시작 오류로 사용할 수 없었다. HTTP 200과 파일 구조를 확인했지만 재생 버튼의 실제 브라우저 조작 검증은 미실행이다.
- 완전한 전투/점프/피격 캐스트, 스프라이트 아틀라스 엔진 반영, 8~16프레임 수작업 수준 보행 승인은 없다.
- SSD 전용 PoseGuider를 확보하지 못해 전용 연구 모델의 프레임 생성 재현은 완료하지 못했다. 공개 UNet과 환경 설치를 추론 성공으로 취급하지 않는다.
- Blender 입력의 마지막 프레임은 첫 프레임과 같은 제어용 closing frame이다. 게임 루프 타이밍으로 승인하지 않았다.

## [잔여 위험]

모델이 동작 영상을 소비해도 작은 도트 캐릭터의 해부학·장비·화풍을 자동 보장하지 않는다. 자동 실루엣 IoU는 망토의 큰 정상 움직임에도 민감할 수 있으나, 미달 결과를 임의로 통과로 바꾸지 않는다. 반투명 가장자리와 고아 섬의 정리, 장비 고정, 루프 재편집이 남는다.

RMBG와 Advanced-ControlNet wrapper는 GPL-3.0, PixelOE·AnimateDiff Evolved·SAM2 wrapper는 Apache-2.0으로 설치본 LICENSE를 기록했다. IP-Adapter Plus node GPL-3.0과 모델 Apache-2.0, SD 기반 OpenRAIL 조건, 각 연구 가중치 조건은 독립적이다. PixelLab은 원격 상용 API이며 키·비용·서비스 조건이 따로 적용된다. [조사와 공식 출처](comfy-sprite-upgrade-research-2026-10-11.md)를 함께 보관한다. 외부 코드를 플러그인에 복사하거나 외부 모델을 Git에 담지 않았다.
