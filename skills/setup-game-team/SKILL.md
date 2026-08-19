---
name: setup-game-team
description: >
  게임 프로젝트에 이 플러그인을 붙인다. 역할 에이전트 팀(PM·기획·개발·QA·아트)을 위한
  CLAUDE.md 팀 규칙을 만들고, 팀원 전원이 같은 설정을 쓰도록 .claude/settings.json ·
  docs/pipeline/state.json · .gitignore 까지 함께 세팅한다.
  "게임 팀 세팅해줘", "이 프로젝트에 붙여줘", "개발 팀 규칙 만들어줘", "파이프라인 규칙 세팅",
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

### 4. 프로젝트에 플러그인 고정 — 팀원이 같은 팀 규칙을 쓰게
CLAUDE.md만 만들면 **그 레포를 여는 사람마다 플러그인을 따로 깔아야 한다.** 아래 세 파일을
같이 만들어 레포에 커밋하게 한다. 셋 다 **이미 있으면 덮어쓰지 말고 병합 여부를 먼저 묻는다.**

**(a) `.claude/settings.json` — 마켓플레이스 자동 등록**
```json
{
  "extraKnownMarketplaces": {
    "game-dev-team": {
      "source": { "source": "github", "repo": "macjoocan/game-dev-team-Ver2" }
    }
  },
  "enabledPlugins": {
    "game-dev-team@game-dev-team": true
  }
}
```
기존 파일이 있으면 **이 두 키만 병합**한다(권한·훅 등 다른 설정을 건드리지 않는다).

**자동 설치까지는 안 된다는 걸 사람에게 반드시 알린다.** 위 설정은 마켓플레이스 등록까지만
자동이고, GitHub 소스 플러그인은 팀원이 `claude plugin install game-dev-team@game-dev-team` 을
한 번 실행해야 로드된다. 이걸 안 알려주면 "설정했는데 왜 안 되냐"가 그대로 발생한다.

**(b) `docs/pipeline/state.json` — 세션 시작 훅이 읽는 상태 파일**
없으면 훅이 조용히 아무것도 하지 않으므로, 파이프라인을 쓰기 시작할 때 씨앗을 만들어 둔다.
```json
{
  "stage": 0,
  "stageName": "컴션 발굴",
  "openGates": [],
  "loopBudget": { "name": "3↔4", "used": 0, "max": 3 },
  "blockers": [],
  "updated": "<오늘 날짜>"
}
```
형식 상세는 `skills/pipeline-brief/SKILL.md`. 갱신 책임은 오케스트레이터에게 있다.

**(c) `.gitignore` 항목**
`docs/pipeline/audit.log` 를 추가한다 — 훅이 자동으로 쌓는 작업 기록이지 소스가 아니다.
`state.json` 은 **커밋하는 쪽을 권한다**(팀이 같은 게이트 상태를 봐야 하므로). 다만 그 레포가
공개이고 게이트 문구에 미공개 수치가 들어간다면 사람에게 물어 정한다.

### 5. 확인 안내
생성 후 사람에게 안내한다:
- `/plugin` → Installed 탭에 `game-dev-team`, Errors 탭이 비어 있는지
- `/agents` → 역할 에이전트 6개(meta-economy-designer 포함)가 보이는지
- 훅은 **Node가 PATH에 있어야** 돈다. 없으면 훅만 조용히 실패하고 나머지는 정상
- 첫 실행은 plan 모드로 게이트 확인
- 엔진별 MCP 권장(웹=없음 / Unity=Unity MCP / 3D 아트=Blender MCP)

> 플러그인 컴포넌트는 프로젝트의 `.claude/` 가 아니라 플러그인 캐시에 있다. 게임 레포의
> `.claude/agents/` 를 뒤져 확인하려 하지 마라 — 거기엔 없다.
## 참고
- 웹/범용 템플릿: `references/claude-md-template.md`
- Unity 템플릿: `references/claude-md-template-unity.md`
