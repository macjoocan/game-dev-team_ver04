# Game Dev Team for Codex

이 작업 공간은 GPT/Codex 모델이 게임 개발 역할 팀을 안정적으로 조율하도록 맞춘다.
Claude 전용 지시문은 참고만 하고, Codex에서는 이 파일과 `skills/`, `.codex-plugin/` 메타데이터를 우선한다.

## Codex에서 실제로 되는 것 (먼저 읽어라)

플러그인 컴포넌트 중 **Codex로 배포되는 건 스킬뿐이다.** 이걸 모르면 없는 기능을 있다고 가정한다.

| 컴포넌트 | Codex | 뜻 |
|---|---|---|
| **스킬 23개** (판정 도구 전부 포함) | **된다** | `.codex-plugin`이 `"skills": "./skills/"`로 배선. 아래 도구를 그대로 쓴다 |
| 역할 에이전트 6개 | **안 된다** | Codex 커스텀 에이전트는 TOML이고 플러그인 배포가 미지원이다. `## 역할`은 **메인 세션이 직접 지키는 규칙**으로 읽어라 |
| 훅 4종 | **안 된다** | `hooks/hooks.json` 위치는 맞지만 경로가 `${CLAUDE_PLUGIN_ROOT}`이고 이벤트명이 Claude 체계다 |
| `/gate` 커맨드 | **안 된다** | 게이트 판정은 이 파일의 `## 게이트`를 보고 손으로 한다 |

**훅이 없다는 게 실무에서 뜻하는 것 세 가지:**
1. **`docs/pipeline/state.json`이 자동 주입되지 않는다.** 작업 시작 전에 직접 읽어 `openGates`를
   확인한다. 안 읽으면 열린 게이트를 모른 채 진행한다.
2. **밸런스 하드코딩 경고가 안 뜬다.** 수치를 데이터 테이블로 분리하는 건 스스로 지켜야 한다.
3. **감사 로그(`audit.log`)가 안 쌓인다.** 무엇을 했는지는 **완료 보고가 유일한 기록**이다.

Claude Code 세션과 병행한다면 파일 소유권 계약을 먼저 확인한다 → `ORCHESTRATION.md` §10.
특히 **`palette.json`·`VISUAL_DESIGN.md`·`state.json`은 정본이므로 양산 세션이 고치지 않는다.**

## 모델 라우팅
- 기본 모델: 현재 Codex 세션의 GPT/Codex 계열 기본 모델.
- 장기 구현, 설계 검토, 게이트 판정: 높은 추론 설정을 사용한다.
- 단순 정리, 릴리즈 노트, 파이프라인 브리핑: 중간 추론 설정을 사용한다.
- 역할 파일의 `model:` 값은 로더 호환성을 위해 `inherit`로 둔다.
- GPT 계열 라우팅은 이 문서에서 관리한다. 깊은 판단/장기 구현은 높은 추론 설정, 일반 실행/검증은 중간 추론 설정을 사용한다.

## 오케스트레이션
- 최종 권위자는 항상 사람이다.
- 메인 세션은 허브 역할을 한다. 역할 에이전트 결과를 모아 다음 단계로 넘기고, 게이트마다 사람 승인을 받는다.
- 사람과 여러 턴 왕복해야 하는 `concept-discovery`는 메인 세션이 직접 진행한다.
- 구현 전에는 기획 게이트와 게임성 지표가 있어야 한다.

## 역할
- `pm`: 태스크 분해, 우선순위, 진행 현황.
- `game-designer`: core 기획, 밸런스, 게임성 성공 지표, `balance-sim` 해석.
- `developer`: 프로토타입, 본구현, 헤드리스 시뮬 하네스, 엔진 통합.
- `qa`: 정확성 검증, 회귀, 코드 리뷰. 재미/밸런스 판정은 하지 않는다.
- `artist`: 비주얼 방향, UI 톤, 에셋 파이프라인, 시각 QA, 연출 디렉션.
- `meta-economy-designer`: core 통과 후 성장, 수익화, 리텐션, 경제 검증.

## 게이트
- 게이트 모드: lean(기본, 코어 확정·게임성 검증·머지) / full(전 게이트 — 정식·출시 준비 시 명시 선택) / solo(게이트 없음, 잼·실험 — 사람이 명시 선택 시). 프로젝트 AGENTS.md에 기록.
- 게이트 통과 이력·현재 단계는 프로젝트 루트 `PIPELINE_STATE.md`에 기록한다.
- 진행 중인 프로젝트 온보딩 시: 현재 상태를 진단해 올바른 단계로 중간 진입, 충족된 게이트는 근거와 함께 백필. ⓪부터 재시작하지 않는다.
- 0→1 코어 확정.
- 1→2 기획 게이트: 근거 없는 수치 0, 미결 명시, 핵심 수치 공란 0, 게임성 지표 정의.
- 3↔4 프로토/게임성 검증 루프: 반복 예산 기본 3회, 1회 조정 노브 최대 2개.
- 5→6 본구현 후 정확성 QA.
- 재미 통과 후에만 메타 경제/수익화 트랙으로 이동한다.

