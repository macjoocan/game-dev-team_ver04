# animagine-character-lora 워크플로 메모

`sdxl-character-lora` 와 같은 그래프(LoraLoader 노드 10)인데 체크포인트가 **Animagine XL 4.0** 이고 프롬프트가 **태그식**이다.
`lora-eval.mjs --workflow` 에 넘겨 Animagine 기준으로 에폭×강도 격자를 뽑을 때 쓴다.

- 6.text 는 `gdt_char, ` 로 시작한다 — `lora-eval` 이 이 접두어를 `--token` 으로 바꾼다. 나머지는 Danbooru 태그
- Animagine 에 자연어 프롬프트를 넣으면 추상 무늬가 나온다(8/21 실측). 태그를 지켜라
- 정체성 태그(white hair, red eyes 등)는 여기 넣지 않는다 — 격자는 **LoRA 가 혼자 정체성을 내는지** 재는 것이라, 프롬프트가 도와주면 측정이 오염된다.
  실제 생성(`sdxl-character-lora-style-hires`)에서는 넣어도 된다

API Format JSON 에 주석 키를 넣지 마라 — `_comment` 가 노드로 해석돼 500 이 난다.
