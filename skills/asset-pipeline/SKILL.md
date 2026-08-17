---
name: asset-pipeline
description: Use when game assets need request intake, prompt/reference tracking, source/raw/final folder structure, manifests, approval states, licensing notes, or engine import handoff.
---

# Asset Pipeline

Use this when art stops being a one-off mockup and needs to survive production.

## Folder Convention
Prefer this structure inside the target game repo:

```text
Assets/
  Art/
    _source/
    raw/
    final/
    previews/
    manifest/
```

For web games, use the closest equivalent such as `public/assets/art/`.

## Asset Manifest
Maintain an asset manifest with stable IDs:

```json
{
  "id": "ui.button.primary",
  "type": "ui",
  "status": "approved",
  "owner": "artist",
  "source": "original",
  "license": "project-owned",
  "files": {
    "source": "Assets/Art/_source/ui/button-primary.psd",
    "final": "Assets/Art/final/ui/button-primary.png"
  },
  "constraints": {
    "size": "256x64",
    "pivot": "center",
    "background": "transparent"
  }
}
```

## Status Flow
`requested` -> `concept` -> `approved` -> `production` -> `imported` -> `verified`.

Only `approved` or later assets should be used in production scenes, prefabs, UI, or builds.

## Handoff Checklist
- Stable asset ID and filename.
- Purpose and in-game location.
- Source/reference notes and license.
- Export size, scale, pivot/anchor, transparency.
- Engine import path and compression/settings notes.
- Preview image or contact sheet.

## Common Mistakes
| Mistake | Fix |
|---|---|
| Replacing files breaks code paths | Use stable IDs and preserve final paths. |
| Source art gets lost | Keep `_source/` separate from final exports. |
| Unapproved art ships | Gate production use on manifest status. |
| Unknown license/source | Record source before import. |