## 검증 도구 (게이트 근거를 만드는 곳)

**하네스를 처음부터 만들지 마라.** 스캐폴드가 계약만 프로젝트에 남기고 나머지를 다 가져간다.
전부 종료 코드를 낸다: `0` 충족 / `1` 미달 / `3` 측정 불가.

### 게임성 검증 (3↔4 게이트, 봇 축)
```bash
node skills/balance-sim/scripts/sim-scaffold.mjs --out sim   # sim/ 골격 생성 (8파일, 자기완결적)
node sim/run.mjs --seed 42 --runs auto --margin 0.02          # 목표 오차에서 판수 역산
node sim/run.mjs --seed 42 --runs 1000 --ab damageMax=25      # 공통 난수 A/B
node sim/curve-check.mjs sim-out/results.json                 # 난이도 곡선 판정
```
- 프로젝트가 구현할 건 `sim/game.mjs`의 `simulateRun` 하나다. 시드·배치·집계·신뢰구간·판정·
  리포트·커밋 스탬핑은 스캐폴드가 한다 — **손으로 적을 칸이 없는 게 요점이다.**
- `game.mjs`의 `PLACEHOLDER`가 `true`인 동안 판정은 무조건 `측정 불가`(exit 3)로 강제된다.
  자리표시자가 만든 숫자를 미달로 보고하면 기획이 멀쩡한 밸런스를 흔든다.
- **판정은 점추정이 아니라 95% 구간으로 한다.** 목표 35~55%에서 100판의 52%는 구간이 42~62%라
  측정 불가다. 같은 52%를 1000판에서 얻으면 49~55%로 좁아져 충족이 된다.
- 난수는 인자로 받은 `rng`만 쓴다. `Math.random()`을 한 군데라도 부르면 재현이 깨진다.

### 사람 플레이테스트 (3↔4 게이트, 사람 축 — **봇만으로는 조건부다**)
```bash
node skills/playtest-capture/scripts/funnel-report.mjs <events.jsonl> --steps steps.json
```
- 봇은 승률·픽률·난이도 곡선을 재지만 **첫 인상·이해 실패·학습 곡선은 구조적으로 못 잰다.**
  봇 승률 ≠ 사람 승률이다(봇은 규칙을 알고 시작한다).
- RITE 루프: 3명 → **수정** → 3명. 회차 사이에 안 고치면 RITE가 아니다.
- **표본 수를 반드시 밝힌다.** 5명은 이슈의 55~95%를 잡는다(분산이 크다). "5명 봤는데 문제
  없음"은 "최대 45% 놓쳤을 수 있음"과 같은 말이다. 1명은 통과가 아니라 측정 불가다.
- FTUE는 **평균이 아니라 단계 퍼널**로 본다. 세션1→2 전환이 D1 리텐션의 선행지표다.
- 설문은 새로 만들지 말고 GEQ/PENS 중 골라 **어느 척도인지 적는다**. 자작 설문은 비교가 안 된다.
- 상세: `skills/playtest-capture/references/session-protocol.md`·`ftue-telemetry.md`

### 경제 검증 (8→9 게이트, core 통과 후에만)
```bash
node skills/econ-sim/scripts/econ-scaffold.mjs --out econ-sim
node econ-sim/econ-run.mjs --seed 7 --cohort 10000 --days 30
```
- **평균 1명을 시뮬하지 않는다.** 무과금/소과금/하이브리드/고래를 따로 돌려야 "무과금도 완주
  가능한가"에 답할 수 있다. 평균으로 뭉개면 격차가 사라지고 그게 판정 대상이다.
- 자동 판정: 무과금 완주율·완주 소요 일수(완주자 0이면 페이월)·진행 막힘 비율·
  **페이투윈 격차**(최다 과금 진행도 ÷ 무과금)·D1 리텐션·재화 수지.
- **컴플라이언스와 다크패턴은 시뮬로 판정되지 않는다.** 확률 공개(한국 등 법적 의무)·미성년
  지출 보호는 사람이 확인하고, 출시 전 실제 법률 검토가 필요하다.
- 페르소나 파라미터는 **가정**이다. 하네스는 그 가정의 타당성을 검증하지 못한다.

