# game-dev-team

게임 개발용 **역할 에이전트 팀**과 **사람 승인 게이트 기반 파이프라인**을 어느 게임
프로젝트에서든 재사용하도록 묶은 플러그인. 목적은 **기획 → 게임성 검증 → 프로토타입**을
데이터 기반으로 굴리는 것. 최종 권위자는 항상 사람(당신)이다.

## 무엇이 들어있나

### 역할 에이전트 6개 (`agents/`)
| 에이전트 | 역할 |
|---|---|
| `pm` | 태스크 분해·우선순위·추적 |
| `game-designer` | 기획/밸런스 설계·검토, **게임성 지표 정의·검증**(게이트: 근거 없는 수치 0) |
| `developer` | 프로토(스파이크)·본구현·시뮬 하네스 (worktree 격리) |
| `qa` | **정확성** 검증·코드 리뷰·버그 리포트 (재미/밸런스는 담당 아님) |
| `artist` | 비주얼 방향·톤 관리, 에셋 파이프라인, 시각 QA, 연출(폴리싱) 디렉션 |
| `meta-economy-designer` | 성장 구조·수익화·리텐션 설계·경제 검증 (core 통과 후) |

에이전트는 **허브-앤-스포크**로 동작. 서로 직접 대화하지 않고 오케스트레이터(메인 세션)가
결과를 모아 다음 역할로 전달하며 각 단계는 사람 승인을 거친다. (조율 규칙: ORCHESTRATION.md)

### 스킬 16개 (`skills/`)
- **`concept-discovery`** — 초기 아이디어·코어 규칙을 사람과 대화하며 유사 사례 검색·제안으로 다듬어 **코어 컴션 확보**(0단계, 오케스트레이터 대화형).
- **`setup-game-team`** — 새 게임 레포에 파이프라인 CLAUDE.md를 스택 맞춤으로 생성.
- **`gdd-completeness-checker`** — 기획 문서를 **기획 게이트**로 검수(근거 없는 수치·공란·숨은 미결·정의 안 된 지표). designer/meta 소유.
- **`polish-writing`** — AI 문체를 사람 말투로. 번역투·명사화·모호 수식어 제거, 팀 문체 모드. **수치는 건드리지 않는다.**
- **`balance-sim`** — 전투/런 자동 플레이로 승률·런길이·픽률·사망곱선을 목표와 대조하는 **게임성 검증**.
- **`econ-sim`** — 성장/수익화/리텐션(가챠+광고+F2P)을 코호트 시뮬로 검증하는 **경제 검증**(core 통과 후).
- **`art-direction`** — 아트 스타일·팔레트·실루엣·UI 톤을 정해 `VISUAL_DESIGN.md`로 고정. 아트 단계의 **입구**.
- **`asset-pipeline`** — 에셋 요청 접수·폴더 구조·manifest(안정 ID·승인 상태·출처/라이선스)·엔진 핸드오프.
- **`sprite-pipeline`** — 2D 스프라이트: seed 프레임 승인 → 시트/스트립 → 피벗·baseline 통일 → 아틀라스.
- **`ui-art-system`** — HUD·버튼·카드·아이콘·희귀도 프레임을 **상태별 변형**까지 설계.
- **`asset-3d-pipeline`** — 3D 에셋 스케일·피벗·콜리전·LOD·glTF/FBX 익스포트 (Blender MCP 연동).
- **`visual-qa`** — 가독성·알파·UI 겹침·모바일 세이프에어리어 검수. 아트 단계의 **출구 게이트**.
- **`polish`** — 연출/주스(UI 애니메이션·타격감·전투 연출)를 2패스(1차·2차)로 다듬는 **game feel**(artist+developer).
- **`pr-review`** — 게임 코드 PR을 정확성 관점으로 리뷰(로직·회귀·밸런스 하드코딩·게임 특화 위험). qa 소유.
- **`release-notes`** — 머지된 PR·이슈를 모아 릴리즈/패치노트(사용자용+개발자용) 초안. pm 소유.
- **`pipeline-brief`** — 파이프라인 현황·대기 게이트·블로커 브리핑. 예약 작업으로 상시화.

### 커맨드 1개 (`commands/`)
| 커맨드 | 하는 일 |
|---|---|
| `/game-dev-team:gate` | 현재 단계의 게이트를 판정하고 `state.json`을 갱신. 수치 주장에 **시드·판수·대상 커밋**이 붙어 있는지까지 확인한다 |

