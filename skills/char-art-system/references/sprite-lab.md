# Sprite Lab — 모델 생성과 동작 원본을 연결하기

이 도구는 concept 생산과 비교용이다. 출력 성공·팔레트 통과가 사람의 모션 승인을 대신하지 않는다.

## 런타임

Python 3.10+, `requests pillow numpy imageio-ffmpeg`(Windows 다운로드는 `truststore` 권장). 생성 backend에 따라 실행 중인 ComfyUI, 모델, 노드가 필요하다. `sprite-lab-setup.py`는 외부 custom_nodes와 모델을 설치하고 Git revision·크기·SHA-256을 기록한다. LFS 원본 해시가 있으면 대조한다. Windows용 PixelOE eager 실행과 RMBG 선택 모듈 오류 처리는 패치 해시를 따로 기록한다. 모델은 플러그인에 포함하지 않는다.

```powershell
python skills/char-art-system/scripts/sprite-lab-setup.py --root D:/ComfyUI/ComfyUI_windows_portable/ComfyUI --nodes animatediff controlnet pixel sam2 --dependencies --models vace --out out/sprite-lab/install
python skills/char-art-system/scripts/sprite-lab.py doctor --out out/sprite-lab/doctor
```

전체 비교 후보 설치는 `--nodes animatediff controlnet pixel alpha sam2 --dependencies --models vace wan-animate2 wan-animate2-fast scail2 scail2-fast animatediff identity-sd15 wan-alpha ssd-base`를 명시한다. 모델 전체는 수십 GB이며 외부 ComfyUI 경로에 저장한다. `--root`는 portable 부모가 아닌 `ComfyUI` 폴더다. Sprite Sheet Diffusion의 학습 가중치 3개는 upstream README의 별도 링크에서 받으며 `ssd-base`에는 포함되지 않는다.

