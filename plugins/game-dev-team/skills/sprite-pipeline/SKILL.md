---
name: sprite-pipeline
description: Use when making or importing 2D sprites, character sheets, animation strips, tiles, icons, frame normalization, alpha cleanup, pivots, contact sheets, or engine-ready atlases.
---

# Sprite Pipeline

Use this for 2D game sprites that must animate cleanly and stay consistent across frames.

## Core Rule
Approve one seed frame first. Then produce strips/sheets from that seed so identity, palette, outfit, silhouette, and facing do not drift.

## Required Specs
- Gameplay size and camera distance.
- Frame size and frame count.
- Facing directions and actions.
- Pivot/anchor, usually bottom-center for characters.
- Background: transparent unless the engine requires another key.
- Naming: `<entity>_<action>_<direction>_<frame>.png`.

## Process
1. Create or select an approved seed pose.
2. Generate the full action as a strip or sheet, not unrelated single frames.
3. Normalize every frame to the same canvas size.
4. Align feet/baseline and pivot across frames.
5. Clean alpha edges and remove stray pixels.
6. Export a preview contact sheet or GIF.
7. Import using the manifest ID and verify in-engine at gameplay scale.

## Sprite QA
- Same character identity, palette, costume, and silhouette.
- No frame crops or shifting baselines.
- Transparent background is clean.
- Motion reads at 100%, 75%, and 50% scale.
- Attack/hit/idle frames match gameplay timing.

## Common Mistakes
| Mistake | Fix |
|---|---|
| Frame-by-frame identity drift | Use a seed frame and whole-strip generation. |
| Character jitters while animating | Normalize canvas and baseline. |
| Art looks good in preview but bad in game | Verify at real camera zoom. |
| Atlas import loses meaning | Keep manifest IDs and frame layout notes. |

