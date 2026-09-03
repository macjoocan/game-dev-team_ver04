# sdxl-character-lora 워크플로 메모

`sdxl-character.api.json` 에 **LoraLoader(노드 10)** 하나를 끼운 것이다. 체크포인트(4) → LoraLoader(10) →
KSampler(3)·CLIPTextEncode(6, 7) 로 배선이 바뀐다. 그 외는 같다(세로 832×1216, 단일 피사체 프롬프트).

- **10.lora_name**: `ComfyUI/models/loras/` 안의 **파일명**. 경로가 아니다. `lora-train.mjs` 가 학습을 끝내면
  거기로 복사해 준다. 없는 이름을 주면 `/prompt` 가 400 으로 거부한다
- **10.strength_model / strength_clip**: 보통 같은 값. 0.6~0.8 에서 시작한다. 1.0 은 과적합 에폭이면 포즈가 굳는다.
  **0 을 주면 LoRA 가 꺼진 것과 같다** — `lora-eval.mjs` 가 베이스라인 행을 이렇게 만든다
- **6.text 는 트리거 토큰으로 시작한다** (`gdt_char, ...`). 데이터셋을 만들 때 준 `--token` 과 같아야 한다.
  `lora-eval.mjs` 는 이 접두어를 `--token` 값으로 바꿔 넣는다
- 학습 때 `network_train_unet_only=true` 였으면 strength_clip 은 사실상 무의미하다(TE 가중치가 없다).
  그래도 같이 맞춰 두는 게 습관상 안전하다 — SD1.5 LoRA 는 TE 가중치가 있다

API Format JSON 에 주석 키를 넣지 마라 — `_comment` 가 노드로 해석돼 500 이 난다. 설명은 이 파일에 둔다.
