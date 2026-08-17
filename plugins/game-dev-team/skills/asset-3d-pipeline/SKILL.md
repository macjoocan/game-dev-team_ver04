---
name: asset-3d-pipeline
description: Use when producing or importing 3D game assets, Blender MCP work, glTF/GLB/FBX export, pivots, scale, collision proxies, LODs, texture budgets, materials, or in-engine validation.
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

