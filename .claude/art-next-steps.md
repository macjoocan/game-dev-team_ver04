# 아트 트랙 다음 단계 (2026-09-18 조사 정리)

**목표는 [art-goals.md](art-goals.md) 에 있다 — 어디로 가는가.** 이 문서는 **다음에 뭘 하는가**다.
순위가 헷갈리면 목표 문서로 돌아가 판단한다.

토큰 예산이 떨어져 실행은 다음 세션으로 미룬다. 이 문서가 재개 지점이다.
미러(`plugins/game-dev-team/`)에 안 들어간다 — 플러그인 사용자용이 아니라 **우리 작업 계획**이다.

---

## 0. 전제 — 이 프로젝트에 아티스트가 없다

사람(2026-09-18): *"내가 아트가 아니라 키를 줘도 못함."*

**이게 모든 순위를 결정한다.** 마지막이 "손으로 다듬어라"로 끝나는 해법은
아무리 좋아도 **여기선 해법이 아니다.** 조사 결과를 이 기준으로 다시 줄 세웠다.

역할 분담:

| | 누가 | 근거 |
|---|---|---|
| 그리기 | 모델 (코드·MCP) | `walk-composite` 가 이미 증명 — 생성 모델 3경로가 막혔을 때 답은 정지 한 장 + 기하 변형 코드였다 |
| 판정 | 도구 | `pixel-contract` · `cast-distinct` · `sprite-qa` · `art-gate` |
| 최종 승인 | 사람 | 눈으로 본다. 실제로 게이트 오판정을 잡아냈다(2026-09-14, 멀쩡한 프레임 15/16 기각) |

사람에게 필요한 건 **그리는 능력이 아니라 보는 능력**이고, 그건 이미 확인됐다.
출구는 항상 **엔진에 바로 들어가는 시트 + manifest** 다(프레임 수·fps·피벗·9-slice).
manifest 값이 비면 그 판단이 사람에게 넘어간다 — v0.31.0 의 9-slice 수정이 그 축이었다.

---

## 1. 순위

| | 할 것 | 손 작업 | 비용 | 확실성 |
|---|---|---|---|---|
| **1** | Aseprite MCP 실물 왕복 (열기 → 팔레트 강제 → 내보내기) | 없음 | 0 | 높음 |
| **2** | 캐스트 전체 팔레트 통일 → `pixel-contract` 판정 | 없음 | 0 | 높음 |
| **3** | `comfy-run.mjs` 프롬프트 기록 | 없음 | 0 | 확정 |
| **4** | PixelLab 평가 | 없음 | 유료 | 중간 |
| **5** | Qwen-Image-Edit 리스타일 (적 1종) → `cast-distinct` | 없음 | 중 | 중간 |
| **보류** | SpriteToMesh | **뼈대·키프레임을 사람이** | 중 | 낮음 |

---

## 2. Aseprite MCP — 이미 붙어 있고 안 쓰고 있었다 (1순위)

이 세션에 Aseprite MCP 도구가 **100개 넘게** 올라와 있다. 호출해서 살아 있는 것을 확인했다
(`list_palette_presets` → pico8 · dawnbringer32 등 8종 응답).

그런데 우리 문서는 Aseprite 를 **"여기부터는 사람이 손으로"** 라는 뜻으로만 쓴다:

```
skills/char-art-system/SKILL.md:333   얼굴(48px에서 6x6), 소품 정리, 면 단순화는 Aseprite 로 손본다.
skills/char-art-system/SKILL.md:352   밝은 코어만 지워지고 테두리가 남아... Aseprite 로 손봐야 한다.
skills/char-art-system/references/comfyui-setup.md:84   팔레트 양자화는 Aseprite에서 후처리
```

**막다른 길이라고 적어둔 자리마다 도구가 이미 있었다.** 열린 문제 매핑:

| 열린 문제 | 쓸 도구 |
|---|---|
| 화풍 통일 | `quantize_to_palette` · `remap_colors_in_cel_range` · `adjust_hsl` |
| 공격 모션 | `tween_cel_positions_eased` · `oscillate_cel_positions` · `propagate_cels` |
| 4방향 시트 방패 깜빡임 | `erase_region` · `copy_cel` · `propagate_frame_to_range` |
| 48px 얼굴 | `draw_pixels_at` · `draw_line_at` — 손 작업이 스크립트로 |
| 판정 | `audit_animation` · `compare_frames` · `validate_scene` — 종료 코드 계약에 붙는다 |
| 출구 | `export_spritesheet` · `create_slice` / `set_slice_center` (9-slice) |

**아직 확인 안 된 것:** 응답하는 것만 봤다. **우리 실제 스프라이트를 열어 편집하는 왕복은 안 해봤다.**
다음 세션 첫 작업이 그것 — Hex 것은 다른 세션 소관이라 `samples/` 로 복사해서 돌린다.

---

## 3. 나머지 항목

### PixelLab (4순위, 유료) — https://www.pixellab.ai/
스켈레톤 기반 애니메이션 · 텍스트로 모션 생성 · **4·8방향 시트 원클릭** · 레퍼런스 스타일 매칭 ·
인페인팅 · API · Aseprite 플러그인. **"아티스트 없이"가 설계 전제인 제품**이라 0번 전제와 맞는다.
유료가 대가지만 아티스트 인건비와 비교할 일이다. 1~3번 해보고 남는 구멍에 대볼 것.

