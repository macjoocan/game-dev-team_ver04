---
name: visual-qa
description: >
  아트를 프로덕션에 받아들이기 전 시각적으로 검수한다. 가독성·일관성·알파 아티팩트·
  스프라이트 정렬·UI 겹침·모바일 세이프에어리어·타일 이음새·대비를 본다.
  "아트 검수해줘", "시각 QA", "가독성 확인", "UI 겹치는지 봐줘", "모바일에서 보이나", "알파 깨짐"
  같은 요청에 사용. 소유: artist + qa.
  주의: 코드 정확성(qa)·게임 느낌(polish)과는 다른 축이다. 여기선 **보이는 것**만 판정한다.
---

# Visual QA

Use this before accepting art into production or before calling a visual pass complete.

## Review Lenses
| Lens | Check |
|---|---|
| Readability | Silhouette, contrast, target size, important action visible. |
| Consistency | Palette, material, line weight, camera angle, UI tone. |
| Technical | Alpha cleanup, crop, pivot, compression, atlas layout, naming. |
| Animation | Baseline, timing, hit frame, anticipation, recovery, jitter. |
| UI | Text fit, safe areas, overlap, focus/hover/disabled states. |
| Accessibility | Color-only cues, contrast, motion intensity, small text. |

## Evidence
Prefer screenshots or preview sheets at:
- Gameplay scale.
- Mobile or smallest target viewport.
- Busy combat/state with UI visible.
- Light/dark or map backgrounds if applicable.

## Pass/Fail
Pass only when issues are either fixed or explicitly accepted by the human owner. Log unresolved items with asset ID, screenshot, severity, and owner.

## Common Mistakes
| Mistake | Fix |
|---|---|
| Reviewing only isolated assets | Review in real gameplay context. |
| Ignoring Korean text length | Test representative localized strings. |
| Accepting tiny alpha defects | Check on contrasting backgrounds. |
| Calling visual polish complete without evidence | Attach screenshots/contact sheets. |

## 이 레포에서의 위치
- **소유**: artist + qa. 파이프라인 ⑦ 아트 단계의 **출구 게이트**.
- 검증 축이 셋 다 다르다: **정확성**(qa) · **재미**(balance-sim) · **보이는 것**(이 스킬).
  겹치지 않으므로 서로를 대신하지 못한다.

### 증거 규칙 (ORCHESTRATION.md §5)
"시각 폴리싱 완료"는 **증거 없이 말하지 않는다.** 스크린샷 없이 통과시키면 그건 판정이 아니라 인상이다.
- 실제 게임 화면 · 가장 작은 목표 해상도 · UI가 다 떠 있는 바쁜 전투 화면에서 각각 남긴다.
- 미해결 항목은 **에셋 ID · 스크린샷 · 심각도 · 담당**을 붙여 기록한다.
- 스크린샷을 못 만들었으면 판정은 통과가 아니라 **측정 불가**다.