### 연출 (P1·P2 게이트) — 도구 2종
```bash
# 연출 상수 감사 — 논리 모순·예산 초과·접근성 누락
node skills/polish/scripts/feel-audit.mjs <feel.json>

# 광과민성 플래시 안전 판정 — **안전 게이트**
node skills/polish/scripts/flash-check.mjs <fx manifest.json>
node skills/polish/scripts/flash-check.mjs <프레임폴더> --fps 30 --loop
```
- 연출 상수는 `feel.json` 한 곳에 모은다(뼈대: `art-direction/references/starter-kit/feel.json`).
  코드에 숫자를 따로 박아두면 감사가 장식이 된다.
- `feel-audit`의 **미달**은 취향이 아니라 틀린 것이다 — 무게역전(강한 쪽이 더 약함) ·
  예산초과(피드백이 액션 간격을 넘어 다음 입력이 묻힘) · 접근성(모션 감소 경로 없음).
  **경고**는 업계 관행 이탈이라 게이트를 막지 않는다 — 이유를 한 줄 적으면 된다.
- `flash-check`는 **WCAG 2.3.1**(1초 안 3회 초과 금지) 판정이다. 광과민성 발작은 실제로
  사람을 해치고 콘솔 심의도 같은 종류를 본다 — **미달은 출하 차단 사유로 다룬다.**
  `조건부`는 면적이 25% 이하라 화면 크기에 따라 면제될 수 있다는 뜻이고, 그 판단은 사람이 한다.
- **"느낌이 좋은가"는 두 도구 다 판정하지 않는다.** 사람 사인오프가 P1·P2 게이트의 본체다.

### 기획 게이트 (1→2)
`gdd-completeness-checker` 스킬로 검수한다. 수치 근거 등급·미결·지표 정의 외에 세 가지를 본다:
- **필러 ↔ 기능 추적성**: 필러 3~4개, 모든 기능이 최소 1개 필러에 걸려야 한다.
  어떤 필러도 지지하지 않는 기능은 컷 후보다 — **필러는 기능을 거절하는 도구다.**
- **컷 규칙**: 일정이 밀렸을 때 버릴 순서가 미리 정해져 있나.
- **문서 비대함**: 빠진 것만 보면 절반이다. 주 단위로 갱신 가능한 분량인가, 이중 관리는 없나.

## 아트 게이트
- 아트 제작 전 `VISUAL_DESIGN.md` 또는 동등한 시각 기준을 만든다.
- 에셋은 stable ID, 승인 상태, 출처/라이선스, 최종 파일 경로를 manifest에 남긴다.
- 스프라이트는 seed frame 승인 후 시트/스트립으로 만들고, 프레임 크기·피벗·baseline을 통일한다.
- UI 아트는 HUD, 버튼, 카드, 아이콘, 상태/피해 숫자의 상태별 변형과 작은 화면 가독성을 확인한다.
- 3D 에셋은 scale, pivot, material name, collision proxy, LOD/export format을 엔진 반영 전에 확인한다.
- visual-qa는 실제 게임 화면, 가장 작은 목표 화면, 바쁜 전투/상태 화면에서 증거를 남긴다.

## 아트 트랙 운용 (Codex에 가장 잘 맞는 구간)

**아트 도구는 전부 의존성 0의 결정론적 Node 스크립트다.** 모델이 결과를 만들지 않으므로
Codex에서 그대로 돌고, 결과가 하네스에 따라 달라지지 않는다. 손으로 묘사하지 말고 도구를 써라.

### 생성
```bash
# UI 스프라이트 (버튼·패널·프레임·바) — 9-slice 보더까지 든 PNG + manifest
node skills/ui-art-system/scripts/ui-kit-gen.mjs <ui-spec.json> --out out
# 이펙트 시퀀스 + 스트립 시트
node skills/fx-art-system/scripts/fx-gen.mjs <fx-spec.json> --out out
# 스프라이트 정규화·컷아웃·아틀라스 (char-art-system 에 모여 있다)
node skills/char-art-system/scripts/sprite-normalize.mjs frames --out normalized
node skills/char-art-system/scripts/cutout.mjs <폴더> --out cut
node skills/char-art-system/scripts/atlas-pack.mjs normalized --out atlas.png --trim
```
출발 스펙은 `skills/art-direction/references/starter-kit/`에 있다(`ui-spec.json`·`fx-spec.json`).
**색은 `@group.key` 토큰만 쓴다.** hex를 스펙에 박으면 `palette.json`이 정본이 아니게 된다.

### 레퍼런스 측정 (감으로 정하지 않는다)
```bash
node skills/art-direction/scripts/ref-classify.mjs <폴더> --out classify --sort sorted
node skills/art-direction/scripts/contact-sheet.mjs sorted --out sheet.png
node skills/art-direction/scripts/ref-analyze.mjs sorted/<라벨> --out ref-analysis   # -> profile.json
node skills/art-direction/scripts/style-score.mjs <생성폴더> --profile ref-analysis/profile.json \
  --palette <palette.json> --pass 70
```
`ref-classify`를 건너뛰면 "이 게임의 그림"이 아니라 "리소스 폴더 평균"이 나온다.

