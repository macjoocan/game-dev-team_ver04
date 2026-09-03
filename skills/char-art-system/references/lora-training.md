# 캐릭터 LoRA 학습 가이드 (정체성 고정)

캐릭터 축이 "자동화"가 되는 지점은 여기다. 시안 10~20장으로 LoRA 하나를 학습하면 이후 포즈·앵글·표정·의상이
바뀌어도 **같은 캐릭터**가 나온다. 시드 고정·IP-Adapter·"한 장에 여러 포즈" 는 전부 이걸 못 해서 쓰는 우회다.

이 문서는 **8GB VRAM(RTX 5060, Blackwell)** 기준이다. 실측이 붙은 항목과 아직 안 붙은 항목을 구분해 적었다.

## 언제 하나 — 그리고 언제 안 하나

| 상황 | 판단 |
|---|---|
| 캐릭터 1종을 스킨·표정·포즈로 **계속 양산**해야 한다 | **한다.** 학습 1~2시간이 이후 수백 장을 산다 |
| 시안 단계, 아직 어떤 캐릭터인지 정해지지 않았다 | 안 한다. IP-Adapter 나 시트 생성으로 버틴다 |
| 채택된 시안이 5장 미만이다 | 안 한다. 먼저 `comfy-run` 으로 같은 캐릭터를 더 뽑아 채운다(다른 포즈·앵글로) |
| 여러 캐릭터를 한 LoRA 에 넣고 싶다 | 안 한다. **캐릭터 1종 = LoRA 1개.** 섞으면 서로 특징이 번진다 |

## 구성 요소

```
lora-dataset.mjs   채택본 → 알파 합성·축소·중복 제거·캡션 → dataset.toml + dataset-manifest.json
lora-train.mjs     dataset → config.toml(8GB 프리셋) → accelerate 로 sd-scripts 실행 → train-log.json + ComfyUI 복사
lora-eval.mjs      에폭 × 강도 × 프롬프트 격자 한 장 → 사람이 (파일, 강도) 를 고른다
sdxl-character-lora.api.json   LoraLoader 가 들어간 생성 워크플로
```

학습기 자체는 **kohya-ss/sd-scripts** 를 쓴다. 이유: SD1.5·SDXL 둘 다 되고, 설정이 TOML 이라 기계가 쓰기 쉽고,
결과 `.safetensors` 가 ComfyUI `LoraLoader` 에 그대로 들어간다. 스크립트는 sd-scripts 를 **호출만** 한다 — 설치는 아래.

## 1. 학습기 설치 (1회, 30분~1시간)

ComfyUI 포터블의 파이썬을 쓰지 않는다. sd-scripts 는 의존성 버전을 고정하고 있어 ComfyUI 것과 충돌한다.
별도 venv 를 판다.

```powershell
# 1) Python 3.10 또는 3.11 (3.12+ 는 일부 의존성이 아직 안 올라왔다 — 확인 필요 항목)
winget install --id Python.Python.3.11 -e

# 2) sd-scripts 받기 — 경로에 한글·공백 없이
git clone https://github.com/kohya-ss/sd-scripts.git D:\sd-scripts
cd D:\sd-scripts

# 3) venv + Blackwell 용 PyTorch (cu128 이상. cu126 이하는 "no kernel image" 로 죽는다 — ComfyUI 와 같은 함정)
py -3.11 -m venv venv
.\venv\Scripts\activate
pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
pip install bitsandbytes          # AdamW8bit 용. 실패하면 건너뛰고 --optimizer Adafactor

# 4) accelerate 기본 설정(질문 나오면 전부 기본값 — This machine / No distributed / bf16)
accelerate config default

# 5) 확인
python -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.get_device_capability(0))"
# → 2.x+cu128 이상, (12, 0) 이면 된다
```

환경변수 `SD_SCRIPTS_DIR=D:\sd-scripts` 를 두면 `lora-train.mjs` 가 자동으로 찾는다(없으면 `--sd-scripts`).

