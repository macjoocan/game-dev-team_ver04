# game-dev-team

게임 개발용 **역할 에이전트 팀**과 **사람 승인 게이트 기반 파이프라인**을 어느 게임
프로젝트에서든 재사용하도록 묶은 플러그인. 목적은 **기획 → 게임성 검증 → 프로토타입**을
데이터 기반으로 굴리는 것. 최종 권위자는 항상 사람(당신)이다.

**Claude Code와 GPT/Codex 겸용 — 현재 작업은 Claude Code 중점.**
Claude Code에서는 `CLAUDE.md`·`.claude/rules/`(path-scoped 규칙)·**에이전트 메모리**(`memory: project`)를
활용하고, Codex에서는 `AGENTS.md`·`.codex-plugin/`·`.agents/plugins/marketplace.json`을 사용한다.

## 무엇이 들어있나

### 역할 에이전트 6개 (`agents/`)
| 에이전트 | 역할 |
|---|---|
| `pm` | 태스크 분해·우선순위·추적 |
| `game-designer` | 기획/밸런스 설계·검토, **게임성 지표 정의·검증**(게이트: 근거 없는 수치 0) |
| `developer` | 프로토(스파이크)·본구현·시뮬 하네스 (worktree 격리) |
| `qa` | **정확성** 검증·코드 리뷰·버그 리포트 (재미/밸런스는 담당 아님) |
| `artist` | 비주얼 시안·톤 관리, 에셋 파이프라인, 시각 QA, 연출(폴리싱) 디렉션 |
| `meta-economy-designer` | 성장 구조·수익화·리텐션 설계·경제 검증 (core 통과 후) |

에이전트는 **허브-앤-스포크**로 동작. 서로 직접 대화하지 않고 오케스트레이터(메인 세션)가
결과를 모아 다음 역할로 전달하며 각 단계는 사람 승인을 거친다. (조율 규칙: ORCHESTRATION.md)

전 에이전트가 **`memory: project`**(Claude Code) — 프로젝트별 메모리(`.claude/agent-memory/<agent>/`)를
자동 유지해 designer의 밸런스 조정 이력, qa의 회귀 포인트 같은 맥락이 세션을 넘어 축적된다.

### 스킬 14개 (`skills/`)
- **`concept-discovery`** — 초기 아이디어·코어 규칙을 사람과 대화하며 유사 사례 검색·제안으로 다듬어 **코어 컨셉 확보**(0단계, 오케스트레이터 대화형).
- **`setup-game-team`** — 새 게임 레포에 파이프라인 `AGENTS.md`를 스택 맞춤으로 생성. Claude 호환이 필요하면 `CLAUDE.md`도 병행.
- **`balance-sim`** — 전투/런 자동 플레이로 승률·런길이·픽률·사망곡선을 목표와 대조하는 **게임성 검증**.
- **`econ-sim`** — 성장/수익화/리텐션(가챠+광고+F2P)을 코호트 시뮬로 검증하는 **경제 검증**(core 통과 후).
- **`polish`** — 연출/주스(UI 애니메이션·타격감·전투 연출)를 2패스(1차·2차)로 다듬는 **game feel**(artist+developer).
- **`art-direction`** — `VISUAL_DESIGN.md`로 팔레트·실루엣·카메라·UI 톤·금지 스타일을 고정.
- **`asset-pipeline`** — 에셋 요청·출처/라이선스·승인 상태·manifest·엔진 핸드오프 관리.
- **`sprite-pipeline`** — seed frame, 스프라이트 시트/스트립, 프레임 정규화, 피벗, 알파 정리, 미리보기.
- **`ui-art-system`** — HUD·버튼·카드·아이콘·상태/피해 숫자·희귀도 프레임 UI 아트 시스템.
- **`visual-qa`** — 실루엣, 대비, 알파, 피벗, tile seam, UI 겹침, 모바일 가독성 검수.
- **`asset-3d-pipeline`** — Blender MCP/GLB/FBX, scale, pivot, collision proxy, LOD, material/export 검수.
- **`pr-review`** — 게임 코드 PR을 정확성 관점으로 리뷰(로직·회귀·밸런스 하드코딩·게임 특화 위험). qa 소유.
- **`release-notes`** — 머지된 PR·이슈를 모아 릴리즈/패치노트(사용자용+개발자용) 초안. pm 소유.
- **`pipeline-brief`** — 파이프라인 현황·대기 게이트·블로커 브리핑. 예약 작업으로 상시화.

## 파이프라인 (각 화살표 = 사람 승인 게이트)
```
⓪ 컨셉 발굴 → ① 기획+게임성지표 → ② 태스크분해 → ③ 프로토 → ④ 게임성검증(balance-sim) → ⑤ 본구현 → ⑥ 정확성 QA → ⑦ 아트 → P1 코어연출
재미(④) 통과 후 → ⑧ 메타/수익화 → ⑨ 경제검증(econ-sim) → ⑩ 구현 → 출시 전 P2 파이널연출
```
- **③↔④ 반복 루프.** 시뮬 지표 미달 시 ①(기획)으로 되돌려 재조정. 재미 전에는 ⑤로 안 감.
- **④(게임성) ≠ ⑥(QA, 정확성) ≠ ⑨(경제) ≠ 폴리싱(연출)** — 검증 축이 모두 별개.
- **게이트 모드**: `full`(기본) / `lean`(핵심 게이트만) / `solo`(잼/실험용) — 프로젝트 규모에 맞게 선택. (ORCHESTRATION.md 참고)

## 사용법
1. 이 플러그인을 설치한다.
2. 게임 레포에서 `게임 팀 세팅해줘` → `setup-game-team`이 `AGENTS.md`·`PIPELINE_STATE.md` 생성.
3. 초기 아이디어를 `concept-discovery`로 다듬어 코어 확보 후, 각 게이트를 plan 모드로 확인.

**이미 진행 중인 프로젝트에 붙일 때**: 같은 명령(`기존 프로젝트에 팀 붙여줘`)으로 온보딩 —
현재 상태를 진단해 올바른 단계로 중간 진입시키고(대개 ④ 게임성 검증), 이미 충족된 게이트는
근거와 함께 소급 인정(백필), 부족한 것(지표 없음·밸런스 하드코딩 등)은 갭 태스크로 만든다.
기존 코드 스타일·구조는 유지한다.

설치·사용법 [USAGE.md](./USAGE.md) · 조율 규칙 [ORCHESTRATION.md](./ORCHESTRATION.md) · 품질 리뷰 [REVIEW.md](./REVIEW.md).

## 권장 확장 (선택)
- Unity: Unity MCP, Unity ML-Agents(자동 플레이/검증).
- Godot/Unreal/Web: 로컬 실행/테스트 명령 우선, 엔진 MCP는 선택.
- Blender MCP(3D 아트), Figma/Canva(시안/보드), GitHub/Linear/Notion 커넥터.

## 플러그인 개발 (기여자용)
정본은 레포 루트다. `plugins/game-dev-team/`은 Codex 로컬 마켓플레이스용 미러이며,
루트 수정 후 `scripts/sync-plugin.ps1`로 재생성한다(`-Check`로 드리프트 검사).
