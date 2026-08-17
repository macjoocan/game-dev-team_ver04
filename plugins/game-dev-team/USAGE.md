# 사용법 (game-dev-team 플러그인 · GPT/Codex 우선)

게임 개발 역할 에이전트 팀을 어느 프로젝트에서든 재사용하기 위한 플러그인.
목적: **기획 → 게임성 검증 → 프로토타입**을 데이터 기반으로. 최종 권위자는 항상 사람(당신)이다.

## 1. 설치

### 방법 A — Codex 로컬 마켓플레이스
레포를 클론한 뒤, **클론한 경로**를 마켓플레이스로 등록한다.

```powershell
git clone https://github.com/macjoocan/game-dev-team.git
codex plugin marketplace add <클론한-경로>   # 예: .\game-dev-team
codex plugin add game-dev-team@game-dev-team-local
```

Codex 설정의 기본 모델은 GPT 계열을 사용한다. 역할 파일의 `model:` 값은 설치 안정성을 위해
`inherit`로 두고, 깊은 판단/일반 실행 같은 GPT 라우팅 기준은 `AGENTS.md`에서 관리한다.

### 방법 B — Claude Code 호환
```bash
git clone https://github.com/macjoocan/game-dev-team.git
```
그런 다음 Claude Code의 플러그인/마켓플레이스 설정에서 이 디렉터리를 등록한다. 단, 이
작업본의 기본 문서는 Codex용 `AGENTS.md`다.

## 2. 새 게임 프로젝트에 팀 세팅
게임 레포에서:
```
게임 팀 세팅해줘
```
→ `setup-game-team`이 엔진·언어·컨벤션·게임성 지표를 물어보고(또는 감지) 레포 루트에
파이프라인이 담긴 `AGENTS.md`를 생성한다.

설치 확인(Codex):
```
codex plugin list
```

## 3. 파이프라인 (각 화살표 = 사람 승인 게이트)
```
⓪ 컨셉 발굴 → ① 기획+게임성지표 → ② 태스크분해 → ③ 프로토 → ④ 게임성 검증(balance-sim) → ⑤ 본구현 → ⑥ 정확성 QA → ⑦ 아트/시각 QA
재미(④) 통과 후 → ⑧ 메타/수익화 설계 → ⑨ 경제 검증(econ-sim) → ⑩ 구현 → P2 파이널 연출
```
- ③↔④ 반복: 지표 미달이면 ①로 되돌려 재조정. 재미 나오기 전엔 ⑤로 안 감.
- 재미(④) 통과해야 라이브 서비스 트랙(⑧⑨⑩) 시작. ⑨(경제) ≠ ④(재미) ≠ ⑥(정확성).

## 4. 역할별 호출 예시
- `game-designer로 이 기획서 검수하고 게임성 목표 지표 정의해줘`
- `pm으로 이 변경을 태스크로 분해해줘`
- `developer로 이 메커니즘 프로토(스파이크) 만들어줘` (worktree 격리)
- `balance-sim으로 1000판 자동 플레이해서 승률·런 길이·픽률 뽑아줘` (게임성 검증)
- `qa로 이 변경 정확성 리뷰하고 회귀 확인해줘`
- `art-direction으로 VISUAL_DESIGN.md 만들어줘`
- `artist로 카드 UI 시안 2~3안 만들고 ui-art-system 기준도 잡아줘`
- `sprite-pipeline으로 캐릭터 idle/walk/attack 시트 제작 기준 만들어줘`
- `visual-qa로 모바일 화면에서 HUD 겹침과 알파/피벗 문제 봐줘`
- `meta-economy-designer로 성장 구조·수익화(가챠+광고+F2P) 설계해줘` (core 통과 후)
- `econ-sim으로 리텐션·재화수지·LTV 뽑아줘` (경제 검증)

## 5. 권장 확장 (선택)
- Unity: Unity MCP, Unity ML-Agents(자동 플레이/검증).
- Godot/Unreal/Web: 로컬 실행/테스트 명령 우선, 엔진 MCP는 선택.
- 3D 아트: Blender MCP. 시안/보드: Figma/Canva.
- 트래커: GitHub · Linear · Notion

## 6. 게이트 체크(사람용 요약)
- **게이트 모드**: `full`(모든 게이트, 기본) / `lean`(핵심 게이트만: 코어 확정·게임성 검증·머지) / `solo`(게이트 없음, 잼/실험용). 세팅 시 또는 진행 중 언제든 변경 가능 — AGENTS.md에 기록된다.
- 기획 게이트: 근거 없는 수치 0 · 미결 명시 · 게임성 지표 정의.
- 게임성 검증: balance-sim 실측이 목표 충족(미달 시 기획으로 되돌림).
- 경제 검증(core 통과 후): econ-sim이 리텐션·재화수지·무과금 공정·컴플라이언스 충족.
- 정확성/머지: 콘솔·빌드 에러 0, 회귀 없음, QA 판정 통과.
- 아트/시각 QA: `VISUAL_DESIGN.md`, asset manifest, 실제 화면 증거, 작은 화면 가독성 확인.

## 7. 플러그인 수정 시 (개발자용)
- **정본은 레포 루트**(`agents/`, `skills/`, 문서, 매니페스트)다. `plugins/game-dev-team/`은 Codex 로컬 마켓플레이스용 미러이므로 직접 수정하지 않는다.
- 루트 수정 후 `scripts/sync-plugin.ps1`을 실행해 미러를 재생성한다. 드리프트 확인만 하려면 `scripts/sync-plugin.ps1 -Check`.
