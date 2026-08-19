---
name: asset-3d-pipeline
description: >
  3D 에셋을 엔진에 깨끗하게 안착시킨다. 스케일·피벗·머티리얼 명명·콜리전 프록시·LOD·
  glTF/GLB/FBX 익스포트를 다룬다. Blender MCP가 붙어 있으면 그것으로 작업한다.
  "3D 모델 만들어줘", "Blender로 작업", "GLB 내보내줘", "LOD", "콜리전 프록시", "텍스처 예산"
  같은 요청에 사용. 소유: artist + developer.
---

# 3D Asset Pipeline

Use this for 3D game assets that need to land cleanly in an engine.

## Required Specs
- Engine and unit scale.
- Camera distance and target platform.
- Poly/triangle budget and texture size.
- Pivot/origin and forward/up axis.
- Collision needs and LOD count.
- Export format: prefer GLB/glTF unless the project requires FBX.

## Blender MCP Use
If Blender MCP is connected, use it for modeling, material setup, rigging/animation checks, exports, and validation screenshots. If it is not connected, produce a handoff brief with exact Blender actions and import settings.

## Export Checklist
- Origin/pivot set for gameplay use.
- Scale matches engine units.
- Materials named predictably.
- Textures packed or paths documented.
- Collision proxy included or specified.
- LODs named consistently.
- Animation clips named and trimmed.
- In-engine screenshot confirms scale and lighting.

## Common Mistakes
| Mistake | Fix |
|---|---|
| Beautiful model imports at wrong scale | Lock unit scale before export. |
| Pivot makes placement painful | Set origin from gameplay use, not modeling convenience. |
| Materials break on import | Use simple named materials and documented texture paths. |
| Collision is forgotten | Add proxy or explicit collision note before handoff. |

## 이 레포에서의 위치
- **소유**: artist(방향) + developer(엔진 반영).
- 산출물은 `asset-pipeline`의 manifest에 ID로 등록한다.
- Blender MCP가 없으면 **정확한 Blender 조작과 임포트 설정을 담은 핸드오프 문서**를 남긴다.
  "할 수 없다"로 끝내지 않는다.