### 훅 4개 (`hooks/`)
규칙을 프롬프트 부탁이 아니라 **실제 게이트**로 만든다. 모두 Node 기반(크로스플랫폼)이고
**아무것도 차단하지 않는다** — 최종 판단은 언제나 사람 몫이므로 경고만 띄운다.
해당 없는 상황에서는 즉시 조용히 종료하므로 게임 프로젝트가 아니면 소음이 0이다.

| 이벤트 | 하는 일 |
|---|---|
| `PreToolUse(Write\|Edit)` | 게임 로직 코드에 **밸런스 수치가 하드코딩**되면 경고. `sim/`·`data/`·`*Config*`·테스트는 면제 |
| `PreToolUse(Bash: git commit)` | 열린 승인 게이트·기본 브랜치 직접 커밋·`--no-verify`를 커밋 직전에 알림 |
| `SessionStart` | `docs/pipeline/state.json`의 현재 단계·열린 게이트·반복 예산을 세션 시작 시 주입 |
| `SubagentStop(game-dev-team:*)` | 역할 에이전트 실행을 `docs/pipeline/audit.log`에 감사 기록 |

상태 파일 형식은 [pipeline-brief](./skills/pipeline-brief/SKILL.md)에 있다. `state.json`이 없으면
SessionStart 훅은 아무것도 하지 않는다.

## 무결성 검사 (`scripts/validate-plugin.mjs`)
```bash
node scripts/validate-plugin.mjs
```
에이전트 frontmatter의 `skills:` 참조, 훅이 가리키는 스크립트 경로, 스킬 `name` ↔ 디렉터리명,
README가 말하는 개수 — 전부 **틀려도 런타임에서는 조용히 무시된다.** v0.8.0에서 실제로 존재하지
않는 스킬 4개를 참조하고 있었다(REVIEW.md B-2). 그래서 사람 눈이 아니라 기계가 대조한다.
훅과 달리 이건 차단하는 게이트로, 실패하면 exit 1이다. GitHub Actions에서 push·PR마다 돈다.

## 파이프라인 (각 화살표 = 사람 승인 게이트)
```
⓪ 컴션 발굴 → ① 기획+게임성지표 → ② 태스크분해 → ③ 프로토 → ④ 게임성검증(balance-sim) → ⑤ 본구현 → ⑥ 정확성 QA → ⑦ 아트 → P1 코어연출
재미(④) 통과 후 → ⑧ 메타/수익화 → ⑨ 경제검증(econ-sim) → ⑩ 구현 → 출시 전 P2 파이널연출
```
- **③↔④ 반복 루프.** 시뮬 지표 미달 시 ①(기획)으로 되돌려 재조정. 재미 전에는 ⑤로 안 감.
- **④(게임성) ≠ ⑥(QA, 정확성) ≠ ⑨(경제) ≠ 폴리싱(연출)** — 검증 축이 모두 별개.
- **⑦ 아트**는 내부에 자체 흐름이 있다: `art-direction`(기준) → `asset-pipeline`(manifest) →
  제작(스프라이트·UI·3D) → `visual-qa`(출구). 기준 없이 에셋을 늘리면 뒤에 전부 다시 만든다.
- **검증 주장 무결성**: 안 돌린 검증은 통과가 아니다. 수치 보고는 시드·판수·대상 커밋을 달고,
  증거를 못 만들면 판정은 미달이 아니라 **측정 불가**(→ 하네스 수리). 규칙: ORCHESTRATION.md §5.

## 사용법
1. 플러그인을 설치한다:
   ```
   /plugin marketplace add macjoocan/game-dev-team-Ver2
   /plugin install game-dev-team@game-dev-team
   ```
   팀 전체에 적용하거나 로컬에서 고쳐 쓰는 방법은 [USAGE.md](./USAGE.md#1-설치--어느-게임-프로젝트에든-붙이기).
2. 게임 레포에서 `게임 팀 세팅해줘` → `setup-game-team`이 `CLAUDE.md` 생성.
3. 초기 아이디어를 `concept-discovery`로 다듬어 코어 확보 후, 각 게이트를 plan 모드로 확인.

설치·사용법 [USAGE.md](./USAGE.md) · 조율 규칙 [ORCHESTRATION.md](./ORCHESTRATION.md) · 품질 리뷰 [REVIEW.md](./REVIEW.md).

## 권장 확장 (선택)
- 엔진 MCP(Unity/Unreal/Godot), Blender MCP(3D 아트), GitHub 커넥터.
- 문서·트래커: **Dooray**(사내 위키/프로젝트 — 사외망이 막힌 환경용) 또는 Notion/Linear.
- 기획 파이프라인 MCP(`gdd-pipeline` 등)가 붙어 있으면 기획 게이트 채점을 위임할 수 있다.
