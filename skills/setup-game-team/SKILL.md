---
name: setup-game-team
description: >
  게임 프로젝트에 역할 에이전트 팀(PM·기획·개발·QA·아트)을 위한 CLAUDE.md 팀 규칙을 세팅한다.
  "게임 팀 세팅해줘", "이 프로젝트에 개발 팀 규칙 만들어줘", "파이프라인 규칙 세팅",
  "CLAUDE.md 게임 팀용으로 만들어줘" 같은 요청에 사용. 새 게임 레포를 이 플러그인의
  에이전트들과 함께 쓰도록 준비할 때 트리거.
---

이 스킬은 현재 게임 프로젝트 레포 루트에 `CLAUDE.md`를 생성하여, 이 플러그인의 역할
에이전트들이 일관된 파이프라인(게임성 검증 포함)과 사람 승인 게이트로 동작하도록 만든다.

## 절차

### 1. 프로젝트·엔진 파악
레포를 살펴 스택을 추론한다.
- `Assets/`+`ProjectSettings/`+`*.cs`/`*.unity` → **Unity**
- `project.godot`/`*.gd` → Godot · `*.uproject`/`*.cpp` → Unreal
- `index.html`/`package.json` → 웹
기존 `CLAUDE.md`가 있으면 덮어쓰지 말고 병합 여부를 사람에게 확인.

### 2. 빠진 정보만 질문
코드에서 확인 불가능한 것만 묻는다(이미 알 수 있으면 묻지 말 것):
장르/한 줄 소개, 엔진·언어·실행(빌드) 방법, 유지할 기존 자산/시스템, 고유 컨벤션(색·네이밍),
비주얼 방향·금지 스타일·목표 화면비(아트 트랙의 기준값),
게임성 성공 지표 초안(모르면 "미결"로 두고 designer가 채우게 함).

### 3. CLAUDE.md 생성 — 엔진에 맞는 템플릿 선택
- **Unity** → `references/claude-md-template-unity.md`
- **그 외(웹/Godot/Unreal 등)** → `references/claude-md-template.md`
템플릿을 뼈대로 값을 채워 레포 루트에 `CLAUDE.md`로 쓴다. 규칙:
- **0단계(컴션 발굴)+7단계 파이프라인** + **3↔4 반복 루프** + **폴리싱 2패스(P1/P2)** + 사람 승인 게이트는 항상 포함(수정 금지 핵심).
- "밸런스 수치는 한 곳에 모은다", "전투/런 로직은 UI·엔진과 분리(헤드리스 시뮬 가능)" 원칙 항상 포함.
- 게임성 성공 지표 섹션 필수(미정이면 `<추정>`/미결 표기).
- 추측 값은 `<추정>`으로 표시하고 사람 확인 항목으로 남긴다.

### 4. 확인 안내
생성 후: (a) `.claude/agents/`에 6개 에이전트(meta-economy-designer 포함), `.claude/skills/`에 `concept-discovery`·`gdd-completeness-checker`·`balance-sim`·`econ-sim`·`art-direction`·`asset-pipeline`·`sprite-pipeline`·`ui-art-system`·`asset-3d-pipeline`·`visual-qa`·`polish`·`polish-writing`·`pr-review`·`release-notes`·`pipeline-brief`가 있는지,
(b) 첫 실행은 plan 모드로 게이트 확인, (c) 엔진별 MCP(웹=없음 / Unity=Unity MCP 등) 권장을 안내.

## 참고
- 웹/범용 템플릿: `references/claude-md-template.md`
- Unity 템플릿: `references/claude-md-template-unity.md`
