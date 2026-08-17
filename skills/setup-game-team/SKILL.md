---
name: setup-game-team
description: >
  게임 프로젝트에 역할 에이전트 팀(PM·기획·개발·QA·아트)을 위한 AGENTS.md/Codex 또는 CLAUDE.md 팀 규칙을 세팅한다.
  신규 레포뿐 아니라 **이미 개발이 진행 중인 프로젝트에 중간 진입(온보딩)** 할 때도 사용 — 현재 상태를
  파이프라인 단계로 판정하고 이미 충족된 게이트는 소급 인정한다.
  "게임 팀 세팅해줘", "이 프로젝트에 개발 팀 규칙 만들어줘", "파이프라인 규칙 세팅",
  "기존 프로젝트에 팀 붙여줘", "진행 중인 프로젝트에 파이프라인 적용해줘",
  "AGENTS.md 게임 팀용으로 만들어줘", "CLAUDE.md 게임 팀용으로 만들어줘" 같은 요청에 사용.
---

이 스킬은 게임 프로젝트 레포에 팀 규칙을 세팅한다. **사용 중인 하네스에 맞춘다**:
- **Claude Code 세션이면 `CLAUDE.md` + `.claude/rules/`를 우선 생성**(4단계 상세).
- Codex 세션이면 `AGENTS.md`를 우선 생성.
- 두 하네스를 병행하면 둘 다 생성하고, 각 파일에 상대 파일의 존재와 우선순위를 명시한다.
역할 에이전트들이 일관된 파이프라인(게임성 검증 포함)과 사람 승인 게이트로 동작하게 만든다.

## 절차

### 1. 프로젝트·엔진 파악
레포를 살펴 스택을 추론한다.
- `Assets/`+`ProjectSettings/`+`*.cs`/`*.unity` → **Unity**
- `project.godot`/`*.gd` → Godot · `*.uproject`/`*.cpp` → Unreal
- `index.html`/`package.json` → 웹
기존 `AGENTS.md` 또는 `CLAUDE.md`가 있으면 덮어쓰지 말고 병합 여부를 사람에게 확인.

**기존 코드베이스가 있는 레포면(신규 아님)** 먼저 구조를 파악한다: 진입점, 전투/런 로직 위치,
밸런스 수치가 흩어져 있는지(데이터화 여부), 테스트/헤드리스 실행 가능 여부, UI-로직 분리 상태.
파악 결과는 AGENTS.md의 "유지할 기존 자산/시스템" 섹션에 요약해 채우고, 헤드리스 시뮬이
불가능한 구조면 "리팩터 필요"를 미결로 남긴다.
이어서 **아래 "기존 진행 중 프로젝트 온보딩" 절차로 진입 단계를 판정**한다(체크리스트:
`references/onboarding-checklist.md`).

### 2. 빠진 정보만 질문
코드에서 확인 불가능한 것만 묻는다(이미 알 수 있으면 묻지 말 것):
장르/한 줄 소개, 엔진·언어·실행(빌드) 방법, 유지할 기존 자산/시스템, 고유 컨벤션(색·네이밍),
비주얼 방향/금지 스타일/목표 화면비, 게임성 성공 지표 초안(모르면 "미결"로 두고 designer가 채우게 함),
**게이트 모드**(`full` 기본 / `lean` 핵심 게이트만 / `solo` 잼·실험용 — 규모가 작으면 lean 제안).

