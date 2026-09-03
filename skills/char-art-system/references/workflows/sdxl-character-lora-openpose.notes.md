# sdxl-character-lora-openpose 워크플로 메모

`sdxl-character-lora` 에 **ControlNet OpenPose** 를 얹은 것이다. 정체성은 LoRA(노드 10)가, 포즈는 ControlNet(11~13)이 맡는다.
모션 스프라이트(프레임별 다른 포즈)를 생성으로 시도할 때 쓰는 조합이다.

- **11.control_net_name**: `ComfyUI/models/controlnet/openpose-sdxl.safetensors`. SDXL 용이어야 한다(SD1.5 용을 넣으면 KSampler 가 차원 오류)
- **12.image**: `ComfyUI/input/` 안의 **스켈레톤 이미지 파일명**. `pose-skeleton.mjs <idle|walk|attack|cheer|all> --out <ComfyUI>/input` 으로 만든다.
  사진에서 뽑는 전처리 노드는 필요 없다 — 게임 캐릭터 포즈는 우리가 정하니 좌표를 직접 찍는 게 정확하다
- **13.strength / end_percent**: 0.8 / 0.8 에서 시작. strength 를 1.0 으로 올리면 포즈는 정확해지지만 LoRA 정체성이 밀린다.
  end_percent 를 0.6 정도로 낮추면 후반 스텝은 ControlNet 없이 그려 디테일이 산다
- **5**: 832×1248 — 스켈레톤(1024×1536)과 같은 비율이어야 한다. 비율이 다르면 스켈레톤이 늘어나 포즈가 왜곡된다
- **6.text**: 트리거 토큰으로 시작. **`chibi` 를 넣지 않았다.** 실측(2026-08-21)에서 치비 지시가 인체 비율을 이겨 포즈가 안 먹었다.
  치비 비율은 LoRA 가 학습했으니 프롬프트로 다시 말할 필요가 없다

이전 실측(LoRA 없이, 2026-08-21): OpenPose 만으로는 포즈는 먹지만 정체성(실루엣 IoU)이 0.50~0.67 로 깨졌다.
이 워크플로의 목적은 **LoRA 가 그 정체성 손실을 얼마나 메우는가**를 재는 것이다.

API Format JSON 에 주석 키를 넣지 마라 — `_comment` 가 노드로 해석돼 500 이 난다.
