---
name: art-direction
description: Use when a game needs visual direction, art style decisions, mood boards, palette/silhouette rules, UI tone, camera/material guidance, or a VISUAL_DESIGN.md before producing assets.
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

