# GameDevTeam — 플러그인 개발 워크스페이스 (CLAUDE.md)

game-dev-team 플러그인(게임 개발 역할 에이전트 팀 + 사람 승인 게이트 파이프라인)의 개발 레포.
**현재 작업은 Claude Code 중점.** `AGENTS.md`는 Codex 세션용 규칙으로 병행 유지한다.

## 정본/미러 규칙 (가장 중요)
- **레포 루트가 정본**: `agents/`, `skills/`, 문서(*.md), `.claude-plugin/`, `.codex-plugin/`.
- `plugins/game-dev-team/`은 Codex 로컬 마켓플레이스용 **미러 — 직접 수정 금지.**
- 루트 수정 후 `scripts/sync-plugin.ps1` 실행으로 미러 재생성. 드리프트 검사는 `-Check`.
- **기능 추가/수정 후 `node scripts/validate-plugin.mjs` 실행** — 스킬·에이전트·훅·매니페스트·미러의
  참조 무결성을 기계 검사한다(맞는지 틀린지 판단하는 하네스). 커밋 훅과 CI(validate.yml)에서도 자동 실행.
- 커밋 전 `.githooks/pre-commit`이 드리프트+무결성을 자동 검사한다(최초 1회 `git config core.hooksPath .githooks` 필요).
- **CI를 건드렸으면 `node scripts/ci-local.mjs`** — 워크플로 `run:` 블록을 **`bash -e`로** 돌린다.
  맨 `bash`로 재현하면 통과하는데 CI에서 죽는 부류가 있다(`; code=$?` — v0.27.2에 CI가 7번
  연속 빨간 상태였던 원인, REVIEW.md B-13). `--ci`는 첫 실패에서 중단(GitHub 동일), 기본은 전부 실행.

## PowerShell 스크립트 규칙
- `scripts/*.ps1`은 **ASCII 전용**으로 작성한다. PS 5.1이 BOM 없는 .ps1을 ANSI로 파싱해
  한글 리터럴이 따옴표를 삼키며 **에러 없이 로직이 깨진다** (실제 발생 사례 있음).
- PowerShell에서 UTF-8 파일을 읽을 땐 `-Encoding UTF8` 명시(안 하면 mojibake로 보임 — 파일 문제 아님).

## 커밋 스타일
- 형식: `v0.x.0 (n/m): 한글 요약` (기능 세트당 버전 bump, 컴포넌트별 분할 커밋).
- 버전 bump 시 `.claude-plugin/plugin.json`과 `.codex-plugin/plugin.json` **둘 다** 갱신.
- push는 사람이 명시적으로 승인했을 때만.

## 문서 맵
- [README.md](README.md) — 플러그인 소개 · [USAGE.md](USAGE.md) — 설치/사용
- [ORCHESTRATION.md](ORCHESTRATION.md) — 허브-앤-스포크 조율 규칙, 게이트 모드(full/lean/solo)
- [REVIEW.md](REVIEW.md) — 품질 리뷰 기록

## 핵심 설계 원칙 (플러그인 내용 수정 시)
- 최종 권위자는 항상 사람. 모든 단계 전환은 승인 게이트.
- 역할 에이전트 6개는 허브-앤-스포크 — 서로 직접 대화하지 않는다.
- 에이전트는 `memory: project`로 프로젝트별 메모리를 유지한다(Claude Code 기능).
- 검증 축 분리: 게임성(④) ≠ 정확성 QA(⑥) ≠ 경제(⑨) ≠ 연출(폴리싱).
- 장르/엔진 특화 내용은 플러그인에 하드코딩하지 않는다 — 프로젝트 AGENTS.md/CLAUDE.md 몫.