> **실측(2026-09-03):** 위 순서 그대로 됐다. Python 3.10.11 venv · `torch 2.11.0+cu128` · capability (12, 0) ·
> bitsandbytes 0.50.2 정상. 설치 약 15분(torch 다운로드 포함). 막힌 곳 하나: `accelerate config default` 는
> `python -m accelerate.commands.config` 로 부르면 실패한다 — `venv\Scripts\accelerate.exe config default` 로 부른다.
> sd-scripts 는 main 브랜치(2026-09 기준 accelerate 1.6 · diffusers 0.32 · transformers 4.54)를 썼다.

### 자동 캡션 (WD14 태거) — 스타일 LoRA 나 장수가 많을 때

캡션을 손으로 못 쓰는 규모면 sd-scripts 에 들어 있는 태거를 쓴다. CPU 로 70장에 35초.
```powershell
.\venv\Scripts\python.exe -m pip install onnxruntime onnx
.\venv\Scripts\python.exe finetune\tag_images_by_wd14_tagger.py --onnx --repo_id SmilingWolf/wd-swinv2-tagger-v3 `
  --model_dir D:\lora-work\wd14 --batch_size 4 --caption_extension .txt --general_threshold 0.35 `
  --character_threshold 0.95 --remove_underscore <이미지 폴더>
```
결과 `.txt` 를 `captions.json` 으로 모은다(파일명 → 태그 문자열). 알파를 흰색에 합성하므로 `transparent background`,
`simple background` 태그는 빼고 넣는다. **캐릭터 LoRA 에는 쓰지 마라** — 태거는 머리색·의상을 전부 적어서
정체성이 토큰 대신 태그에 학습된다. 캐릭터 LoRA 캡션은 사람이 "변하는 것만" 쓴다.

## 2. 데이터셋 — 여기서 결과의 80% 가 정해진다

```bash
node lora-dataset.mjs art/char/approved --out art/char/lora-ds --token gdt_hero \
  --captions captions.json --res 1024
```

### 장수와 구성
- **10~20장.** 그 이상은 좋아지지 않고 학습만 길어진다. 8장 미만이면 포즈가 굳는다
- **다양성이 장수보다 중요하다.** 정면만 15장이면 측면이 안 나온다. 정면·측면·¾·뒷모습, 서기·앉기·점프, 표정 2~3종
- 전부 **같은 캐릭터**여야 한다. "비슷한" 시안 섞으면 평균이 학습된다. 의심스러운 장은 뺀다
- 채택본이 부족하면 `comfy-run` 으로 채택 시드 근처에서 포즈 프롬프트만 바꿔 더 뽑는다. `sheet-split` 으로 나눈
  셀도 좋은 재료다(한 장 안이라 정체성이 이미 맞다)

### 알파와 배경
- 스크립트가 알파를 **단색(기본 흰색)에 합성**한다. 투명 PNG 그대로 넣으면 학습기가 알파를 버리면서 검은 테두리가
  생기고, 그게 학습된다
- 배경색은 게임의 실제 배경과 **다르게** 하는 게 맞다. 학습 배경이 생성 배경으로 새어 나오는 게 흔한 과적합 증상이다.
  단색 여러 개를 섞으려면 폴더를 나눠 `--bg` 를 다르게 두 번 돌리고 dataset.toml 의 subsets 를 합친다

### 캡션 (captions.json)
```json
{
  "s1000_char_00001.png": "front view, standing, arms at sides, neutral face",
  "s1003_char_00001.png": "side view, walking, looking ahead",
  "s1007_char_00001.png": "three-quarter view, sitting, smiling"
}
```
규칙은 하나다: **캡션에는 이 장에서 변하는 것만 쓴다.** 머리색·옷·비율 같은 정체성은 쓰지 않는다.
쓰면 그 특징이 트리거 토큰이 아니라 그 단어에 붙어서, 나중에 토큰만 넣으면 안 나온다.
캡션이 없어도 돌지만(토큰+class 만), 포즈 제어가 약해진다.

### 전 장에 공통인 특징은 캡션에 쓰지 마라 — 실제로 틀린 사례

