---
name: art-direction
description: >
  게임의 비주얼 방향(아트 스타일·팔레트·실루엣 규칙·UI 톤·카메라/가독성)을 정하고
  `VISUAL_DESIGN.md`로 고정한다. 개별 에셋을 만들기 시작하기 전에 먼저 한다.
  "아트 방향 잡자", "비주얼 컨셉", "톤 정해줘", "팔레트 정리", "VISUAL_DESIGN 만들어줘"
  같은 요청에 사용. 소유: artist.
  주의: 방향을 정하는 단계다. 실제 제작은 sprite-pipeline·ui-art-system·asset-3d-pipeline 소관.
---

# Art Direction

Use this before creating or importing game art. The goal is to make the game recognizable, readable, and consistent before individual assets multiply.

## Inputs
- Game fantasy, genre, target platform, camera, engine, and audience.
- Existing screenshots, references, brand colors, UI samples, or forbidden styles.
- Constraints: resolution, sprite size, poly budget, readability distance, file formats.

## Output
Create or update `VISUAL_DESIGN.md` with:
- Visual pillars: 3 short rules that all assets must obey.
- Palette: primary, accent, danger, neutral, background, disabled.
- Shape language: player, enemy, interactable, hazard, reward.
- Camera/readability: silhouette size, contrast, outline, lighting, zoom target.
- UI tone: buttons, panels, icons, typography feel, rarity/status styling.
- Asset rules: naming, pivots/anchors, transparent backgrounds, export formats.
- Forbidden list: styles, colors, motifs, or IP-adjacent looks to avoid.

## Process
1. If purpose, size, camera, or tone is missing, ask before making assets.
2. Produce 2-3 directions only when the project has no approved direction.
3. Recommend one direction with a one-line reason tied to gameplay readability.
4. After approval, freeze the rules in `VISUAL_DESIGN.md`.

## Common Mistakes
| Mistake | Fix |
|---|---|
| Pretty but unreadable assets | Check silhouette at gameplay size. |
| Every asset uses a different palette | Lock palette and allowed exceptions. |
| UI looks separate from gameplay | Share accent colors, shape rules, and feedback language. |
| Style imitates an existing IP | Convert reference into original constraints, not copied details. |

## 이 레포에서의 위치
- **소유**: artist. 파이프라인 ⑦ 아트 단계의 **입구** — 여기서 기준을 안 잡으면 뒤의 5개 스킬이 전부 흔들린다.
- `VISUAL_DESIGN.md`는 아트의 정본이다. 이후 모든 아트 스킬이 이 문서를 참조한다.
- 게임성(④)·경제(⑨) 검증과 무관한 축이다. 아트 방향이 재미를 판정하지 않는다.
