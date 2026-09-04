# ComfyUI 세팅 가이드 (캐릭터 축 백엔드)

캐릭터는 UI·FX와 달리 절차적으로 못 그린다. 생성 모델이 필요하고, 그걸 **로컬에서 완전 자동으로**
돌리기 위한 세팅이다. 설치가 끝나면 에이전트가 HTTP로 직접 워크플로를 던지고 결과를 받아온다 —
사람이 중간에 끼지 않는다.

> **플랫폼**: 이 문서의 설치 절차는 **Windows + NVIDIA** 기준이고, 경로(`D:\ComfyUI` 등)는 예시다.
> macOS/Linux는 ComfyUI 공식 문서대로 설치한 뒤 `COMFYUI_DIR` 환경변수만 그 경로로 맞추면 된다 —
> 스크립트(`comfy-run`·`lora-eval`)는 환경변수·`--comfy` 인자를 먼저 보므로 OS를 가리지 않는다.
> 학습(`lora-train`)은 CUDA 전제라 **Apple Silicon에서는 측정 불가**다. 미달이 아니라 측정 불가로 보고해라.

## 왜 로컬인가

| | 로컬 ComfyUI | 클라우드 API(fal.ai 등) |
|---|---|---|
| 장당 비용 | **0원** | 과금 |
| 시안 수백 장 반복 | 자유 | 비용이 곧 제약 |
| **캐릭터 LoRA 학습** | 가능 → 정체성 문제 해결 | 제한적 |
| 초기 세팅 | 1~2시간 | 5분 |
| 사외 반출 | 없음 (사내 자산 안전) | 프롬프트·레퍼런스가 외부로 나감 |

게임 아트는 "10장 뽑아 1장 고르는" 작업이라 장당 과금이 계속 발목을 잡는다. 그리고 사내 IP가
들어간 레퍼런스를 외부 서비스에 올리는 문제도 로컬에선 사라진다.

## 이 PC 기준 사양 확인 (2026-08-20 실측)

```
GPU : NVIDIA GeForce RTX 5060 / VRAM 8GB
RAM : 31GB
```
SDXL 추론, SD1.5, 픽셀아트 LoRA, SDXL LoRA 학습(느리지만 가능)까지 커버된다.

> **Blackwell(sm_120) 함정 — 받을 파일을 잘못 고르면 걸린다.** RTX 50 시리즈는 구버전 PyTorch가
> 커널을 못 찾고 죽는다(`no kernel image is available for execution on the device`).
> 릴리즈에는 `ComfyUI_windows_portable_nvidia.7z` 와 `..._nvidia_cu126.7z` 두 개가 있는데,
> **cu126 쪽을 받으면 이 증상이 그대로 난다.** 접미사 없는 `nvidia` 를 받는다.
>
> 실측(2026-08-20, ComfyUI v0.33.1 포터블): `torch 2.13.0+cu130` · `cuda build 13.0` ·
> `capability (12, 0)` · `cuda.is_available() True` — 최신 포터블은 이미 해결돼 있다.

## 설치 순서

**1. NVIDIA 드라이버 최신화** — GeForce Experience 또는 nvidia.com. 확인:
```powershell
nvidia-smi
```
CUDA Version이 12.8 이상으로 보이면 된다.

**2. 7-Zip 준비** — 포터블이 `.7z` 로 배포된다. 없으면:
```powershell
winget install --id 7zip.7zip -e --accept-package-agreements --silent
```
(설치 시 관리자 권한 요청 프롬프트가 뜬다)

**3. ComfyUI 포터블 받기**
- https://github.com/comfyanonymous/ComfyUI → Releases → **`ComfyUI_windows_portable_nvidia.7z`** (약 2.0GB)
- 스크립트로:
```powershell
$j = (Invoke-WebRequest "https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest" -UseBasicParsing).Content | ConvertFrom-Json
$a = $j.assets | Where-Object { $_.name -eq 'ComfyUI_windows_portable_nvidia.7z' }
curl.exe -L -o "D:\ComfyUI\portable.7z" $a.browser_download_url
& "C:\Program Files\7-Zip\7z.exe" x "D:\ComfyUI\portable.7z" -o"D:\ComfyUI" -y
```
- 압축은 **경로에 한글·공백 없는 곳**에 푼다 (예: `D:\ComfyUI`)
  한글 경로는 일부 노드에서 인코딩 오류를 낸다. 디스크는 모델까지 감안해 **30GB 이상** 비워둔다

