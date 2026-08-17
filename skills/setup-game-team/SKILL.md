---
name: setup-game-team
description: >
  게임 프로젝트에 역할 에이전트 팀(PM·기획·개발·QA·아트)을 위한 AGENTS.md/Codex 또는 CLAUDE.md 팀 규칙을 세팅한다.
  "게임 팀 세팅해줘", "이 프로젝트에 개발 팀 규칙 만들어줘", "파이프라인 규칙 세팅",
  "AGENTS.md 게임 팀용으로 만들어줘", "CLAUDE.md 게임 팀용으로 만들어줘" 같은 요청에 사용. 새 게임 레포를 이 플러그인의
  에이전트들과 함께 쓰도록 준비할 때 트리거.
---

이 스킬은 현재 게임 프로젝트 레포 루트에 `AGENTS.md`를 우선 생성하여, GPT/Codex 기반 역할
에이전트들이 일관된 파이프라인(게임성 검증 포함)과 사람 승인 게이트로 동작하도록 만든다.
사용자가 Claude Code용 세팅을 명시하면 `CLAUDE.md`도 생성하거나 병행 생성한다.

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

### 4. Claude 호환이 필요할 때만 CLAUDE.md 생성
사용자가 Claude Code 호환도 원하거나 기존 레포가 Claude 중심이면 같은 내용의 `CLAUDE.md`를 병행 생성한다.
이때 Codex에서는 `AGENTS.md`가 우선임을 명시한다.

### 5. 확인 안내
생성 후: (a) **플러그인 설치본**에 역할 에이전트 6개(meta-economy-designer 포함)와 스킬 14개가 있는지 확인 — Codex는 `codex plugin list`, Claude Code는 플러그인 설정에서 확인한다(에이전트/스킬은 게임 레포가 아니라 플러그인 설치 위치에 있다),
(b) 게임 레포 루트에 `AGENTS.md`(요청 시 `CLAUDE.md`)와 `PIPELINE_STATE.md`가 생성됐는지 확인,
(c) 첫 실행은 게이트 확인부터 시작, (d) 엔진별 MCP(웹=없음 / Unity=Unity MCP 등)와 자동 플레이 검증(Unity ML-Agents 등)을 선택 권장.

## 참고
- Codex/GPT 웹·범용 템플릿: `references/agents-md-template.md`
- Codex/GPT Unity 템플릿: `references/agents-md-template-unity.md`
- Claude 호환 웹·범용 템플릿: `references/claude-md-template.md`
- Claude 호환 Unity 템플릿: `references/claude-md-template-unity.md`
- 파이프라인 상태 파일 템플릿: `references/pipeline-state-template.md`
- 커밋 전 자동 검사(품질 훅) 가이드: `references/quality-hooks.md`