### 판정 — **한 명령으로 모은다** (공동 컨트롤 표면)
```bash
node scripts/art-gate.mjs --init            # 프로젝트에 art-gate.json 생성 (커밋한다)
node scripts/art-gate.mjs --out art-out     # CVD·오버플로·회귀·규격·예산 한 번에
```
Claude Code 세션과 **같은 명령**이다. 리포트에 어느 하네스에서 돌렸는지와 대상 커밋이 박히므로
두 세션의 판정을 비교할 수 있다. 종료 코드 0 충족 / 1 미달 / 3 측정 불가.

**작업 시작 전에 한 번 돌려라.** 남이 깨놓은 걸 내가 깬 것으로 오해하지 않으려면 그게 먼저다.
그리고 `state.json` 의 `openGates` 를 직접 읽어라 — Codex 는 자동 주입이 없다.

개별 도구를 따로 돌릴 수도 있다:

### 판정 3종 — **게이트 근거는 이 출력이다**
```bash
# 색각이상에서 색 신호가 살아 있나 (0 충족 / 1 미달)
node skills/visual-qa/scripts/cvd-check.mjs <palette.json>
node skills/visual-qa/scripts/cvd-check.mjs <palette.json> --image screen.png --out dir

# 텍스트가 슬롯에 들어가나 (0 충족 / 1 미달 / 3 측정 불가)
node skills/ui-art-system/scripts/pseudo-loc.mjs <strings.json> --spec <ui-spec.json>

# 재생성이 규격을 바꿨나 (0 충족·조건부 / 1 미달)
node skills/asset-pipeline/scripts/asset-baseline.mjs snap  <에셋폴더> --out baseline.json
node skills/asset-pipeline/scripts/asset-baseline.mjs check <에셋폴더> --baseline baseline.json

# 용량·텍스처 메모리 예산 (실서비스 출구 게이트)
node skills/asset-budget/scripts/scan-textures.mjs <경로>
```
- **팔레트를 고치거나 확정할 때마다 `cvd-check`를 돌린다.** 색각이상 구분은 눈으로 판정할 수 없다.
- 한국어는 **짧은** 언어다. 한국어로 폭을 맞추면 영어·독일어(+20~35%)에서 터진다 —
  `pseudo-loc`이 "영문이 원문보다 15% 이상 넓은 문자열"을 따로 뽑아준다.
- 에셋 재생성 전에 `snap`, 후에 `check`. 크기·피벗·9-slice가 바뀌면 엔진에서 정렬이 깨지는데
  눈으로는 안 보인다.

## 완료 보고 규칙 (훅이 없으므로 더 엄격하다)

Claude Code 세션은 하네스가 시드·판수·커밋을 출력에 박아준다. **Codex에는 그게 없어서 손으로
채워야 하고, 손으로 적는 칸이 늘면 위조 여지도 늘어난다.** 그래서 규칙을 좁힌다.

- **도구 출력을 그대로 붙인다. 요약해서 옮겨 적지 않는다.** 요약은 증거가 아니다.
- 판정 도구는 전부 종료 코드를 낸다: `0` 충족 / `1` 미달 / `3` 측정 불가.
  **`3`을 `1`로 보고하지 마라** — 미달은 기획으로, 측정 불가는 도구·표본으로 되돌아간다.
- 대상 커밋을 직접 적는다: `git rev-parse --short HEAD`. 없으면 다음 회차와 비교할 수 없다.
- 5섹션(주장·증거·기준·공백·잔여 위험)을 채운다. 상세는 `ORCHESTRATION.md` §5.
  **[공백]을 비우면 "전부 검증했다"는 주장이 된다.**
- 안 돌린 검증을 통과로 쓰지 않는다. 안 돌렸으면 판정이 아니라 미실행이다.

## 엔진 연동
- Unity 프로젝트는 Unity MCP가 연결되어 있으면 에디터 작업, 테스트, 빌드 확인에 활용한다.
- 자동 플레이/강화학습 기반 검증이 필요한 Unity 프로젝트는 Unity ML-Agents 도입을 검토한다.
- Godot, Unreal, Web 프로젝트는 먼저 로컬 실행/테스트 명령을 확인하고, MCP는 선택 확장으로 둔다.

## 작업 원칙
- 저장소 원본이나 원격 GitHub에 자동 반영하지 않는다.
- 밸런스 수치는 코드에 흩뿌리지 않고 데이터 객체나 테이블에 모은다.
- 전투/런 로직은 UI와 분리해 헤드리스 시뮬레이션이 가능하게 한다.
- 완료 보고는 실행, 테스트, 시뮬레이션 등 확인 가능한 근거와 함께 한다.