redhood_v2(2026-09-03)는 19장 전부에 `hood up` 을 캡션으로 넣었다. 후드가 항상 올라가 있으니 "정직하게" 적은 것인데,
결과는 **토큰만 넣으면 후드가 벗겨진다.** 전 장에 공통인 단어는 정체성의 일부인데, 캡션에 쓰는 순간 모델은 그 특징을
토큰 대신 그 단어에 저장한다. 위 규칙("변하는 것만")의 반대 사례다.

판단 기준은 하나다: **이 단어가 이 데이터셋 안에서 값이 바뀌는가?** 바뀌면(정면/측면, 웃음/울음) 캡션에 쓴다.
안 바뀌면(항상 후드, 항상 흰 머리) 쓰지 않는다. 후드를 가끔 내린 장이 섞여 있을 때만 `hood up` / `hood down` 을 쓴다.

### 트리거 토큰
`--token` 은 **사전에 없는 단어**로 한다(`gdt_hero`, `zxq_cat`). `hero`, `girl`, `knight` 같은 실제 단어는
모델이 이미 아는 개념과 섞인다. 소문자·숫자·밑줄만.

## 3. 학습

```bash
node lora-train.mjs art/char/lora-ds --name hero_v1 --base sdxl
node lora-train.mjs art/char/lora-ds --name hero_v1 --base sdxl --dry-run   # 설정만 보기
```

### 8GB 프리셋이 왜 그 값인가

| 항목 | 값 | 이유 |
|---|---|---|
| batch | 1 | SDXL 은 8GB 에서 1 이 상한 |
| gradient_checkpointing | on | 없으면 안 뜬다. 속도 30% 손해 |
| network_train_unet_only + TE 출력 캐시 | on (SDXL) | TE 두 개를 통째로 메모리에서 뺀다. 캡션 셔플은 꺼야 한다 |
| fp8_base | on (SDXL) | 베이스 UNet 을 fp8 로 → 약 6GB. LoRA 품질 손해는 미미 |
| mixed_precision | bf16 | Blackwell 은 bf16 이 된다. fp16 은 loss NaN 이 난다 |
| sdpa | on | Blackwell 용 xformers 휠이 없다. torch 내장 어텐션 |
| dim / alpha | 16 / 8 | 캐릭터 1종은 8~32. 16 이면 ~100MB. alpha=dim/2 가 lr 1e-4 와 맞는다 |
| optimizer | AdamW8bit | bitsandbytes 필요. 안 깔리면 Adafactor(메모리 더 적고 약간 느림) |
| steps | 1500 | 15장×10반복×10에폭. 에폭마다 저장하고 **eval 에서 고른다** |
| lr | 1e-4, cosine, warmup 5% | 캐릭터 LoRA 의 무난한 값. 색이 뒤집히면 5e-5 |
| min_snr_gamma | 5 | 적은 장수에서 수렴 안정 |
| data loader workers | 0 | Windows 에서 >0 이면 spawn 오류 |

**실측(2026-09-03, RTX 5060 8GB):** SDXL Base · 1024px · 13장×12반복 · 1,560스텝 · 위 프리셋 그대로 →
**31분, 1.00~1.04초/스텝, OOM 없음.** 잠재·TE 캐시 만드는 데 약 2분이 먼저 든다. 첫 실행은 CLIP 토크나이저
다운로드가 추가된다. 문서 초안의 "1~2시간" 예상은 3배 비관적이었다.

### 메모리 부족(OOM) 이 나면 — 순서대로 하나씩
1. `--dim 8`
2. 데이터셋을 `--res 768` 로 다시 만든다(잠재 크기 44%)
3. ComfyUI 가 모델을 잡고 있으면 먼저 내린다: `curl -X POST 127.0.0.1:8188/free -d '{"unload_models":true,"free_memory":true}'`
   (실측: SDXL 하나가 커밋 10GB 를 잡고 있다 — 학습과 동시에 못 산다)
4. 그래도 안 되면 `--base sd15` 로 내려간다. 캐주얼 2D 캐릭터는 SD1.5 로도 충분한 경우가 많다