### 3. AGENTS.md 생성 — 엔진에 맞는 템플릿 선택
- **Unity** → `references/agents-md-template-unity.md`
- **그 외(웹/Godot/Unreal 등)** → `references/agents-md-template.md`
템플릿을 뼈대로 값을 채워 레포 루트에 `AGENTS.md`로 쓴다. 규칙:
- **0단계(컨셉 발굴)+아트/시각 QA 포함 파이프라인** + **3↔4 반복 루프** + **폴리싱 2패스(P1/P2)** + 사람 승인 게이트는 항상 포함(수정 금지 핵심).
- "밸런스 수치는 한 곳에 모은다", "전투/런 로직은 UI·엔진과 분리(헤드리스 시뮬 가능)" 원칙 항상 포함.
- `VISUAL_DESIGN.md`, asset manifest, sprite/UI/3D 제작 기준, visual-qa 증거 규칙을 포함.
- 게임성 성공 지표 섹션 필수(미정이면 `<추정>`/미결 표기).
- 추측 값은 `<추정>`으로 표시하고 사람 확인 항목으로 남긴다.
- 모델 라우팅은 GPT 계열 기준으로 쓰되 역할 파일의 `model:`은 `inherit`로 유지한다. 깊은 판단/장기 구현은 높은 추론 설정, 일반 실행/브리핑은 중간 추론 설정으로 문서화한다.
- 선택한 **게이트 모드**(full/lean/solo)를 AGENTS.md에 명시한다. lean이면 핵심 게이트(코어 확정·게임성 검증·머지)만, solo면 게이트 없음(잼/실험)을 기록한다.
- `references/pipeline-state-template.md`를 뼈대로 레포 루트에 **`PIPELINE_STATE.md`**를 생성한다 — 게이트 통과 이력·현재 단계·미결을 파일로 남겨 세션이 바뀌어도 `pipeline-brief`가 이어받게 한다.
- 커밋 전 자동 검사(밸런스 수치 하드코딩 검출 등)를 원하면 `references/quality-hooks.md`를 참고해 pre-commit 훅을 제안한다(선택).

### 4. Claude Code 세팅 (Claude 세션이면 기본 수행)
- `CLAUDE.md` 생성: `references/claude-md-template.md`(웹·범용) 또는 `claude-md-template-unity.md`(Unity).
  3단계의 규칙(게이트 모드·PIPELINE_STATE·아트 규칙)을 동일하게 반영한다. Codex 병행 시 Codex에서는 `AGENTS.md`가 우선임을 명시.
- **`.claude/rules/` 생성**: `references/claude-rules-template.md`를 참고해 core-logic(밸런스 하드코딩 금지·시드 RNG·헤드리스),
  balance-data(근거 없는 수치 변경 금지), ui-code 규칙을 **실제 경로가 확정된 것만** 만든다(경로 미정이면 미결로).
- **에이전트 메모리 안내**: 역할 에이전트 6개는 `memory: project`라 Claude Code가
  `.claude/agent-memory/<agent>/`에 프로젝트별 메모리를 자동 유지한다(designer의 밸런스 이력,
  qa의 회귀 포인트 등이 세션을 넘어 축적됨). 커밋해서 팀과 공유할지, gitignore할지 사람에게 확인한다.
- (Unity + Claude) `.mcp.json`에 Unity MCP 서버 설정을 프로젝트 스코프로 제안한다(선택).
- worktree 격리를 쓰는 레포에 gitignored 설정 파일(.env, 로컬 키 등)이 있으면
  `.worktreeinclude`(gitignore 문법)로 워크트리에 복사되게 안내한다.

### 5. 확인 안내
생성 후: (a) **플러그인 설치본**에 역할 에이전트 6개(meta-economy-designer 포함)와 스킬 14개가 있는지 확인 — Codex는 `codex plugin list`, Claude Code는 플러그인 설정에서 확인한다(에이전트/스킬은 게임 레포가 아니라 플러그인 설치 위치에 있다),
(b) 게임 레포 루트에 `AGENTS.md`(요청 시 `CLAUDE.md`)와 `PIPELINE_STATE.md`가 생성됐는지 확인,
(c) 첫 실행은 게이트 확인부터 시작, (d) 엔진별 MCP(웹=없음 / Unity=Unity MCP 등)와 자동 플레이 검증(Unity ML-Agents 등)을 선택 권장.

