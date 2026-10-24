# Implementation ledger — plan: 2026-10-24-candidate-harness.md

- Base: 712e3f3. User approved the design and requested execution.
- Pre-flight: Task 1 exports loadContract/digest/normalize used by Task 2; examples and documentation use CLI from Task 2. Shared schema keys must match.
- Ruling: use isolated .claude/worktrees/candidate-harness, implement inline, fresh final reviewer; user authorization covers reversible local implementation. No remote push.
- Baseline: validate-plugin passed (6 agents, 25 skills, 4 hooks, 1 command).
- Task 1: complete — contract/adapter tests RED (missing modules) -> GREEN. Actual balance-sim winRate.p output supported; fixed targets checked.
- Task 2: complete — execution/evidence/resume/record implemented. 22 tests green; executable-pinning test added and individually green, final suite running.
- Final: fixed abandoned-run report selection — regression RED→GREEN.
- Final: fixed stale-lock recovery race — automatic lock stealing removed, regression RED→GREEN. After hard kill, operator verifies owner before removing lock; no automatic recovery claim.
- Final: executable resolved path/binary and lib-stats fingerprints included; direct mutation guard test green.
- Ruling: candidate cwd must be an isolated snapshot under the declared project root; outputs live outside it. Existing engine builds must redirect generated outputs to the run directory. Cost: one explicit snapshot/output setup per candidate.
- Ruling: detached descendants outside the spawned tree/session are not guaranteed to be cleaned up. Local trusted test commands only; external side-effect retries remain manual.
- Task 3: docs/examples/mirror 0.48.0 complete; full CI 18/18 green on Windows/Git Bash, final focused suite 23/23 green. Not a remote Linux CI run. Local installation pending.
- Final integration ruling: perform the approved reversible local application (main ff and official installation) after scoped commit. No remote push or publication.
