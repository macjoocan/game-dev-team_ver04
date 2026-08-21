# 설치 안내 (팀원용)

`game-dev-team` 플러그인을 Claude Code에 붙이는 방법. **압축 푼 폴더에서 스크립트 하나만 실행하면 됩니다.**

## 0. 준비물
- **Claude Code** — 터미널에서 `claude --version`이 돌아야 합니다. ([설치](https://claude.com/claude-code))
- **Node.js** (선택) — 없어도 설치·사용은 되지만, 품질 훅 4개가 조용히 꺼집니다.

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

스크립트가 하는 일: 준비물 확인 → 예전에 깔린 같은 이름의 등록 정리 → 마켓플레이스 등록 → 플러그인 설치.
**여러 번 실행해도 안전합니다**(재실행이 곧 업데이트).

### 옵션
| 옵션 | 뜻 |
|---|---|
| (없음) | `user` 스코프 — 내 모든 프로젝트에서 사용 (기본) |
| `-Scope project` / `--scope project` | 이 레포 협업자 전원 |
| `-Scope local` / `--scope local` | 이 레포에서 나만 |
| `-Uninstall` / `--uninstall` | 제거 |

## 3. 확인
Claude Code 안에서:
```
/reload-plugins     현재 세션에 반영
/agents             역할 6개가 보이면 성공
                    (pm · game-designer · developer · qa · artist · meta-economy-designer)
/plugin             Installed 탭에 game-dev-team, Errors 탭은 비어 있어야 정상
```

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

## 6. 최신 버전 받기
사내망에서는 이 압축 파일을 새로 받아 **같은 폴더에 덮어쓰고 설치 스크립트를 다시 실행**하면 됩니다.
GitHub에 접근된다면 `git clone https://github.com/macjoocan/game-dev-team-Ver3.git` 후 같은 스크립트를 쓰면 됩니다.

---
사용법 전체는 [USAGE.md](./USAGE.md), 파이프라인·조율 규칙은 [ORCHESTRATION.md](./ORCHESTRATION.md)를 보세요.
