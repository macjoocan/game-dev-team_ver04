# Skill Observation Log

Observations captured during task-oriented work.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = skill updated/created | DECLINED (YYYY-MM-DD) = user decided not to pursue

---

## [OBS-20260914-001] correction

**Logged**: 2026-09-14T14:27:00+09:00
**Priority**: P1
**Status**: OPEN
**Area**: tooling

### What Happened
Blender MCP connection checks run inside the workspace sandbox reported `CONNECTION_CLOSED` because `uvx` could not access its user cache. The same registered command connected successfully outside the sandbox.

### Generalizable Insight
For user-scoped MCP servers launched through `uvx`, distinguish an MCP failure from a sandboxed cache-access failure. Re-run the client connection check with normal user permissions before changing a valid MCP configuration.

### Suggested Action
Add a troubleshooting note to the 3D asset pipeline: if `uvx` reports cache initialization or access errors only in a sandbox, verify once outside the sandbox and preserve the existing configuration when that succeeds.

### Evidence
- Source: tool-error
- Related Files: skills/asset-3d-pipeline/SKILL.md
- Tags: blender-mcp, uvx, sandbox, false-negative

---