## 기존 진행 중 프로젝트 온보딩 (중간 진입)

이미 개발이 진행된 프로젝트는 ⓪(컨셉)부터 다시 시작하지 않는다. **현재 상태를 진단해
파이프라인의 올바른 단계로 진입**시키고, 이미 충족된 게이트는 근거와 함께 소급 인정한다.

### O1. 진단
`references/onboarding-checklist.md`의 체크리스트로 기획·코드·검증·아트 상태를 확인한다.
증거(문서·코드·테스트·시뮬 결과)가 있는 항목만 "있음"으로 친다 — 기억이나 추정은 근거가 아니다.

### O2. 진입 단계 판정
| 현재 상태 | 진입 단계 |
|---|---|
| 아이디어/기획 문서만 있음 | ①(기획+지표)부터 — ⓪은 코어가 불명확할 때만 |
| 플레이 가능한 코어 루프 있음, 재미 검증 안 됨 | **④(게임성 검증)부터** — 가장 흔한 케이스 |
| 재미 근거 있음(시뮬/유저 반응), 본구현 진행 중 | ⑤~⑥(본구현/QA) |
| 코어 완성, 출시 준비 중 | ⑦(아트)·P1/P2(폴리싱) |
| 라이브 운영/수익화 단계 | ⑧~⑨(메타/경제 트랙) — 단, ④ 근거 없으면 ④ 병행 |

판정과 근거를 사람에게 보고하고 **진입 단계를 승인받는다**(온보딩 자체가 첫 게이트).

### O3. 게이트 백필(소급 인정)
`PIPELINE_STATE.md` 게이트 이력에 이미 충족된 게이트를 `백필` 표기로 기록한다.
- 예: `| 2026-08-17 | 0→1 코어 확정 | 통과(백필) | 플레이 가능 빌드 존재, 코어 루프 명확 |`
- **근거 없는 백필 금지.** 애매하면 통과 처리하지 말고 미결로 남긴다(특히 게임성 지표 — 대부분의 기존 프로젝트에 없다).

### O4. 갭 목록 → 태스크화
진단에서 나온 갭을 미결/태스크로 만든다. 전형적 갭과 담당:
- 게임성 성공 지표 없음 → `game-designer`가 정의 (①의 잔여분)
- 밸런스 수치가 코드에 하드코딩 → `developer` 리팩터 태스크(데이터 테이블로)
- 헤드리스 시뮬 불가(UI-로직 미분리) → `developer` 리팩터 — balance-sim 전제라 우선순위 높음
- `VISUAL_DESIGN.md`/asset manifest 없음 → `artist` (⑦ 진입 전까지)
- 테스트 없음 → `qa`와 함께 스모크 테스트부터

### O5. 기존 자산 존중 원칙
- 기존 코드 스타일·구조·네이밍은 유지한다. 파이프라인 규칙과 충돌하면 사람에게 결정을 넘긴다.
- 동작하는 코드를 파이프라인에 맞추겠다고 일괄 리팩터하지 않는다 — 갭 태스크는 필요한 것만, 점진적으로.
- 기존 문서(GDD·기획서·TODO)가 있으면 AGENTS.md에서 링크하고, 내용을 옮겨 적지 않는다(이중 관리 방지).

## 참고
- 기존 프로젝트 온보딩 체크리스트: `references/onboarding-checklist.md`
- Codex/GPT 웹·범용 템플릿: `references/agents-md-template.md`
- Codex/GPT Unity 템플릿: `references/agents-md-template-unity.md`
- Claude 호환 웹·범용 템플릿: `references/claude-md-template.md`
- Claude 호환 Unity 템플릿: `references/claude-md-template-unity.md`
- Claude `.claude/rules/` 템플릿: `references/claude-rules-template.md`
- 파이프라인 상태 파일 템플릿: `references/pipeline-state-template.md`
- 커밋 전 자동 검사(품질 훅) 가이드: `references/quality-hooks.md`
