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

### Observation 1: Check service access and visibility before a generation pilot

**Status:** OPEN
**Date:** 2026-10-16
**Session context:** Comparing a local motion asset workflow with hosted art tools
**Skill:** char-art-system
**Type:** open-source
**Phase/Area:** External backend comparison

**Issue:** A new sprite feature was web-only even though the vendor offered APIs elsewhere. A second service exposed free-tier generations publicly, and its trial balance could not cover both planned actions. These conditions affect whether a same-reference pilot is feasible before model quality is considered.

**Suggested improvement:** Before uploading or generating, record feature-specific API availability, account access, output visibility, reference import support, and the displayed cost of the full comparison matrix. Preserve a common hashed reference and existing baseline while access is being resolved.

**Principle:** Validate the actual feature, account and output-sharing conditions before treating a hosted generator as a comparable production backend.

### Observation 2: Static sequences can pass sprite consistency QA

**Status:** OPEN
**Date:** 2026-10-16
**Session context:** A same-reference motion generation comparison
**Skill:** sprite-pipeline
**Type:** open-source
**Phase/Area:** Motion validation versus structural consistency

**Issue:** A downloaded walk sequence passed the existing sprite consistency checker with exit 0, while the user immediately noticed that there was no walking motion. A contact sheet confirmed almost fixed leg poses, and lower-body silhouette IoU to the first frame stayed above 0.99. File and canvas consistency did not establish action completion.

**Suggested improvement:** Keep structural QA and motion-success evidence separate. A walk pilot should show planted support, alternating feet, knee articulation and weight transfer. Low temporal change can flag human inspection, but a universal movement threshold should not reject deliberately subtle idle animation.

**Principle:** Consistency measures can reward a static failure; validate whether the requested action actually occurs before accepting a generated animation.

**Reference file:** samples/art-comparison-2026-10-16/README.md

### Observation 3: Loop quality needs boundary inspection even when motion exists

**Status:** OPEN
**Date:** 2026-10-16
**Session context:** Repairing a hosted sprite walk cycle after human feedback
**Skill:** sprite-pipeline
**Type:** open-source
**Phase/Area:** Loop boundary validation

**Issue:** A recognizable walk passed structural QA yet the user noticed an abrupt reset. A vendor loop-repair pass reduced boundary change while re-rendering details. Frame consistency, action completion and seamless repetition are distinct checks.

**Suggested improvement:** Keep the original and repaired outputs, compare their last-to-first frames at a common playback period, and report boundary change relative to internal changes as a diagnostic rather than a universal gate. Preserve service timing assumptions, export scaling, watermarks and quoted versus settled credit observations.

**Principle:** Validate the transition back to the first frame, and do not trade identity preservation for a smaller seam metric without human review.
