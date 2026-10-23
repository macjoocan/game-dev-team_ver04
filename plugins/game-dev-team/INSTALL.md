# 설치 안내 (팀원용)

`game-dev-team` 플러그인을 **Claude Code와 Codex**에 붙이는 방법.
**압축 푼 폴더에서 스크립트 하나만 실행하면 둘 다 잡힙니다.**

## 0. 준비물
- **Claude Code** 또는 **Codex** 중 **하나 이상** — 있는 쪽에 자동으로 설치됩니다.
  - Claude Code: `claude --version` ([설치](https://claude.com/claude-code))
  - Codex: `codex --version` (`npm i -g @openai/codex`)
- **Node.js** (선택) — 없어도 설치·사용은 되지만, 품질 훅 4개가 조용히 꺼집니다.

> **마켓플레이스 이름을 직접 칠 필요 없습니다.** 하네스마다 다르고 레포 이름과도 다릅니다
> (Claude는 `game-dev-team`, Codex는 `game-dev-team-local`, 레포는 `game-dev-team_ver04`).
> 손으로 치다 틀려서 설치가 안 되는 게 실제로 있었습니다 — 그래서 스크립트가 대신 합니다.

## 1. 압축 풀기
**계속 둘 폴더에 푸세요.** 이 폴더가 플러그인의 실제 소스라서, 지우거나 옮기면 등록이 깨집니다.
```
예) C:\tools\game-dev-team\   또는   ~/tools/game-dev-team/
```
바탕화면·다운로드 폴더처럼 나중에 정리할 곳은 피하세요.

## 2. 설치 실행

**Windows** — 폴더에서 우클릭 → "터미널에서 열기" 후:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

**macOS / Linux**:
```bash
sh ./install.sh
```

스크립트가 하는 일: **하네스 탐지(claude·codex)** → 예전 등록 정리 → 마켓플레이스 등록 → 설치.
**여러 번 실행해도 안전합니다**(재실행이 곧 업데이트).

### 옵션
| 옵션 | 뜻 |
|---|---|
| (없음) | 찾은 하네스 **전부**에 설치. Claude는 `user` 스코프 (기본) |
| `-Harness codex` / `--harness codex` | Codex에만 |
| `-Harness claude` / `--harness claude` | Claude Code에만 |
| `-Scope project` / `--scope project` | 이 레포 협업자 전원 (**Claude 전용** — Codex는 스코프가 없습니다) |
| `-Scope local` / `--scope local` | 이 레포에서 나만 (Claude 전용) |
| `-Uninstall` / `--uninstall` | 제거 (찾은 하네스 전부) |

### Codex에서 무엇이 되나
스킬 25개는 **전부** 됩니다. 역할 에이전트 6개와 `/gate`는 **Claude 전용**입니다
(Codex 커스텀 에이전트는 TOML이라 플러그인으로 배포되지 않습니다).
훅 4종은 Codex에서도 **실행은 됩니다**(v0.46.2부터 Windows 포함). 다만 Codex가 훅 출력을
컨텍스트로 받아들이는지는 아직 확인하지 못했습니다.
그래서 Codex 세션은 **`AGENTS.md`가 믿을 수 있는 유일한 규칙 전달 경로**입니다. 작업 시작 전에 그걸 읽으세요.
자세한 대조표는 [USAGE.md](./USAGE.md)에 있습니다.

## 3. 확인

**Claude Code 안에서:**
```
/reload-plugins     현재 세션에 반영
/agents             역할 6개가 보이면 성공
                    (pm · game-designer · developer · qa · artist · meta-economy-designer)
/plugin             Installed 탭에 game-dev-team, Errors 탭은 비어 있어야 정상
```

**Codex는 터미널에서:**
```
codex plugin list   game-dev-team 이 'installed, enabled' 여야 정상
```
`/agents`·`/gate`가 **안 보이는 게 정상**입니다 — Codex는 스킬만 받습니다.

## 4. 게임 레포에서 시작하기
게임 프로젝트 폴더에서 Claude Code를 열고 이렇게 말하면 됩니다.

```
게임 팀 세팅해줘
```
→ 팀 규칙(`CLAUDE.md`)·게이트 상태 파일·설정을 만들어 줍니다.

이미 개발이 진행 중인 프로젝트면:
```
기존 프로젝트에 팀 붙여줘
```
→ 처음부터 다시 시작하지 않고, 현재 상태를 진단해 알맞은 단계로 중간 진입시킵니다.

## 5. 안 될 때
| 증상 | 해결 |
|---|---|
| `claude: command not found` | Claude Code가 PATH에 없습니다. 터미널을 새로 열거나 재설치 |
| `이 시스템에서 스크립트를 실행할 수 없습니다` | 위 명령의 `-ExecutionPolicy Bypass`를 빼먹은 경우입니다 |
| `/agents`에 안 보임 | `/reload-plugins` 실행. 그래도 없으면 설치 스크립트를 다시 실행 |
| 훅이 아무 반응 없음 | Node가 PATH에 없는 경우. 훅만 꺼지고 나머지는 정상 |
| 폴더를 옮긴 뒤 깨짐 | 옮긴 폴더에서 설치 스크립트를 다시 실행하면 재등록됩니다 |
| 플러그인 파일을 고쳤는데 반영이 안 됨 | 설치본은 캐시 스냅샷입니다. `/reload-plugins`로는 안 되고 **설치 스크립트를 다시 실행**해야 합니다 |
| **옛 버전이 계속 깔림** | 마켓플레이스가 **다른 레포**를 가리키고 있을 수 있습니다(실제 사례: 죽은 `-Ver3`를 가리켜 18버전 뒤처진 0.16.0이 계속 설치됨). `node scripts/check-plugin-version.mjs`로 **소스 출처**를 확인하세요 — 의도한 레포가 아니면 설치 스크립트를 다시 실행하면 등록이 교체됩니다 |
| Codex가 설치법을 못 찾음 | 마켓플레이스 이름이 `game-dev-team-local`입니다(레포명·플러그인명과 다릅니다). 손으로 치지 말고 설치 스크립트를 쓰세요 |

## 6. 최신 버전 받기
사내망에서는 이 압축 파일을 새로 받아 **같은 폴더에 덮어쓰고 설치 스크립트를 다시 실행**하면 됩니다.
GitHub에 접근된다면 `git clone https://github.com/macjoocan/game-dev-team_ver04.git` 후 같은 스크립트를 쓰면 됩니다.

---
사용법 전체는 [USAGE.md](./USAGE.md), 파이프라인·조율 규칙은 [ORCHESTRATION.md](./ORCHESTRATION.md)를 보세요.
