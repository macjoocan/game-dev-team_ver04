---
name: asset-pipeline
description: >
  에셋을 일회성 목업이 아니라 양산 가능한 상태로 관리한다. 요청 접수·폴더 구조(_source/raw/final)·
  manifest(안정 ID·승인 상태·출처/라이선스)·엔진 반영 핸드오프를 다룬다.
  "에셋 정리해줘", "manifest 만들어줘", "에셋 승인 상태", "이 아트 출처가 뭐야", "엔진에 반영해줘"
  같은 요청에 사용. 소유: artist.
  주의: 승인(approved) 이전 에셋은 프로덕션 씬·프리팹·빌드에 쓰지 않는다.
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

## 이 레포에서의 위치
- **소유**: artist. `art-direction`으로 기준이 선 뒤에 돈다.
- manifest의 `status`가 **게이트**다. `approved` 미만인 에셋이 빌드에 들어가면 QA에서 잡는다.
- 출처·라이선스를 기록하지 않은 에셋은 반입하지 않는다 — 나중에 추적이 불가능해진다.
