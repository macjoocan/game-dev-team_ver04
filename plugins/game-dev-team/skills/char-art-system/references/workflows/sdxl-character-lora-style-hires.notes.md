# sdxl-character-lora-style-hires 워크플로 메모

`sdxl-character-lora-style`(캐릭터 LoRA + 스타일 LoRA 체인)에 **hires 2패스**를 붙인 것. 노드 번호가 다르다:
LoRA 는 **20(캐릭터) → 21(스타일)**, 10 은 LatentUpscale, 11 은 2패스 KSampler.

- **4.ckpt_name** 을 `--set` 으로 바꿔 체크포인트를 고른다. `animagine-xl-4.0.safetensors` 같은 태그 학습 모델을 쓰면
  **6.text 를 태그식**으로 다시 써야 한다(`masterpiece, best quality, 1girl, solo, chibi, ...`). 자연어 프롬프트는 추상 무늬가 나온다(8/21 실측)
- SDXL Base 로 학습한 LoRA 는 같은 구조라 Animagine 에도 **얹힌다**. 강도는 다시 잡아야 한다(보통 0.1~0.2 낮게)
- **20 / 21 강도 합은 1.5 이하.** hires 2패스(11)는 두 LoRA 를 그대로 물고 있어 과하면 2패스에서 더 무너진다
- 10: 1248×1824 는 8GB 에서 SDXL 2패스 상한 근처. OOM 이면 1040×1520 으로
- 11.denoise 0.42 — 구도 유지 + 디테일 재생성의 실측 균형점

API Format JSON 에 주석 키를 넣지 마라 — `_comment` 가 노드로 해석돼 500 이 난다.