`lora-train.mjs` 는 로그 끝을 보고 OOM / 커널 없음 / bitsandbytes 없음 / NaN 을 구분해 알려준다.

## 4. 고르기 — 학습의 결과는 파일이 아니라 (에폭, 강도) 다

```bash
node lora-eval.mjs --lora art/char/lora-ds/train --token gdt_hero --out art/char/lora-eval
```

에폭 파일 전부 × 강도(0 / 0.6 / 0.8 / 1.0) × 프롬프트 4종 × 시드 2개를 한 장 격자(`eval-sheet.png`)로 만든다.
맨 위 행이 LoRA 없는 베이스라인이다. 사람은 **이 한 장만 본다.**

고르는 기준:
- 정체성이 붙는 **가장 이른 에폭·가장 낮은 강도**. 마지막 에폭이 최선인 경우는 드물다
- 프롬프트 4종(정면/측면 걷기/점프/앉기)에서 **포즈가 실제로 바뀌는지**. 안 바뀌면 그 에폭은 과적합
- 배경이 학습 배경색으로 도는지, 화풍이 학습 이미지 그대로 굳었는지
- 강도 1.0 에서만 정체성이 붙으면 학습이 부족하다(스텝을 늘리거나 장수를 채운다)

고른 (파일, 강도)가 이 캐릭터의 **정체성 정의**다. 그 밖의 에폭 파일은 지워도 된다(train-log 에 이력이 남는다).

## 5. 등록 — 안 적으면 6개월 뒤 재현 못 한다

`asset-pipeline` manifest 의 캐릭터 항목에:
```
lora: { file: "hero_v1-000007.safetensors", strength: 0.7, token: "gdt_hero",
        trainLog: "art/char/lora-ds/train/train-log.json" }
checkpoint: sd_xl_base_1.0.safetensors (train-log 의 sha256_head32MB)
```
`train-log.json` 에는 체크포인트 식별·데이터셋 해시·전체 하이퍼파라미터·명령줄·소요 시간이 있다.
데이터셋 폴더(`img/`, `captions.json`)도 같이 보관한다 — LoRA 파일만 남고 데이터셋이 없으면 v2 를 못 만든다.

## 6. 생성에서 쓰기

```bash
node comfy-run.mjs references/workflows/sdxl-character-lora.api.json --out art/char/skins --batch 8 \
  --set 10.lora_name=hero_v1-000007.safetensors --set 10.strength_model=0.7 --set 10.strength_clip=0.7 \
  --set 6.text="gdt_hero, winter coat, scarf, front view, standing, ..."
```
프롬프트는 **토큰으로 시작**한다. 이후는 기존 파이프라인(`cutout` → `sprite-normalize` → `atlas-pack`) 그대로.

## 스타일 LoRA — 캐릭터가 아니라 화풍을 배우게 하려면

캐릭터 LoRA 와 반대 방향의 데이터셋을 짠다. 목표는 "누구든 이 화풍으로 그려라"이고, 특정 캐릭터가 토큰에 붙으면 실패다.

| | 캐릭터 LoRA | **스타일 LoRA** |
|---|---|---|
| 데이터 | 같은 캐릭터 10~20장 | **캐릭터마다 1장**, 40~100장 |
| 캡션 | 변하는 것만(포즈·표정) | **내용을 전부** — 태거로 자동(WD14) |
| 왜 | 정체성이 토큰에 붙어야 함 | 내용은 캡션이 설명하니 남는 차이(그리는 법)만 토큰에 붙음 |
| 반복 | 10~12 | 2~3 (장수가 많으니) |
| 스텝 | 1,500 | 2,000 |
| 생성 강도 | 0.8~1.0 | **0.5~0.8** (1.0 은 캐릭터 LoRA 를 밀어낸다) |

레퍼런스 게임의 추출 에셋을 쓸 때의 선: **화풍 참고는 되고, 캐릭터 재현은 안 된다.** 캐릭터마다 1장만 넣는 규칙이
기술적으로 그 선을 지킨다 — 어떤 캐릭터도 반복되지 않으니 생성물에 그 캐릭터가 나오지 않는다.
그래도 산출물은 팀이 검수한다(레퍼런스 캐릭터와 겹쳐 보이면 그 장은 버린다).

