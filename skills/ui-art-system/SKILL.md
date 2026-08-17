---
name: ui-art-system
description: Use when designing game HUD, menus, buttons, cards, rarity frames, icons, status effects, damage numbers, inventory UI, or scalable UI art components.
---

# UI Art System

Use this when UI needs to feel like part of the game, not a separate overlay.

## Required Components
Define only the components the game actually uses:
- Buttons: default, hover/focus, pressed, disabled.
- Panels/cards: normal, selected, locked, reward, warning.
- HUD: health, resource, timer, score, wave, objective.
- Icons: item, skill, status, currency, navigation.
- Feedback: damage numbers, heal numbers, crit, miss, blocked.
- Rarity/status frames: common through highest rarity, debuff/buff.

## Rules
- Tie UI colors to `VISUAL_DESIGN.md`.
- Reserve one accent for primary action and one for danger.
- Icons must read at smallest in-game size.
- Text must fit in Korean and English where both are expected.
- Keep hit targets and safe areas suitable for the target platform.

## Output
- UI component list with states.
- Export specs for each component.
- Preview sheet showing components on light/dark/gameplay backgrounds.
- Notes for implementation: nine-slice, anchors, responsive behavior, animation hints.

## Common Mistakes
| Mistake | Fix |
|---|---|
| Decorative UI hurts speed | Prioritize scan order and touch targets. |
| Rarity colors conflict with gameplay danger | Keep danger separate from rarity. |
| Icons need labels everywhere | Redesign silhouette at small size. |
| Cards/panels drift in style | Use shared borders, corners, shadows, and accents. |