**SSD 공개 배포 제한(2026-10-11 확인):** 다운로드 폴더에는 전용 `pose_guider.pth`가 없다. 이 구현은 다중 스케일·cross-attention PoseGuider를 필요로 하므로 Moore-AnimateAnyone의 legacy PoseGuiderOrg 가중치를 사용할 수 없다. [공식 저장소 이슈 #3](https://github.com/chenganhsieh/Sprite-Sheet-Diffusion/issues/3)와 실제 strict load 실패를 확인했다. 올바른 학습 가중치를 확보할 때까지 SSD 실행은 대기하며 기반 모델 설치 성공을 연구 모델 재현 성공으로 표시하지 않는다.

## 단계별 사용

```powershell
# 전체 관절 길이를 유지하는 Blender 제어 시퀀스. 최종 아트가 아니다.
blender -b --python skills/char-art-system/scripts/blender-walk-driver.py -- --out out/driver --frames 25 --render
python skills/char-art-system/scripts/sprite-lab.py pose-driver --source out/driver/motion.json --out out/driver/pose --size 512
# 그래프 준비. 모델·노드가 없으면 exit 3; 조용히 다른 모델로 대체하지 않는다.
python skills/char-art-system/scripts/sprite-lab.py generate --spec job.json --out out/job
# 실제 생성 (PixelLab은 유료 요청). 자동 재요청하지 않는다.
python skills/char-art-system/scripts/sprite-lab.py generate --spec job.json --out out/job --execute
python skills/char-art-system/scripts/sprite-lab.py alpha --source out/job/raw --method birefnet --out out/job/alpha
python skills/char-art-system/scripts/sprite-lab.py export --source out/job/alpha --out out/job/export --size 128 --fps 12 --pixel
# PixelOE 윤곽 변환 + 시퀀스 공통 팔레트
python skills/char-art-system/scripts/sprite-lab.py export --source out/job/alpha --out out/job/pixel --size 128 --fps 12 --pixel --pixeloe
```

`backend`: `wan-animate2`, `scail2`, `vace`, `animatediff`, `wan-alpha`, `pixellab`.
Comfy job는 `reference`, `driver`(PNG 프레임 폴더), `canvas`, `frames`, `prompt`, `negative`, `seed`, `models`를 명시한다. 모델 이름은 서버가 실제로 제공하는 선택값과 일치해야 한다. Wan은 `4n+1` 프레임이다. VACE와 Wan-Animate-2는 reference latent를 TrimVideoLatent로 제거한다. **Wan-Animate-2는 RGB 동작 영상을 직접 소비한다.** 원조 Wan2.2-Animate의 포즈 전처리와 혼동하지 않는다. authored 포즈 프레임은 VACE·SSD 비교용이며 손·얼굴 세부가 없다. SCAIL-2는 `reference_mask`, `driver_masks`의 identity color 대응을 반드시 제공한다. `scail-masks`는 검수된 RGBA를 단일 캐릭터 빨강/검정 마스크로 변환한다.

AnimateDiff의 `models.ipadapter`, `models.vision`, `reference_weight`로 SD1.5 참조 어댑터를 연결한다. 이 옵션이 없으면 캐릭터 정체성 조건이 없다. ControlNet은 driver의 Canny를 쓰므로 입력을 실제 동작과 맞춰야 한다. `wan-alpha`는 RGB VAE와 alpha VAE를 같은 latent에 적용하고 RGBA로 저장한다.

Wan-Animate-2 가속 예제는 `models.lora`, `lora_strength:1`, LCM·6스텝·CFG 1·shift 5를 사용한다. SCAIL-2 가속 예제는 DPO를 `models.lora`에, LightX2V를 `models.acceleration_lora`에 넣고 `acceleration_strength:.8`, Euler·6스텝·CFG 1·shift 5를 사용한다. 원본 모델과 예제 버전에 맞춰 비교한다.

`alpha-comfy`는 SAM2 추적이다. spec에 `source`, `positive_points: [{"x":128,"y":110}]`를 명시하고 필요하면 `negative_points`를 더한다. 점은 첫 프레임에서 사람이 확인한다. `model` 기본값은 SAM2.1 tiny이고 처음 실행할 때 노드가 다운로드한다.

PixelLab job는 `operation`, `reference`, `request`와 선택적 `credentials_file`을 사용한다. 토큰은 `PIXELLAB_API_KEY` 환경변수를 먼저 읽고, 없으면 credential 파일에서 읽는다. 요청 preview·spec·manifest에 토큰을 쓰지 않는다. 작업 ID를 받으면 job.json에 보존한다. 같은 spec·out으로 재실행하면 기존 job을 조회한다. 다른 요청은 새 out이 필요하다. 타임아웃은 재제출 허가가 아니다.

`ssd` 단계는 별도 Python 3.10 환경과 체크아웃의 `ModelTraining`을 사용한다. spec의 `python`, `repo`, `reference`, `driver`, `models`(원본 YAML의 경로 키 7개)로 데이터셋·추론 YAML·실행 argv를 만들고 새 결과만 export한다. `frames`, `steps`, `cfg`, `export_size`를 명시할 수 있으며 `--size`는 추론 해상도다. 직접 작성한 `command`·`frames_dir`도 지원한다. README는 MIT와 CC0 학습 데이터를 선언한다. 기반 모델과 어댑터 조건은 별도로 기록한다. 플러그인에 upstream 코드를 복사하지 않는다. 구형 의존성은 ComfyUI 환경에 설치하지 않는다.

## QA와 승인

`export`는 모든 프레임의 공통 캔버스를 요구한다. 전체 프레임의 불투명 픽셀에서 팔레트를 한 번 만들고 동일하게 적용한다. 원본의 공통 canvas 위치를 유지하며 프레임별 bbox 크기로 확대하지 않는다. RGBA, sheet, manifest, review.html을 남긴다.

`review.html`에서 접지·발 교차·체중 이동·장비·loop seam을 본다. Blender 입력은 마지막 프레임이 첫 프레임과 같은 `4n+1` 제어용 시퀀스다. 게임 반복 export에서는 closing duplicate의 유지 여부와 타이밍을 별도로 결정해야 한다.

재생 페이지에서 프레임 슬라이더·이전/다음·FPS·1× 실제 크기·배경을 바꿀 수 있다. `--pixel --pixeloe --clean 2`는 시트 공통 팔레트를 만든 뒤 실루엣 내부의 외톨이 색을 정리한다. 알파 실루엣을 메우거나 잘못된 관절을 고치지는 않는다.

exit 0 실행 성공 / 1 실행·입력 실패 / 3 서버·모델·키 등 실행 조건 미충족. 성공은 승인 상태가 아니다. manifest는 항상 concept를 유지한다.

폴더 판정에 sheet와 개별 프레임을 함께 넣으면 중복 계수된다. 도트 판정은 `pixel-contract.mjs <export>/sheet.png --cell 128`로 실행한다. seed 원화 승인과 실제 게임 화면 검수가 끝나기 전에는 production으로 승격하지 않는다.
