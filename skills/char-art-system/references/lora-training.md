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

> **아직 실측 안 됨(2026-09-03 기준):** 이 PC 에서 sd-scripts 설치와 학습 완주는 아직 안 했다. 위 순서는 kohya 공식
> README + Blackwell 에서 ComfyUI 를 띄울 때 확인한 PyTorch 규칙을 합친 것이다. 첫 학습을 완주하면 이 절을
> 실측값으로 바꿔라(소요 시간·VRAM 피크·막힌 곳).

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

예상 시간(미실측): SDXL 1500스텝 · 8GB · fp8 · grad ckpt 기준 **1~2시간**. SD1.5 는 1/3 수준.

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

## 자주 하는 실수

| 증상 | 원인 | 조치 |
|---|---|---|
| 토큰을 넣어도 다른 캐릭터가 나온다 | 캡션에 정체성(머리색·옷)을 써서 그 단어에 학습됐다 | 캡션에서 정체성 단어를 빼고 다시 학습 |
| 포즈 프롬프트가 안 먹는다 | 과적합(에폭 과다) 또는 데이터셋이 정면 일색 | 이른 에폭 선택 / 포즈 다양성 보강 |
| 배경이 흰색으로 고정된다 | 학습 배경이 새어 나옴 | 강도 낮추기 / 배경색 두 종 이상으로 데이터셋 재구성 |
| loss 가 NaN | fp16 | bf16 확인(프리셋 기본). lr 5e-5 |
| `no kernel image is available` | PyTorch 가 cu128 미만 | venv 에 cu128 이상 torch 재설치 |
| 학습은 됐는데 ComfyUI 가 400 | lora_name 이 models/loras 에 없다 | `lora-train` 이 복사한 파일명을 그대로 쓴다 |