### Qwen-Image-Edit-2511 (5순위)
2025-12-26 공개. 단일 레퍼런스에서 다각도 생성 + 포즈·스타일 변환 중 얼굴 정체성 보존.
[Consistent Character Creator 3.8](https://www.runcomfy.com/comfyui-workflows/consistent-character-creator-3-8-in-comfyui-hyperrealistic-consistent-ai-characters)
이 한 장에서 5포즈 턴어라운드를 뽑는다.

용도는 **두꺼운 3D 렌더 5종을 평면 셀셰이딩 lunger 에 맞춰 리스타일**. 턴어라운드는 애니메이션
프레임보다 허용 오차가 넓어서 "확산 모델은 프레임 정체성을 못 잡는다"(B-15)와 충돌하지 않는다.
판정은 `cast-distinct` 로 한다.

### SpriteToMesh (보류)
[arXiv 2602.21153](https://arxiv.org/abs/2602.21153) (2026-02) ·
[github.com/BastienGimbert/SpriteToMesh](https://github.com/BastienGimbert/SpriteToMesh)
스프라이트 → Spine2D 삼각 메시 자동 생성. 3초 미만/장, 분할 IoU 0.87, 10만 장(172개 게임) 학습.

메시 변형은 **없는 픽셀을 만들지 않고 무릎을 굽힌다** — `walk-composite` 가 못 하는 게 그거였다.
그런데 **보류한다:**
- **메시만** 만든다. 뼈대 배치와 키프레임은 사람 몫 → 0번 전제 위반
- 논문 스스로 정점 배치 신경망이 수렴 실패(loss 0.061)했다고 적었다. 정점 배치는 예술이라 알고리즘으로 갔다
- **도트에 안 맞을 공산이 크다.** 메시 변형은 픽셀을 뭉갠다 = 반투명 생성 = 도트 계약 위반
  (레퍼런스 300장 실측: 91% 가 반투명 0%). 쓴다면 **도트 변환 전 고해상 트랙**에서만

### 프롬프트 랜덤화 — 이미 있는 노드다
[comfyui-dynamicprompts](https://github.com/adieyal/comfyui-dynamicprompts) ·
[ComfyUI-stable-wildcards](https://www.runcomfy.com/comfyui-nodes/ComfyUI-stable-wildcards)(시드 고정 와일드카드 = 재현성).
2026-09-17 에 본 arca 글은 이걸 손으로 다시 만든 쪽에 가깝다.
우리 `comfy-run.mjs` 는 헤드리스 API 라 커스텀 노드보다 Node 쪽 구현이 싸다.

---

## 4. 코드에서 찾은 구멍 — `comfy-run.mjs`

1. **배치가 시드만 바꾼다.** 프롬프트는 배치 내내 고정이다.
2. **조합된 프롬프트가 안 남는다.** `run-log.json` 에는 시드 · `prompt_id` · 파일명뿐.

스크립트 마지막 줄이 스스로 인정하고 있다:

> `run-log.json 에 시드·prompt_id·파일명이 있다. manifest 에 옮겨 적어야 재현된다.`

손으로 옮기라는 건 안 옮겨진다는 뜻이다. 시안 20장에서 3번을 골랐는데 3번의 프롬프트를 모르면 거기서 끝난다.
②만으로도 값어치가 있다 — 지금도 `--set` 으로 프롬프트를 바꿔 돌리면 기록이 안 남는다.

---

## 5. 조사에서 **새로 얻은 게 없었던** 축 (= 이미 맞게 하고 있다)

정직하게 적는다. 검색 결과 상당수가 새 방법이 아니라 **우리 방식의 확인**이었다.

- 팔레트를 정본 파일로 잠그고 이탈을 자동 검출 → 우리 `art/palette.json` + `art-gate.json` + `pixel-contract`
- **"AI 는 양(변형·타일·플레이스홀더), 히어로 에셋은 손"** → 48px 얼굴은 손이라던 결론과 같다
  ([FreeGameSprites](https://freegamesprites.com/en/news/ai-pixel-art-generation-2026-tools-and-workflows))
- Retro Diffusion 이 격자 정렬·팔레트 제한 출력으로 후처리 없이 쓸 수 있는 유일한 축 → 우리 채택과 같다

**새 걸 많이 못 찾은 게 아니라 이미 맞는 길에 있었다는 뜻이다.** 빈 곳은 2~4절이다.
다만 하나 못 가진 레버가 있다 — **LUT 후처리**로 따로 만든 에셋의 채도·색조·대비를 정규화하는 것
([참고](https://dev.to/vicero/how-to-enforce-a-consistent-pixel-art-palette-4alo)). Aseprite `adjust_hsl` 로 근사 가능.

---

## 6. 다음 세션 첫 3분

1. 이 문서와 `REVIEW.md` 열린 항목을 읽는다
2. `review-loop.mjs summary --project .` — 검수 대기 4건(ui.hex-kit@1 · fx.hex-set@1 · codex 2건)
3. 1순위부터: `samples/` 에 스프라이트 한 장 복사 → Aseprite MCP 왕복 → 되면 캐스트 전체