**4. PyTorch가 Blackwell을 지원하는지 확인**
```powershell
cd D:\ComfyUI\ComfyUI_windows_portable
.\python_embeded\python.exe -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.get_device_name(0))"
```
- `cu128` 이상이 아니면 업그레이드:
```powershell
.\python_embeded\python.exe -m pip install --upgrade --force-reinstall torch torchvision --index-url https://download.pytorch.org/whl/cu128
```

**5. 체크포인트(모델) 넣기**
`ComfyUI\models\checkpoints\` 에 `.safetensors` 를 둔다. 8GB VRAM 기준 추천:

| 용도 | 모델 계열 | 비고 |
|---|---|---|
| 캐주얼/일러스트 캐릭터 | SDXL 계열 1개 | 8GB에서 무난. 해상도 1024 |
| 빠른 시안 대량 생성 | SD1.5 계열 | 훨씬 빠름. 512~768로 뽑고 업스케일 |
| 픽셀아트 | SD1.5 + 픽셀아트 LoRA | 팔레트 양자화는 Aseprite에서 후처리 |

**6. 실행**
```powershell
.\run_nvidia_gpu.bat
```
`http://127.0.0.1:8188` 이 뜨면 성공. 브라우저 UI에서 한 장 뽑아 GPU가 실제로 도는지 확인한다.

**7. API 열려 있는지 확인** — 자동화의 전제다
```powershell
curl http://127.0.0.1:8188/system_stats
```
JSON이 오면 에이전트가 붙을 수 있다.

## 자동화 연결 (설치 후)

에이전트는 이 세 엔드포인트만 쓴다.

| 용도 | 호출 |
|---|---|
| 워크플로 제출 | `POST /prompt` (워크플로 JSON + client_id) |
| 진행/완료 확인 | `GET /history/{prompt_id}` |
| 결과 이미지 | `GET /view?filename=...&subfolder=...&type=output` |

워크플로 JSON은 ComfyUI 웹UI에서 **"Save (API Format)"** 으로 뽑는다. 일반 Save 로 받은 파일은
포맷이 달라 `/prompt` 가 거부한다 — 흔한 실수다.

## 정체성 유지 (캐릭터 축의 본질)

프롬프트만으로는 같은 캐릭터가 유지되지 않는다. 강도 순서:

1. **시드 고정** — 같은 시드 + 같은 프롬프트. 포즈가 바뀌면 무너진다. 가장 약함
2. **IP-Adapter / reference-only** — 레퍼런스 이미지 1장으로 인상 유지. 세팅 쉬움, 중간 강도
3. **LoRA 학습** — 캐릭터 시안 **10~20장**으로 1종 학습. 이후 포즈·앵글·표정이 바뀌어도 같은
   캐릭터. **여기까지 가야 캐릭터 축이 진짜 자동화된다.** 8GB에서 SDXL LoRA 학습은 되지만 느리다
   (배치 1, gradient checkpointing 필수). SD1.5 LoRA는 훨씬 빠르다

## 자동 채택 (사람 개입을 1/10로)

무제한 생성이 되는 순간 병목은 "뭘 쓸지 고르기"로 옮겨간다. 기계가 거를 수 있는 것:

- **규격** — 캔버스 크기, 배경 순도(투명/단색), 알파 여백, 피벗 정합 → 100% 자동 판정
- **팔레트 정합** — `palette.json` 대비 색분포 거리 → 점수화
- **실루엣 대비** — 배경 대비 판독성, 축소 시 뭉개짐 → 점수화
- **정체성** — 레퍼런스 대비 색·비율 유사도 → 점수화

이 넷으로 10장 중 7장은 자동 탈락한다. 사람은 남은 3장에서 1장만 고른다.
**완전 무인은 권하지 않는다** — 취향·IP·톤은 사람이 봐야 하고, 그 판단이 곧 아트 디렉션이다.

## 세팅 후 체크리스트

- [ ] `nvidia-smi` 에 GPU가 보인다
- [ ] `torch.version.cuda` 가 12.8 이상
- [ ] 웹UI에서 이미지 1장 생성 성공 (GPU 사용률이 실제로 올라가는지 확인)
- [ ] `/system_stats` 가 JSON 을 반환
- [ ] 워크플로를 **API Format** 으로 저장해 뒀다
- [ ] `palette.json` 의 주조색을 프롬프트에 넣어 톤이 UI·FX와 붙는지 눈으로 확인
