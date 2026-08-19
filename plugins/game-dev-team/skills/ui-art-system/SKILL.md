---
name: ui-art-system
description: >
  HUD·버튼·카드·아이콘·희귀도 프레임·데미지 숫자 같은 UI 아트를 상태별 변형까지 포함해 설계한다.
  "UI 아트", "HUD 만들어줘", "버튼 상태", "아이콘 세트", "카드 프레임", "희귀도 표현"
  같은 요청에 사용. 소유: artist + developer.
  주의: 색은 `VISUAL_DESIGN.md`에 묶는다. 한국어·영어 텍스트가 모두 들어가는지 확인한다.
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

## 이 레포에서의 위치
- **소유**: artist(디자인) + developer(구현).
- 색·톤은 `art-direction`의 `VISUAL_DESIGN.md`에 묶인다. 여기서 새 팔레트를 만들지 않는다.
- UI **전환 애니메이션·입력 피드백**은 `polish` 소관이다. 여기선 정적 컴포넌트와 상태 변형까지.