```bash
# 1) 캐릭터별 대표 1장씩 모은다(초상화·스탠딩 일러스트. 인게임 120px 스프라이트는 학습에 못 쓴다)
# 2) 태거로 캡션 → captions.json (위 "자동 캡션" 절)
# 3) 데이터셋: class 는 illustration, 장수 상한을 푼다
node lora-dataset.mjs refs/portraits --out style-ds --token ckstyle --class illustration --captions captions.json --max 100
# 4) 학습: 스텝 2000
node lora-train.mjs style-ds --name ckstyle_v1 --base sdxl --steps 2000
# 5) 캐릭터 LoRA 와 함께 쓴다 — sdxl-character-lora-style.api.json (LoraLoader 두 개 체인)
```

**실측(2026-09-03):** 초상화 70장(캐릭터 70종 × 1장, 512~1016px) × 2반복 × 15에폭 = 2,100스텝 → **51분, 1.5초/스텝.**
캐릭터 LoRA(1.0초/스텝)보다 느린 이유는 이미지가 크고 버킷이 여러 개라서다. 생성 결과는 SKILL.md 의 스타일 절.

### 캡션에서 지울 것과 남길 것 — v1 에서 실제로 틀린 것

v1 은 태거 결과에서 `cookie` 로 시작하는 태그를 전부 지웠다. 의도는 IP 이름 제거였는데, 결과는 **내용 제거**였다.
레퍼런스 캐릭터가 전부 쿠키(비스킷 피부·아이싱)인데 캡션이 그걸 말하지 않으니, 모델은 그 특징을 스타일 토큰에
넣었다. 에폭 10 이상 · 강도 1.0 에서 우리 소녀 캐릭터의 피부가 비스킷 색으로 바뀌었다.

태거도 믿지 마라 — 쿠키 70장 중 16장에만 `food` 류 태그를 붙였다. 사람처럼 생기면 사람으로 태깅한다.

| 지운다 | 남긴다 · 없으면 **추가한다** |
|---|---|
| 작품명·시리즈명·캐릭터 고유명(`cookie run`, `<캐릭터 이름>`) | 내용 태그(`1girl`, `blue eyes`, `holding sword`) |
| | **레퍼런스 전체가 공유하는 내용 특징** — 이게 핵심이다. 전부 쿠키면 모든 캡션에 `gingerbread cookie character, biscuit-colored skin, food` 를 적는다 |

원리: 캡션이 설명하는 것은 그 단어에 붙고, 설명 안 한 것은 토큰에 붙는다. 스타일 LoRA 는 "토큰에 그리는 법만 남기기"
게임이므로, **그리는 법 이외의 모든 공통점을 캡션에 써서 토큰에서 밀어내야 한다.** v2 는 이 규칙으로 다시 학습했다.

## 자주 하는 실수

| 증상 | 원인 | 조치 |
|---|---|---|
| 토큰을 넣어도 다른 캐릭터가 나온다 | 캡션에 정체성(머리색·옷)을 써서 그 단어에 학습됐다 | 캡션에서 정체성 단어를 빼고 다시 학습 |
| 포즈 프롬프트가 안 먹는다 | 과적합(에폭 과다) 또는 데이터셋이 정면 일색 | 이른 에폭 선택 / 포즈 다양성 보강 |
| 배경이 흰색으로 고정된다 | 학습 배경이 새어 나옴 | 강도 낮추기 / 배경색 두 종 이상으로 데이터셋 재구성 |
| loss 가 NaN | fp16 | bf16 확인(프리셋 기본). lr 5e-5 |
| `no kernel image is available` | PyTorch 가 cu128 미만 | venv 에 cu128 이상 torch 재설치 |
| 학습은 됐는데 ComfyUI 가 400 | lora_name 이 models/loras 에 없다 | `lora-train` 이 복사한 파일명을 그대로 쓴다 |
