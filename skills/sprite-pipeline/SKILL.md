---
name: sprite-pipeline
description: >
  2D 스프라이트를 프레임 간 일관성이 유지되게 만든다. seed 프레임 승인 → 시트/스트립 생성 →
  캔버스 크기·피벗·baseline 통일 → 알파 정리 → 아틀라스/엔진 반영.
  "스프라이트 만들어줘", "캐릭터 시트", "애니메이션 스트립", "아틀라스", "피벗 맞춰줘",
  "프레임 정규화" 같은 요청에 사용. 소유: artist + developer.
  주의: 개별 프레임을 따로 뽑지 않는다 — 프레임마다 캐릭터 정체성이 흔들린다.
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

## 이 레포에서의 위치
- **소유**: artist(방향) + developer(엔진 반영).
- `art-direction` 승인 → seed 프레임 승인 → 시트 생성 순서를 건너뛰지 않는다.
- 산출물은 `asset-pipeline`의 manifest에 ID로 등록한다.
- 애니메이션 **타이밍·타격감**은 이 스킬이 아니라 `polish` 소관이다. 여기선 프레임 정합만 본다.
