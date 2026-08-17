---
name: visual-qa
description: Use when reviewing game visuals for readability, consistency, alpha artifacts, sprite alignment, UI overlap, mobile safe areas, tile seams, contrast, or final art acceptance.
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

