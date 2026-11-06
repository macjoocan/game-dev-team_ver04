# ④ 게임성 검증 규칙 변경 Implementation Plan

2026-11-05: v0.51.0에서 구현했다. 아래 체크박스와 버전·CI 번호는 당시 계획을 보존한 것이다. 현재 검증은 `test/gameplay-gate.test.mjs`와 `.github/workflows/validate.yml`을 따른다. 필수 소비량 합산과 빈 모델 차단은 구현 과정에서 보완했다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 밸런스 시뮬을 ④ 게이트에서 내리고, 자동으로 도는 것은 판수 0의 "논리적 클리어 가능성" 검사만 남기며, 사람 플레이를 ④ 통과 판정으로 올린다.

**Architecture:** 판정기는 플러그인이 소유하고 프로젝트는 어댑터 한 장만 채운다(`art-gate` 패턴). 시뮬 실행 예산은 훅이 아니라 `run.mjs` 자신이 강제하므로 Claude Code·Codex·사람 터미널에서 똑같이 동작한다(ORCHESTRATION §10 "같은 도구"). 예산 카운터는 별도 상태 파일 없이 사람이 읽는 `playfeel.md` 로그에서 파생된다.

**Tech Stack:** Node 20, 의존성 0(내장 모듈만). 테스트 프레임워크 없음 — **테스트는 `.github/workflows/validate.yml` 의 CI 스텝**이고 `node scripts/ci-local.mjs --only N` 으로 로컬에서 `bash -e` 동일 조건으로 돌린다.

**Spec:** `docs/superpowers/specs/2026-09-23-gameplay-gate-redesign-design.md`

## Global Constraints

- 종료 코드 계약: `0` 충족 · `1` 미달 · `2` 사용법 오류 · `3` 측정 불가. 다른 값 금지.
- 의존성 0. `node:` 내장 모듈만 import 한다. `package.json` 을 만들지 않는다.
- 레포 루트가 정본. `plugins/game-dev-team/` 은 미러이며 **직접 수정 금지** — `scripts/sync-plugin.ps1` 로 재생성한다.
- 기능 변경 후 `node scripts/validate-plugin.mjs` 통과해야 한다.
- CI 를 건드리면 `node scripts/ci-local.mjs` 로 `bash -e` 조건에서 확인한다. `cmd; code=$?` 금지 — `code=0; cmd || code=$?` 형태만 쓴다(validate-plugin §9 가 막는다).
- 버전 bump 시 `.claude-plugin/plugin.json` 과 `.codex-plugin/plugin.json` **둘 다** 갱신.
- 커밋은 `git add <경로>` 로 **경로를 명시**한다. `git add -A` 금지(여러 세션이 같은 레포를 쓴다).
- `scripts/*.ps1` 은 ASCII 전용(이 계획에서는 .ps1 을 만들지 않는다).
- 새 판정 도구(`exit 3` 계약)는 `AGENTS.md` 에 쓰지 않으면 `validate-plugin` §7b-2 가 막는다. 스킬 스크립트는 소속 `SKILL.md` 에도 있어야 한다(§7b).
- 게임 프로젝트가 아니면 소음 0 — 입력 파일이 없으면 조용히 통과하거나 `exit 3` 로 명시한다. 절대 스택트레이스를 내지 않는다.
- **태스크는 순서대로 한다.** 각 태스크가 CI 스텝을 하나씩 뒤에 붙이므로 `ci-local --only N` 의 번호가 순서에 의존한다. 현재 14 스텝 → Task 1 이 15, Task 2 가 16, Task 3 이 17 을 만든다. 순서를 바꾸면 `node scripts/ci-local.mjs --list` 로 번호를 다시 확인한다.
- Task 3 은 Task 2 의 `lib-playfeel.mjs` 를 import 한다 — **Task 2 없이 Task 3 을 먼저 하지 마라.**

## Review Focus

스펙이 함의하지만 어느 태스크의 테스트도 건드리지 않는 입력들. 각 줄의 테스트를 해당 태스크에 넣었다.

1. **`playfeel.md` 의 CRLF 줄바꿈** — 이 레포는 Windows 에서 개발되고 `autocrlf` 가 켜져 있다. 로컬은 CRLF, CI 는 LF 다. 마커 파싱이 `\r` 를 못 견디면 **로컬에서만 예산이 안 세지고 아무도 모른다.** → Task 2 Step 1 (`run.mjs` 도 같은 `lib-playfeel.mjs` 를 쓰므로 Task 3 이 이 테스트를 상속한다 — 그래서 복붙하지 않고 모듈로 뺐다).
2. **사람이 손으로 편집한 `playfeel.md`** — 사람이 읽고 쓰라고 만든 파일이므로 형식 파괴는 반드시 생긴다. 깨진 줄은 무시하고 마커만 세야 하며, 절대 throw 하면 안 된다. → Task 2 Step 7.
3. **프로젝트 `clearability.mjs` 가 throw 하거나 import 에 실패** — 프로젝트 코드는 플러그인이 통제하지 못한다. 스택트레이스가 아니라 `exit 3` 이어야 한다. → Task 1 Step 9.
4. **`require` 가 `supply` 에 없는 자원을 요구** — 키 오타는 흔하고, 조용히 0 으로 취급하면 "공급 0 < 요구" 로 **미달처럼 보이지만 실제로는 매핑 버그**다. 별도로 보고해야 한다. → Task 1 Step 7.
5. **자기 자신을 요구하는 잠금(A needs A)** — 길이 1 의 순환. 일반 순환 탐지가 자기 루프를 놓치는 건 흔한 버그다. → Task 1 Step 5.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `skills/balance-sim/scripts/clearability-check.mjs` | **판정기.** 프로젝트 어댑터를 불러 3축(자원 수지·도달성·순서)을 검사하고 5섹션 리포트 + 종료 코드를 낸다. 플러그인 소유 |
| `skills/balance-sim/scripts/templates/clearability.mjs` | **어댑터 템플릿.** 프로젝트 `sim/clearability.mjs` 로 복사된다. 프로젝트가 실제 테이블 → 요구/공급 매핑을 채운다 |
| `skills/balance-sim/scripts/templates/run.mjs` | (수정) 시작 시 `playfeel.md` 예산 검사 |
| `skills/balance-sim/scripts/sim-scaffold.mjs` | (수정) `clearability.mjs` 를 복사 목록에 추가 |
| `skills/playtest-capture/scripts/playfeel.mjs` | **장부.** `record` 로 한 줄 기록 + 수치 변경 자동 첨부, `log` 로 조회. 예산 리셋이 여기서 일어난다 |
| `skills/playtest-capture/scripts/lib-playfeel.mjs` | 파싱 공용 모듈. `playfeel.mjs` 와 프로젝트 `run.mjs` 가 **같은 규칙**으로 세도록 한 곳에 둔다 |

`lib-playfeel.mjs` 를 따로 두는 이유: 세는 규칙이 두 곳(`playfeel log`, `run.mjs` 예산)에 필요한데, 복붙하면 한쪽만 고쳐져 **예산이 조용히 어긋난다.** `run.mjs` 는 프로젝트로 복사되므로 스캐폴드가 이 파일도 같이 복사한다(`lib-stats.mjs` 와 같은 방식).

---

### Task 1: `clearability` — 논리적 클리어 가능성 판정기

**Files:**
- Create: `skills/balance-sim/scripts/clearability-check.mjs`
- Create: `skills/balance-sim/scripts/templates/clearability.mjs`
- Modify: `skills/balance-sim/scripts/sim-scaffold.mjs:40` (fromTemplates 배열)
- Modify: `skills/balance-sim/SKILL.md` (도구 문서화 — §7b 가 강제)
- Modify: `AGENTS.md` (판정 도구 — §7b-2 가 강제)
- Test: `.github/workflows/validate.yml` 새 스텝 "클리어 가능성 판정 (3축 · 어댑터 계약)"

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - 프로젝트 어댑터 계약: `sim/clearability.mjs` 가 `export const PLACEHOLDER: boolean` 과 `export function model(): Model` 을 낸다.
  - `Model = { supply: Record<string, number>, require: Array<{id: string, needs: Record<string, number>}>, locks: Array<{id: string, needs: string[]}>, order: Array<[string, string]> }`
  - 네 필드 모두 선택 — 없으면 그 축은 검사에서 빠지고 리포트 `[공백]` 에 "미제공"으로 남는다.
  - CLI: `node clearability-check.mjs <어댑터경로> [--out dir]`

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 어댑터가 없을 때 exit 3**

`.github/workflows/validate.yml` 의 마지막 스텝 뒤에 추가:

```yaml
      # 클리어 가능성은 ④에서 자동으로 도는 유일한 검사다. 오작동 비용이 크다.
      - name: 클리어 가능성 판정 (3축 · 어댑터 계약)
        run: |
          repo="$PWD"
          box="$(mktemp -d)"
          CC="$repo/skills/balance-sim/scripts/clearability-check.mjs"

          # 어댑터가 없으면 측정 불가(3). 통과(0)가 아니다.
          code=0; node "$CC" "$box/nope.mjs" >/dev/null 2>&1 || code=$?
          test $code -eq 3 || { echo "FAIL: 어댑터 없는데 exit $code (3 이어야 한다)"; exit 1; }

          rm -rf "$box"
          echo "클리어 가능성 판정 통과"
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node scripts/ci-local.mjs --only 15`
Expected: FAIL — `clearability-check.mjs` 가 없어서 node 가 exit 1 을 내고 `test $code -eq 3` 이 걸린다.

- [ ] **Step 3: 판정기의 뼈대를 만든다 (어댑터 로딩 + exit 3)**

Create `skills/balance-sim/scripts/clearability-check.mjs`:

```js
#!/usr/bin/env node
// clearability-check.mjs - "구성이 모순돼서 논리적으로 클리어가 안 되는가"만 판정한다.
//   node clearability-check.mjs <프로젝트>/sim/clearability.mjs [--out dir]
//
// 종료 코드: 0 충족 · 1 미달(클리어 논리 불가) · 2 사용법 · 3 측정 불가
//
// 왜 이것만 보나 — 난이도는 봇 정책에 대해 상대적이라 시뮬로는 "사람에게 어려운가"를
// 못 잰다(판수를 늘려도 안 좁혀진다). "논리적으로 클리어 불가"는 플레이어 실력과
// 무관하고, 설계 데이터를 직접 보므로 모델 괴리도 우회한다. 상세: docs/superpowers/specs/.
//
// 의존성 없음.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const target = args[0];

if (!target || target.startsWith('--') || args.includes('-h') || args.includes('--help')) {
  console.log('usage: node clearability-check.mjs <sim/clearability.mjs> [--out dir]');
  process.exit(2);
}

/** 측정 불가로 끝낸다 — 미달이 아니다. 되돌릴 곳이 다르다(기획 vs 하네스). */
function unmeasurable(why, gaps = []) {
  console.log(`# 클리어 가능성 판정\n\n판정: **측정 불가**\n\n[주장] ${why}\n`);
  console.log('[증거] 없음 — 검사를 돌리지 못했다.');
  console.log('[기준] 자원 수지 · 도달성 · 순서 제약 세 축이 모두 통과해야 충족이다.');
  console.log('[공백] ' + (gaps.length ? gaps.join(' · ') : '어댑터를 읽지 못해 전부 미측정'));
  console.log('[잔여 위험] 클리어 불가가 있어도 지금은 알 수 없다.');
  process.exit(3);
}

const abs = path.resolve(target);
if (!fs.existsSync(abs)) {
  unmeasurable(`어댑터가 없다: ${target}`, [
    'node <플러그인>/skills/balance-sim/scripts/sim-scaffold.mjs --out sim 으로 생성해라',
  ]);
}

let mod;
try {
  mod = await import(pathToFileURL(abs).href);
} catch (e) {
  unmeasurable(`어댑터를 불러오지 못했다: ${e.message}`, ['sim/clearability.mjs 의 import 경로를 확인해라']);
}

if (mod.PLACEHOLDER !== false) {
  unmeasurable('어댑터가 아직 자리표시자다.', [
    'sim/clearability.mjs 의 model() 을 실제 테이블로 채우고 PLACEHOLDER 를 false 로 바꿔라',
  ]);
}

let model;
try {
  model = mod.model();
} catch (e) {
  unmeasurable(`model() 이 예외를 던졌다: ${e.message}`, ['어댑터 매핑을 확인해라']);
}
if (!model || typeof model !== 'object') {
  unmeasurable('model() 이 객체를 내지 않았다.');
}

// 3축 검사는 Step 4~7 에서 채운다.
console.log('# 클리어 가능성 판정\n\n판정: **충족**\n');
process.exit(0);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node scripts/ci-local.mjs --only 15`
Expected: PASS — `클리어 가능성 판정 통과`

- [ ] **Step 5: 도달성 축의 실패 테스트를 쓴다 (순환 + 자기 루프)**

같은 CI 스텝의 `rm -rf "$box"` 앞에 추가:

```bash
          mk() { # $1 = 파일, $2 = model 본문
            printf 'export const PLACEHOLDER = false;\nexport function model() { return %s; }\n' "$2" > "$1"
          }

          # 잠금 순환 A<->B 는 미달(1)
          mk "$box/cycle.mjs" '{ locks: [{id:"a",needs:["b"]},{id:"b",needs:["a"]}] }'
          code=0; node "$CC" "$box/cycle.mjs" > "$box/cycle.md" 2>&1 || code=$?
          test $code -eq 1 || { echo "FAIL: 잠금 순환인데 exit $code (1 이어야 한다)"; cat "$box/cycle.md"; exit 1; }
          grep -q '순환' "$box/cycle.md" || { echo "FAIL: 리포트에 순환 경로가 없다"; exit 1; }

          # 자기 자신을 요구하는 잠금(길이 1 순환)도 잡아야 한다 — 일반 순환 탐지가 놓치기 쉽다
          mk "$box/self.mjs" '{ locks: [{id:"a",needs:["a"]}] }'
          code=0; node "$CC" "$box/self.mjs" >/dev/null 2>&1 || code=$?
          test $code -eq 1 || { echo "FAIL: 자기 루프인데 exit $code (1 이어야 한다)"; exit 1; }

          # 순환 없으면 충족(0)
          mk "$box/ok.mjs" '{ locks: [{id:"a",needs:[]},{id:"b",needs:["a"]}] }'
          code=0; node "$CC" "$box/ok.mjs" >/dev/null 2>&1 || code=$?
          test $code -eq 0 || { echo "FAIL: 정상 잠금인데 exit $code (0 이어야 한다)"; exit 1; }
```

- [ ] **Step 6: 실패를 확인하고 도달성 축을 구현한다**

Run: `node scripts/ci-local.mjs --only 15` → FAIL (순환인데 exit 0)

`clearability-check.mjs` 의 `// 3축 검사는 Step 4~7 에서 채운다.` 를 아래로 바꾼다:

```js
const fails = [];   // 미달 사유
const gaps = [];    // 측정하지 못한 축

// ── 축 1: 도달성 — 잠금 그래프에 순환이 있으면 어느 쪽도 못 연다 ──────────
// 자기 루프(a needs a)는 길이 1 의 순환이다. 일반 DFS 가 방문 표시를 먼저 하면
// 놓치기 쉬워서, 간선을 따라가기 전에 self 를 먼저 본다.
const locks = Array.isArray(model.locks) ? model.locks : null;
if (!locks) gaps.push('잠금 그래프(locks) 미제공 — 도달성 미측정');
else {
  const edges = new Map(locks.map((l) => [l.id, Array.isArray(l.needs) ? l.needs : []]));
  for (const [id, needs] of edges) {
    if (needs.includes(id)) fails.push(`잠금 순환(자기 자신): \`${id}\` 가 \`${id}\` 를 요구한다`);
  }
  const state = new Map();   // 0 미방문 · 1 탐색중 · 2 완료
  const stack = [];
  const walk = (id) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      const at = stack.indexOf(id);
      fails.push('잠금 순환: ' + stack.slice(at).concat(id).map((x) => `\`${x}\``).join(' -> '));
      return;
    }
    state.set(id, 1); stack.push(id);
    for (const n of edges.get(id) || []) { if (n !== id && edges.has(n)) walk(n); }
    stack.pop(); state.set(id, 2);
  };
  for (const id of edges.keys()) walk(id);

  const unknown = locks.flatMap((l) => (l.needs || []).filter((n) => !edges.has(n)));
  if (unknown.length) gaps.push(`잠금이 요구하는 미정의 항목: ${[...new Set(unknown)].join(', ')}`);
}
```

그리고 파일 끝의 `console.log(... 충족 ...)` 을 Step 8 의 리포트 출력으로 바꾼다(아직은 남겨둔다).

- [ ] **Step 7: 자원 수지 축의 실패 테스트를 쓰고 구현한다**

CI 스텝에 추가:

```bash
          # 요구 > 공급 은 미달(1)
          mk "$box/short.mjs" '{ supply:{damage:420}, require:[{id:"boss",needs:{damage:500}}] }'
          code=0; node "$CC" "$box/short.mjs" > "$box/short.md" 2>&1 || code=$?
          test $code -eq 1 || { echo "FAIL: 자원 부족인데 exit $code"; cat "$box/short.md"; exit 1; }
          grep -q '420' "$box/short.md" || { echo "FAIL: 리포트에 실제 수치가 없다"; exit 1; }

          # supply 에 없는 키를 require 가 요구하면 **미달이 아니라 측정 불가**(3).
          # 0 으로 취급하면 매핑 오타가 밸런스 미달처럼 보인다.
          mk "$box/typo.mjs" '{ supply:{damage:420}, require:[{id:"boss",needs:{dmg:500}}] }'
          code=0; node "$CC" "$box/typo.mjs" > "$box/typo.md" 2>&1 || code=$?
          test $code -eq 3 || { echo "FAIL: 미정의 자원인데 exit $code (3 이어야 한다)"; cat "$box/typo.md"; exit 1; }
          grep -q 'dmg' "$box/typo.md" || { echo "FAIL: 어떤 키가 없는지 안 알려준다"; exit 1; }
```

Run: `node scripts/ci-local.mjs --only 15` → FAIL

도달성 축 뒤에 추가:

```js
// ── 축 2: 자원 수지 — 요구 총합이 공급을 넘으면 논리적으로 클리어 불가 ────
const supply = model.supply && typeof model.supply === 'object' ? model.supply : null;
const require_ = Array.isArray(model.require) ? model.require : null;
if (!supply || !require_) gaps.push('공급(supply)/요구(require) 미제공 — 자원 수지 미측정');
else {
  const undef = new Set();
  for (const r of require_) {
    for (const [k, v] of Object.entries(r.needs || {})) {
      if (!(k in supply)) { undef.add(k); continue; }   // 0 으로 치지 않는다 — 오타를 미달로 위장하게 된다
      if (supply[k] < v) {
        fails.push(`자원 부족: \`${r.id}\` 가 ${k} ${v} 를 요구하는데 획득 가능 총량은 ${supply[k]} 다`);
      }
    }
  }
  if (undef.size) {
    unmeasurable(
      `요구가 공급에 없는 자원을 가리킨다: ${[...undef].join(', ')}`,
      ['sim/clearability.mjs 의 supply 키와 require.needs 키가 같은 이름인지 확인해라 (오타일 확률이 높다)'],
    );
  }
}
```

- [ ] **Step 8: 순서 제약 축 + 5섹션 리포트를 구현하고 테스트한다**

CI 스텝에 추가:

```bash
          # 순서 제약 순환은 미달(1)
          mk "$box/ord.mjs" '{ order: [["a","b"],["b","a"]] }'
          code=0; node "$CC" "$box/ord.mjs" >/dev/null 2>&1 || code=$?
          test $code -eq 1 || { echo "FAIL: 순서 순환인데 exit $code"; exit 1; }

          # 정상 모델은 5섹션 리포트를 낸다
          mk "$box/full.mjs" '{ supply:{damage:600}, require:[{id:"boss",needs:{damage:500}}], locks:[{id:"a",needs:[]}], order:[["a","boss"]] }'
          code=0; node "$CC" "$box/full.mjs" > "$box/full.md" 2>&1 || code=$?
          test $code -eq 0 || { echo "FAIL: 정상 모델인데 exit $code"; cat "$box/full.md"; exit 1; }
          for s in '\[주장\]' '\[증거\]' '\[기준\]' '\[공백\]' '\[잔여 위험\]'; do
            grep -q "$s" "$box/full.md" || { echo "FAIL: 5섹션 중 $s 가 없다"; exit 1; }
          done
```

Run: `node scripts/ci-local.mjs --only 15` → FAIL

자원 수지 축 뒤에 추가하고, 파일 끝의 임시 `console.log` 를 지운다:

```js
// ── 축 3: 순서 제약 — 위상 정렬이 안 되면 진행 순서가 성립하지 않는다 ─────
const order = Array.isArray(model.order) ? model.order : null;
if (!order) gaps.push('순서 제약(order) 미제공 — 순서 미측정');
else {
  const adj = new Map(), indeg = new Map();
  for (const [a, b] of order) {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
    indeg.set(b, (indeg.get(b) || 0) + 1);
    if (!indeg.has(a)) indeg.set(a, 0);
  }
  const q = [...indeg].filter(([, d]) => d === 0).map(([k]) => k);
  let seen = 0;
  while (q.length) {
    const cur = q.shift(); seen++;
    for (const nx of adj.get(cur) || []) {
      indeg.set(nx, indeg.get(nx) - 1);
      if (indeg.get(nx) === 0) q.push(nx);
    }
  }
  if (seen !== indeg.size) {
    const stuck = [...indeg].filter(([, d]) => d > 0).map(([k]) => `\`${k}\``);
    fails.push(`순서 제약 순환: ${stuck.join(' · ')} 가 서로를 기다린다`);
  }
}

// ── 리포트 ───────────────────────────────────────────────────────────────
const verdict = fails.length ? '미달' : '충족';
const measured = ['도달성', '자원 수지', '순서 제약'].filter(
  (_, i) => !gaps.some((g) => g.includes(['잠금', '공급', '순서'][i])),
);
console.log('# 클리어 가능성 판정\n');
console.log(`판정: **${verdict}**\n`);
console.log('[주장] ' + (fails.length
  ? `구성이 모순돼 논리적으로 클리어할 수 없다 (${fails.length}건).`
  : '검사한 축에서 논리적 클리어 불가를 찾지 못했다.'));
console.log('[증거] ' + (fails.length ? '\n' + fails.map((f) => `  - ${f}`).join('\n') : `측정한 축: ${measured.join(' · ') || '없음'}`));
console.log('[기준] 자원 수지(요구 <= 공급) · 도달성(잠금 그래프 비순환) · 순서 제약(위상 정렬 가능).');
console.log('[공백] ' + (gaps.length ? gaps.join(' · ') : '없음'));
console.log('[잔여 위험] 논리적으로 가능해도 **실질적으로 불가능한 경우**(반응시간이 비현실적인 패턴, '
  + '완벽한 플레이로만 맞는 수지)는 이 도구가 판정하지 않는다. 사람 플레이가 잡는다.');
process.exit(fails.length ? 1 : 0);
```

Run: `node scripts/ci-local.mjs --only 15` → PASS

- [ ] **Step 9: 어댑터가 throw 할 때 스택트레이스를 안 내는지 테스트한다**

CI 스텝에 추가:

```bash
          # 프로젝트 코드가 던져도 스택트레이스가 아니라 측정 불가(3)
          printf 'export const PLACEHOLDER = false;\nexport function model() { throw new Error("테이블 없음"); }\n' > "$box/boom.mjs"
          out=$(node "$CC" "$box/boom.mjs" 2>&1 || true)
          case "$out" in *"node:internal"*|*"    at "*) echo "FAIL: 스택트레이스를 낸다"; echo "$out" | head -3; exit 1;; esac
          code=0; node "$CC" "$box/boom.mjs" >/dev/null 2>&1 || code=$?
          test $code -eq 3 || { echo "FAIL: 어댑터 예외인데 exit $code (3 이어야 한다)"; exit 1; }
```

Run: `node scripts/ci-local.mjs --only 15`
Expected: PASS (Step 3 의 try/catch 가 이미 처리한다 — 회귀 방지용 테스트다)

- [ ] **Step 10: 어댑터 템플릿을 만든다**

Create `skills/balance-sim/scripts/templates/clearability.mjs`:

```js
// clearability.mjs - 이 게임의 "논리적 클리어 가능성"을 판정기에 넘기는 어댑터.
//
// 판정기는 게임을 모른다. 여기서 **실제 밸런스 테이블을 읽어** 요구/공급으로 옮긴다.
// 수치를 여기에 베껴 적지 마라 — 테이블이 바뀌면 검사가 조용히 거짓말을 한다.
//
// 돌리기: node <플러그인>/skills/balance-sim/scripts/clearability-check.mjs sim/clearability.mjs

// import { STAGES, ITEMS } from '../src/data/stages.js';   // <- 실제 테이블

/** 채우고 나면 false 로 바꿔라. true 인 동안 판정은 "측정 불가"다. */
export const PLACEHOLDER = true;

export function model() {
  return {
    // 게임 전체에서 획득 가능한 자원 총량. 네 필드 모두 선택이다.
    supply: { /* damage: totalDamage(STAGES), keys: countKeys(STAGES) */ },

    // 클리어에 필요한 관문과 그 요구량.
    require: [
      // { id: 'boss', needs: { damage: 500 } },
    ],

    // 잠금 그래프. 순환하면 어느 쪽도 못 연다.
    locks: [
      // { id: 'door2', needs: ['key1'] },
    ],

    // 진행 순서 제약 [먼저, 나중]. 위상 정렬이 안 되면 미달이다.
    order: [
      // ['tutorial', 'stage1'],
    ],
  };
}
```

- [ ] **Step 11: 스캐폴드에 배선하고 왕복을 테스트한다**

Modify `skills/balance-sim/scripts/sim-scaffold.mjs:40` — `fromTemplates` 에 `'clearability.mjs'` 추가:

```js
const fromTemplates = ['rng.mjs', 'policies.mjs', 'game.mjs', 'targets.mjs', 'run.mjs', 'curve-check.mjs', 'clearability.mjs', 'README.md'];
```

기존 CI 스텝 4(밸런스 하네스 왕복)의 파일 목록에 추가:

```bash
          for f in run.mjs curve-check.mjs rng.mjs policies.mjs game.mjs targets.mjs lib-stats.mjs clearability.mjs README.md; do
```

그리고 스텝 15 끝(`rm -rf "$box"` 앞)에 자리표시자 왕복 추가:

```bash
          # 스캐폴드가 깐 자리표시자 어댑터는 측정 불가(3) 여야 한다
          sbox="$(mktemp -d)"; cd "$sbox"
          node "$repo/skills/balance-sim/scripts/sim-scaffold.mjs" --out sim >/dev/null
          code=0; node "$CC" sim/clearability.mjs >/dev/null 2>&1 || code=$?
          test $code -eq 3 || { echo "FAIL: 자리표시자 어댑터인데 exit $code (3 이어야 한다)"; exit 1; }
          cd "$repo"; rm -rf "$sbox"
```

Run: `node scripts/ci-local.mjs --only 4` 와 `--only 15`
Expected: 둘 다 PASS

- [ ] **Step 12: 입력-없음 계약 스텝에 등록한다**

Modify `.github/workflows/validate.yml` 스텝 10 — `check feel-audit` 줄 뒤에 추가하고 마지막 줄의 개수를 고친다:

```bash
          check clearability    node skills/balance-sim/scripts/clearability-check.mjs __none__/clearability.mjs
```
```bash
          echo "판정 도구 9종 입력-없음 계약 통과 (전부 exit 3)"
```

Run: `node scripts/ci-local.mjs --only 10`
Expected: PASS — `ok  clearability`

- [ ] **Step 13: 문서에 쓴다 (안 쓰면 validate-plugin 이 막는다)**

`skills/balance-sim/SKILL.md` 에 절을 추가한다 — §7b 가 `scripts/` 의 모든 파일을 SKILL.md/references 에서 찾는다:

```markdown
## 클리어 가능성 판정 — ④에서 자동으로 도는 유일한 검사

```bash
node <플러그인>/skills/balance-sim/scripts/clearability-check.mjs sim/clearability.mjs
```
`0` 충족 / `1` 미달(논리적 클리어 불가) / `3` 측정 불가.

**난이도는 판정하지 않는다.** 난이도는 봇 정책에 대해 상대적이라 판수를 늘려도
사람 난이도에 가까워지지 않는다. 여기서는 **구성이 모순돼서 클리어가 논리적으로
안 되는 경우**만 본다 — 자원 수지(요구 <= 공급) · 도달성(잠금 비순환) · 순서 제약.

프로젝트는 `sim/clearability.mjs` 에서 **실제 테이블을 읽어** 요구/공급으로 옮긴다.
수치를 베껴 적으면 테이블이 바뀔 때 검사가 조용히 거짓말을 한다.
```

`AGENTS.md` 의 "판정 도구" 절에 같은 명령과 한 줄 설명을 추가한다 — §7b-2 가 강제한다.

- [ ] **Step 14: 전체 검사 후 커밋**

```bash
node scripts/validate-plugin.mjs
node scripts/ci-local.mjs
```
Expected: validate 통과, ci-local 15/15 통과

미러를 재생성한 뒤(`scripts\sync-plugin.ps1`) 커밋:

```bash
git add skills/balance-sim/scripts/clearability-check.mjs \
        skills/balance-sim/scripts/templates/clearability.mjs \
        skills/balance-sim/scripts/sim-scaffold.mjs \
        skills/balance-sim/SKILL.md AGENTS.md \
        .github/workflows/validate.yml \
        plugins/game-dev-team
git commit -m "v0.35.0 (1/5): clearability — 논리적 클리어 가능성 판정 (판수 0)"
```

---

### Task 2: `playfeel` — 한 줄 로그이자 예산 장부

**Files:**
- Create: `skills/playtest-capture/scripts/lib-playfeel.mjs`
- Create: `skills/playtest-capture/scripts/playfeel.mjs`
- Modify: `skills/playtest-capture/SKILL.md`
- Modify: `AGENTS.md`
- Test: `.github/workflows/validate.yml` 새 스텝 "playfeel 장부 (기록 · 파싱 · 예산 계산)"

**Interfaces:**
- Consumes: 없음
- Produces:
  - `lib-playfeel.mjs` 가 내보내는 것 — Task 3 의 `run.mjs` 가 **이 두 개만** 쓴다:
    - `findLog(startDir: string): string | null` — `startDir` 에서 위로 올라가며 `playfeel.md` 를 찾는다. 없으면 `null`.
    - `simsSinceHuman(text: string): number` — 마지막 `[사람]` 줄 이후의 `[시뮬]` 줄 수. `[사람]` 이 하나도 없으면 전체 `[시뮬]` 줄 수.
    - `appendSim(logPath: string, line: string): void` — `[시뮬]` 줄을 현재 바퀴에 덧붙인다.
  - `playfeel.md` 위치: **프로젝트 루트** (`sim/` 아래가 아니다).
  - CLI: `playfeel.mjs record --felt "<한 문장>"` / `playfeel.mjs log`

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 파싱(LF·CRLF·깨진 줄)**

`.github/workflows/validate.yml` 에 새 스텝 추가:

```yaml
      # playfeel 은 사람이 읽고 쓰는 파일이자 예산 장부다. 파싱이 깨지면 예산이 조용히 샌다.
      - name: playfeel 장부 (기록 · 파싱 · 예산 계산)
        run: |
          repo="$PWD"
          box="$(mktemp -d)"
          LIB="$repo/skills/playtest-capture/scripts/lib-playfeel.mjs"
          PF="$repo/skills/playtest-capture/scripts/playfeel.mjs"

          # LF 와 CRLF 가 같은 값을 내야 한다. 이 레포는 Windows(autocrlf)에서 개발되고
          # CI 는 LF 다 — 여기서 갈리면 로컬에서만 예산이 안 세지고 아무도 모른다.
          export LIBPATH="$LIB"
          node --input-type=module -e "
            const { pathToFileURL } = await import('node:url');
            const { simsSinceHuman } = await import(pathToFileURL(process.env.LIBPATH).href);
            const body = ['#1', '    [사람] \"쉽다\"', '    [시뮬] a', '    [시뮬] b'];
            const lf = simsSinceHuman(body.join('\n'));
            const crlf = simsSinceHuman(body.join('\r\n'));
            if (lf !== 2) { console.error('FAIL: LF 에서 ' + lf + ' (2 여야 한다)'); process.exit(1); }
            if (crlf !== 2) { console.error('FAIL: CRLF 에서 ' + crlf + ' (2 여야 한다)'); process.exit(1); }
            // [사람] 이 없으면 전체를 센다
            if (simsSinceHuman('    [시뮬] a\n    [시뮬] b\n') !== 2) { console.error('FAIL: 사람 기록 없을 때'); process.exit(1); }
            // 마지막 [사람] 이후만 센다
            if (simsSinceHuman('[시뮬] a\n[사람] x\n[시뮬] b\n') !== 1) { console.error('FAIL: 리셋'); process.exit(1); }
            console.log('  ok  파싱 (LF · CRLF · 리셋)');
          "

          rm -rf "$box"
          echo "playfeel 장부 통과"
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node scripts/ci-local.mjs --only 16`
Expected: FAIL — `lib-playfeel.mjs` 가 없어서 import 가 터진다.

- [ ] **Step 3: 파싱 모듈을 만든다**

Create `skills/playtest-capture/scripts/lib-playfeel.mjs`:

```js
// lib-playfeel.mjs - playfeel.md 파싱 공용 모듈.
//
// 세는 규칙이 두 곳에 필요하다: playfeel log(사람이 본다)와 프로젝트 sim/run.mjs 의
// 예산 검사. 복붙하면 한쪽만 고쳐져 **예산이 조용히 어긋난다.** 그래서 한 파일이다.
//
// 의존성 없음.

import fs from 'node:fs';
import path from 'node:path';

export const HUMAN = '[사람]';
export const SIM = '[시뮬]';
export const LOG_NAME = 'playfeel.md';

/** startDir 에서 위로 올라가며 playfeel.md 를 찾는다. 없으면 null. */
export function findLog(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const p = path.join(dir, LOG_NAME);
    if (fs.existsSync(p)) return p;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** 줄 단위로 자른다. CRLF 도 LF 와 같게 취급한다(Windows 개발 · LF CI). */
function lines(text) {
  return String(text).split(/\r?\n/);
}

/**
 * 마지막 [사람] 줄 이후의 [시뮬] 줄 수.
 * [사람] 이 하나도 없으면 전체 [시뮬] 줄 수 — 첫 플레이 전에도 예산이 산다.
 * 형식이 깨진 줄은 무시한다. 사람이 손으로 고치는 파일이라 반드시 깨진다.
 */
export function simsSinceHuman(text) {
  let n = 0;
  for (const raw of lines(text)) {
    const s = raw.trim();
    if (s.startsWith(HUMAN)) n = 0;
    else if (s.startsWith(SIM)) n += 1;
  }
  return n;
}

/** 현재(마지막) 바퀴에 [시뮬] 줄을 덧붙인다. */
export function appendSim(logPath, line) {
  const body = fs.readFileSync(logPath, 'utf8');
  const sep = body.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(logPath, `${body}${sep}    ${SIM} ${line}\n`, 'utf8');
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node scripts/ci-local.mjs --only 16`
Expected: PASS — `ok  파싱 (LF · CRLF · 리셋)`

- [ ] **Step 5: `record` / `log` 의 실패 테스트를 쓴다**

CI 스텝의 `rm -rf "$box"` 앞에 추가:

```bash
          cd "$box"
          git init -q && git config user.email ci@x && git config user.name ci
          printf '{"hp":24}\n' > balance.json && git add -A && git commit -qm init

          # log 는 기록이 없으면 측정 불가(3)
          code=0; node "$PF" log >/dev/null 2>&1 || code=$?
          test $code -eq 3 || { echo "FAIL: 기록 없는데 exit $code (3 이어야 한다)"; exit 1; }

          # record 는 파일을 만들고 사람 기록을 남긴다
          node "$PF" record --felt "첫 판. 조작은 바로 이해됨" >/dev/null
          test -f playfeel.md || { echo "FAIL: playfeel.md 를 안 만들었다"; exit 1; }
          grep -q '\[사람\]' playfeel.md || { echo "FAIL: 사람 기록이 없다"; exit 1; }
          grep -q '첫 판' playfeel.md || { echo "FAIL: 문장이 안 들어갔다"; exit 1; }

          # 수치 변경을 자동으로 묶는다
          printf '{"hp":20}\n' > balance.json
          node "$PF" record --felt "아직 쉽다" >/dev/null
          grep -q 'balance.json' playfeel.md || { echo "FAIL: 변경된 파일을 안 묶었다"; exit 1; }

          # 바퀴 번호가 증가한다
          grep -q '^#2' playfeel.md || { echo "FAIL: 바퀴 번호가 안 늘었다"; cat playfeel.md; exit 1; }

          # log 는 이제 통과(0)
          code=0; node "$PF" log >/dev/null 2>&1 || code=$?
          test $code -eq 0 || { echo "FAIL: 기록이 있는데 log 가 exit $code"; exit 1; }
          cd "$repo"
```

- [ ] **Step 6: 실패를 확인하고 `playfeel.mjs` 를 만든다**

Run: `node scripts/ci-local.mjs --only 16` → FAIL

Create `skills/playtest-capture/scripts/playfeel.mjs`:

```js
#!/usr/bin/env node
// playfeel.mjs - 사람이 한 판 하고 남기는 한 줄 로그이자 시뮬 예산 장부.
//
//   node playfeel.mjs record --felt "2페이즈에서 손이 멈춤"
//   node playfeel.mjs log
//
// 종료 코드: 0 정상 · 2 사용법 · 3 측정 불가(기록이 없다)
//
// 왜 기록과 예산 리셋이 한 명령인가 — 따로 두면 "기록 없이 리셋"이 가능해진다.
// 사람이 쓰는 건 한 문장뿐이고, 무엇을 바꿨는지는 git 이 안다.
//
// 의존성 없음.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findLog, simsSinceHuman, HUMAN, LOG_NAME } from './lib-playfeel.mjs';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

if (!cmd || args.includes('-h') || args.includes('--help') || !['record', 'log'].includes(cmd)) {
  console.log('usage: node playfeel.mjs record --felt "<한 문장>"');
  console.log('       node playfeel.mjs log');
  process.exit(2);
}

const cwd = process.cwd();

if (cmd === 'log') {
  const p = findLog(cwd);
  if (!p) {
    console.log('# playfeel\n\n판정: **측정 불가**\n');
    console.log(`[주장] ${LOG_NAME} 이 없다 — 사람 플레이 기록이 하나도 없다.`);
    console.log('[공백] `playfeel.mjs record --felt "..."` 로 한 판 기록해라.');
    process.exit(3);
  }
  const text = fs.readFileSync(p, 'utf8');
  console.log(text.trimEnd());
  console.log(`\n-> ${path.relative(cwd, p) || LOG_NAME} · 마지막 플레이 이후 시뮬 ${simsSinceHuman(text)}회`);
  process.exit(0);
}

// record
const felt = opt('--felt', null);
if (!felt || !felt.trim()) {
  console.error('--felt "<한 문장>" 이 필요하다. 플레이하고 느낀 것을 사람 말로 적어라.');
  process.exit(2);
}

/** 무엇을 바꿨는지는 git 이 안다. 못 알면 조용히 비운다(게임 프로젝트가 아닐 수 있다). */
function changedFiles() {
  try {
    const out = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd, encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

const logPath = findLog(cwd) || path.join(cwd, LOG_NAME);
if (!fs.existsSync(logPath)) {
  fs.writeFileSync(logPath, '# playfeel — 플레이 감각 로그\n\n'
    + '사람이 한 판 하고 한 문장. 수치 변경은 git 에서 자동으로 묶는다.\n'
    + '`[시뮬]` 줄은 시뮬이 스스로 남긴다 — 마지막 `[사람]` 이후 2회를 넘으면 시뮬이 스스로 멈춘다.\n\n', 'utf8');
}

const body = fs.readFileSync(logPath, 'utf8');
const turn = (body.match(/^#(\d+)/gm) || []).reduce((m, s) => Math.max(m, Number(s.slice(1))), 0) + 1;
const changed = changedFiles();
const head = `#${turn}  ${changed.length ? changed.join(' · ') : '(변경 없음)'}`;
const sep = body.endsWith('\n') ? '' : '\n';

fs.writeFileSync(logPath, `${body}${sep}${head}\n    ${HUMAN} "${felt.trim()}"\n`, 'utf8');
console.log(`기록: #${turn} — 시뮬 예산이 리셋됐다(다음 2회까지).`);
console.log(`-> ${path.relative(cwd, logPath) || LOG_NAME}`);
```

Run: `node scripts/ci-local.mjs --only 16` → PASS

- [ ] **Step 7: 깨진 파일에도 안 터지는지 테스트한다**

CI 스텝에 추가:

```bash
          # 사람이 손으로 망친 파일에도 throw 하지 않는다 (읽고 쓰라고 만든 파일이다)
          cd "$box"
          printf 'garbage\n#없는번호\n   [사람\n[시뮬] x\n\0\n' > playfeel.md
          out=$(node "$PF" log 2>&1 || true)
          case "$out" in *"node:internal"*|*"    at "*) echo "FAIL: 깨진 파일에 스택트레이스"; exit 1;; esac
          out=$(node "$PF" record --felt "복구" 2>&1 || true)
          case "$out" in *"node:internal"*|*"    at "*) echo "FAIL: 깨진 파일에 record 가 터진다"; exit 1;; esac
          cd "$repo"
```

Run: `node scripts/ci-local.mjs --only 16`
Expected: PASS

- [ ] **Step 8: 입력-없음 계약 등록 + 문서 + 커밋**

스텝 10 에 추가하고 개수를 10 종으로 고친다:

```bash
          check playfeel        node skills/playtest-capture/scripts/playfeel.mjs log
```

> 주의: `playfeel log` 는 cwd 기준으로 찾는다. 이 스텝은 레포 루트에서 도는데 레포 루트에
> `playfeel.md` 가 없으므로 `exit 3` 이 맞다. 레포에 `playfeel.md` 를 만들지 마라.

`skills/playtest-capture/SKILL.md` 에 `playfeel` 절을 추가한다(§7b 가 `lib-playfeel.mjs` 도 찾으므로 **두 파일 다** 언급해야 한다). `AGENTS.md` 에도 같은 명령을 추가한다.

```bash
node scripts/validate-plugin.mjs && node scripts/ci-local.mjs
```

미러 재생성 후:

```bash
git add skills/playtest-capture/scripts/lib-playfeel.mjs \
        skills/playtest-capture/scripts/playfeel.mjs \
        skills/playtest-capture/SKILL.md AGENTS.md \
        .github/workflows/validate.yml \
        plugins/game-dev-team
git commit -m "v0.35.0 (2/5): playfeel — 한 줄 로그이자 시뮬 예산 장부"
```

---

### Task 3: `run.mjs` 예산 — 도구가 스스로 막는다

**Files:**
- Modify: `skills/balance-sim/scripts/templates/run.mjs` (import 블록 직후)
- Modify: `skills/balance-sim/scripts/sim-scaffold.mjs:41` (`fromPlugin` 에 `lib-playfeel.mjs`)
- Test: `.github/workflows/validate.yml` 새 스텝 "시뮬 예산 (플레이당 2회 · 리셋 · 침묵)"

**Interfaces:**
- Consumes: Task 2 의 `lib-playfeel.mjs` — `findLog(startDir)`, `simsSinceHuman(text)`, `appendSim(logPath, line)`
- Produces: `run.mjs` 가 예산 초과 시 `exit 3` + 본문에 `예산 차단` 문구. **5섹션 리포트를 내지 않는다** — 자리표시자(`exit 3` + `측정 불가` + 5섹션)와 구분되는 지점이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`.github/workflows/validate.yml` 에 새 스텝 추가:

```yaml
      # 예산은 훅이 아니라 도구가 강제한다 — Codex·Claude Code·사람 터미널에서 같게 돈다.
      - name: 시뮬 예산 (플레이당 2회 · 리셋 · 침묵)
        run: |
          repo="$PWD"
          box="$(mktemp -d)"
          PF="$repo/skills/playtest-capture/scripts/playfeel.mjs"
          cd "$box"
          git init -q && git config user.email ci@x && git config user.name ci
          echo x > a.txt && git add -A && git commit -qm init
          node "$repo/skills/balance-sim/scripts/sim-scaffold.mjs" --out sim >/dev/null

          # playfeel.md 가 없으면 예산 검사를 건너뛴다 (이 규칙을 안 쓰는 프로젝트에 소음 0).
          # 자리표시자라 3 이지만 본문은 '측정 불가' 여야 하고 '예산 차단' 이면 안 된다.
          code=0; node sim/run.mjs --seed 42 --runs 50 > r0.md 2>&1 || code=$?
          test $code -eq 3 || { echo "FAIL: 자리표시자인데 exit $code"; cat r0.md; exit 1; }
          grep -q '측정 불가' r0.md || { echo "FAIL: 자리표시자 리포트가 아니다"; exit 1; }
          grep -q '예산 차단' r0.md && { echo "FAIL: playfeel.md 도 없는데 예산으로 막았다"; exit 1; }

          # 사람 기록을 남기면 예산이 열린다
          node "$PF" record --felt "첫 판" >/dev/null
          for i in 1 2; do
            code=0; node sim/run.mjs --seed 42 --runs 50 > "r$i.md" 2>&1 || code=$?
            grep -q '예산 차단' "r$i.md" && { echo "FAIL: ${i}회째인데 막혔다"; cat "r$i.md"; exit 1; }
          done

          # 3회째는 막힌다
          code=0; node sim/run.mjs --seed 42 --runs 50 > r3.md 2>&1 || code=$?
          test $code -eq 3 || { echo "FAIL: 3회째인데 exit $code (3 이어야 한다)"; cat r3.md; exit 1; }
          grep -q '예산 차단' r3.md || { echo "FAIL: 예산 차단 문구가 없다"; cat r3.md; exit 1; }
          grep -q '\[주장\]' r3.md && { echo "FAIL: 예산 차단인데 5섹션 리포트를 냈다 (자리표시자와 구분 안 됨)"; exit 1; }

          # 시뮬이 자기 실행을 장부에 남겼는지
          test "$(grep -c '\[시뮬\]' playfeel.md)" -ge 2 || { echo "FAIL: 시뮬이 장부에 안 남았다"; cat playfeel.md; exit 1; }

          # 사람이 한 판 더 하면 리셋된다
          node "$PF" record --felt "두번째 판" >/dev/null
          code=0; node sim/run.mjs --seed 42 --runs 50 > r4.md 2>&1 || code=$?
          grep -q '예산 차단' r4.md && { echo "FAIL: 리셋됐는데 막혔다"; exit 1; }

          cd "$repo"; rm -rf "$box"
          echo "시뮬 예산 통과 (침묵 · 2회 허용 · 3회 차단 · 리셋)"
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node scripts/ci-local.mjs --only 17`
Expected: FAIL — 3회째도 안 막혀서 `예산 차단 문구가 없다`

- [ ] **Step 3: 스캐폴드가 `lib-playfeel.mjs` 도 깔게 한다**

Modify `skills/balance-sim/scripts/sim-scaffold.mjs:41`:

```js
const fromPlugin = {
  'lib-stats.mjs': path.join(PLUGIN_ROOT, 'scripts', 'lib-stats.mjs'),
  'lib-playfeel.mjs': path.join(PLUGIN_ROOT, 'skills', 'playtest-capture', 'scripts', 'lib-playfeel.mjs'),
};
```

- [ ] **Step 4: `run.mjs` 에 예산 검사를 넣는다**

Modify `skills/balance-sim/scripts/templates/run.mjs` — `import { TARGETS } from './targets.mjs';` 바로 다음 줄에 추가:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLog, simsSinceHuman, appendSim } from './lib-playfeel.mjs';

// ── 시뮬 예산 — 사람이 한 판 할 때마다 2회 ────────────────────────────────
// 훅이 아니라 여기서 막는다. 그래야 Claude Code·Codex·사람 터미널에서 같게 동작한다
// (ORCHESTRATION §10 "같은 도구"). 훅은 특정 하네스의 Bash 호출을 탈 때만 발화한다.
//
// 난이도는 봇 정책에 대해 상대적이라 더 돌려도 사람 난이도에 가까워지지 않는다.
// 판수를 늘려서 좁혀지는 건 오차지 이 격차가 아니다.
const SIM_BUDGET = 2;
const __here = path.dirname(fileURLToPath(import.meta.url));
const __log = findLog(__here);   // playfeel.md 가 없으면 null — 그 프로젝트는 이 규칙을 안 쓴다

if (__log) {
  const used = simsSinceHuman(fs.readFileSync(__log, 'utf8'));
  if (used >= SIM_BUDGET) {
    // 자리표시자(exit 3 + 5섹션 + "측정 불가")와 구분되게 5섹션을 내지 않는다.
    console.log('# 시뮬 예산 차단\n');
    console.log(`마지막 플레이 이후 시뮬 ${used}회를 썼다(상한 ${SIM_BUDGET}).`);
    console.log('난이도는 봇 기준이라 더 돌려도 사람 난이도에 가까워지지 않는다.');
    console.log('한 판 하고 아래로 한 줄 남겨라:\n');
    console.log('  node <플러그인>/skills/playtest-capture/scripts/playfeel.mjs record --felt "..."');
    appendSim(__log, `예산 차단 — 마지막 플레이 이후 ${used}회를 썼다`);
    process.exit(3);
  }
}
```

그리고 **판정이 끝난 뒤** 실행 기록을 남긴다. 파일 맨 끝의 두 줄이 이렇게 돼 있다:

```js
if (winJudge.verdict === '미달') process.exit(1);
if (winJudge.verdict === '측정 불가') process.exit(3);
```

이 **앞에** 한 줄을 끼운다(종료 전에 장부를 남겨야 미달·측정 불가도 예산에 센다):

```js
if (__log) appendSim(__log, `seed ${SEED} runs ${RUNS} -> 판정 ${winJudge.verdict}`);
```

> `winJudge` 는 run.mjs 가 이미 갖고 있는 승률 판정 객체다. 새로 계산하지 마라.
> `path` 는 run.mjs 가 아직 import 하지 않으므로 Step 4 의 import 추가가 맞다(중복 아님).

- [ ] **Step 5: 통과를 확인한다**

Run: `node scripts/ci-local.mjs --only 17`
Expected: PASS — `시뮬 예산 통과 (침묵 · 2회 허용 · 3회 차단 · 리셋)`

- [ ] **Step 6: 기존 하네스 왕복이 안 깨졌는지 확인한다**

Run: `node scripts/ci-local.mjs --only 4`
Expected: PASS — 스텝 4 는 `playfeel.md` 없이 돌므로 예산 검사를 건너뛴다. 이게 깨지면 "침묵" 규칙이 틀린 것이다.

- [ ] **Step 7: 커밋**

```bash
node scripts/validate-plugin.mjs && node scripts/ci-local.mjs
```

미러 재생성 후:

```bash
git add skills/balance-sim/scripts/templates/run.mjs \
        skills/balance-sim/scripts/sim-scaffold.mjs \
        .github/workflows/validate.yml \
        plugins/game-dev-team
git commit -m "v0.35.0 (3/5): 시뮬 예산을 훅이 아니라 run.mjs 안에서 강제 — 하네스 무관"
```

---

### Task 4: 규칙 문서 — ④ 통과 판정을 사람 플레이로

**Files:**
- Modify: `ORCHESTRATION.md:61-72` (§3 게이트)
- Modify: `ORCHESTRATION.md:187` (§10 제목과 범위)
- Modify: `README.md` (파이프라인 도식 + ④ 설명)
- Modify: `AGENTS.md` (같은 규칙 산문)
- Modify: `skills/balance-sim/SKILL.md` (요청형으로 위치 변경)
- Modify: `skills/playtest-capture/SKILL.md` (④ 판정 주체로 격상)
- Test: 문서 변경이므로 `validate-plugin` 의 참조 무결성이 테스트다

**Interfaces:**
- Consumes: Task 1~3 의 도구 이름과 명령 (문서에 정확히 적어야 한다)
- Produces: 없음

- [ ] **Step 1: `ORCHESTRATION.md` §3 의 ③↔④ 항목을 바꾼다**

기존:
```markdown
- 3↔4 게임성 검증 루프(미달 시 기획 반환, **반복 예산 정함**)
  — **봇(`balance-sim`)과 사람(`playtest-capture`) 둘 다 필요하다.** 봇 지표만 충족이면
  판정은 조건부이고, [공백]에 "사람 실플레이 미실시"가 남는다. 봇은 승률·픽률·난이도 곡선을
  재지만 첫 인상·이해 실패·학습 곡선은 구조적으로 측정하지 못한다.
```

바꾼 뒤:
```markdown
- 3↔4 게임성 검증 루프 — **통과 판정은 사람 플레이다.**
  자동으로 도는 것은 `clearability`(논리적 클리어 가능성)뿐이고 판수 0 이다.
  여기서 미달이면 ①(기획)으로 되돌린다 — **구성이 모순돼 클리어가 안 되는 경우만**이다.
  - **난이도·재미는 시뮬이 판정하지 않는다.** 난이도는 봇 정책에 대해 상대적이라
    판수를 늘려도 사람 난이도에 가까워지지 않는다(정밀도가 아니라 대상이 다르다).
  - **디테일 밸런스(`balance-sim`)는 파이프라인 단계가 아니다** — 사람이 요청할 때만 돈다.
    수치를 정말 조일 때는 여전히 제일 좋은 도구다.
  - 사람 플레이는 `playfeel record` 로 한 줄씩 남긴다. 그 장부가 **시뮬 예산**이기도 하다 —
    사람이 한 판 할 때마다 시뮬 2회. 초과하면 `run.mjs` 가 스스로 멈춘다.
```

- [ ] **Step 2: `ORCHESTRATION.md` §10 의 범위를 넓힌다**

제목을 바꾼다:
```markdown
## 10. 공동 컨트롤 — Claude Code + Codex 양쪽에서
```

"### 공동 컨트롤의 세 축" 의 ① 항목 뒤에 한 단락 추가:

```markdown
**이 원칙은 아트 밖에도 적용된다.** 게임성 트랙의 시뮬 예산도 훅이 아니라
`sim/run.mjs` 안에서 강제한다. 훅은 특정 하네스의 특정 도구 호출을 탈 때만 발화하므로
Codex 에서 빠지고, 사람이 터미널에서 직접 돌릴 때도 빠진다 — **도구 안이 훅보다 촘촘하다.**
새 강제 장치를 만들 때는 먼저 도구 안에 넣을 수 있는지 본다.
```

- [ ] **Step 3: `README.md` 파이프라인을 바꾼다**

도식의 ④ 부분:
```
④ 게임성검증(사람 플레이 + clearability)
```

불릿 두 개를 교체한다:
```markdown
- **③↔④ 반복 루프.** `clearability` 미달(논리적 클리어 불가) 시 ①(기획)으로 되돌린다.
- **④ 통과 판정은 사람 플레이다.** 자동으로 도는 건 판수 0 의 클리어 가능성 검사뿐이고,
  **난이도는 시뮬이 판정하지 않는다** — 봇 정책에 대해 상대적이라 판수를 늘려도 안 좁혀진다.
  디테일 밸런스(`balance-sim`)는 사람이 요청할 때만 돈다.
```

"판정 도구 인덱스" 의 "검증 하네스" 표에 두 줄 추가:
```markdown
| `balance-sim/clearability-check` | **④에서 자동으로 도는 유일한 검사.** 자원 수지·도달성·순서 제약 — 판수 0 |
| `playtest-capture/playfeel` | 사람 플레이 한 줄 로그이자 **시뮬 예산 장부**(플레이당 2회) |
```

- [ ] **Step 4: `AGENTS.md` 에 같은 규칙을 쓴다**

"게이트" 절의 ④ 항목을 §3 과 같은 내용으로 바꾸고, "검증 도구" 절에 Task 1·2 에서 추가한 명령이 들어 있는지 확인한다. **Codex 에도 강제력이 같다는 점을 명시한다:**

```markdown
시뮬 예산은 `run.mjs` 자신이 강제한다 — 훅이 아니므로 **Codex 에서도 똑같이 막힌다.**
하네스별 차이가 없다.
```

- [ ] **Step 5: 두 SKILL.md 의 위치를 바꾼다**

`skills/balance-sim/SKILL.md` 머리에:
```markdown
> **파이프라인 단계가 아니다.** ④ 게임성 검증에서 자동으로 돌지 않는다 — 사람이
> 요청할 때만 돈다. ④에서 자동으로 도는 것은 `clearability-check` 뿐이다.
> 이 도구는 **난이도를 판정하지 않는다**(봇 기준이라 사람 난이도와 다르다).
> 수치를 정말 조일 때 쓴다.
```

`skills/playtest-capture/SKILL.md` 머리에:
```markdown
> **④ 게임성 검증의 통과 판정 주체다.** 봇이 아니라 여기가 게이트다.
> 가볍게는 `playfeel record` 한 줄, 정식으로는 이벤트 계측 + `funnel-report`.
```

- [ ] **Step 6: 검사하고 커밋**

```bash
node scripts/validate-plugin.mjs
```
Expected: 통과 (끊어진 참조·누락 도구가 없어야 한다)

미러 재생성 후:

```bash
git add ORCHESTRATION.md README.md AGENTS.md \
        skills/balance-sim/SKILL.md skills/playtest-capture/SKILL.md \
        plugins/game-dev-team
git commit -m "v0.35.0 (4/5): ④ 통과 판정을 사람 플레이로 — 규칙 문서 정리"
```

---

### Task 5: 릴리스 — 버전·REVIEW·최종 검증

**Files:**
- Modify: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`
- Modify: `REVIEW.md` (B-17 + 열린 항목 갱신)
- Test: 전체 `ci-local` + `validate-plugin` + 원격 CI

**Interfaces:**
- Consumes: Task 1~4 전부
- Produces: 없음

- [ ] **Step 1: 버전을 올린다**

`.claude-plugin/plugin.json` 과 `.codex-plugin/plugin.json` 의 `"version"` 을 `0.34.0` → `0.35.0`.

- [ ] **Step 2: `REVIEW.md` 에 B-17 을 쓴다**

`## C. 드리프트 방지` 앞에 추가. 내용:
- 증상: 난이도 튜닝 5시간 → 실제 플레이하니 게임이 그냥 끝남 → 토큰 낭비
- 원인 3개: 규칙과 구조의 괴리 / 난이도의 봇 상대성 / 모델 괴리
- 고친 것: D1~D5 (spec 참조)
- 검증: CI 스텝 3개 신설, 양방향
- 남은 것: `balance-sim` 을 요청형으로 쓸 때 `game.mjs` 모델-실제 대조는 여전히 없다

"열린 항목" 의 닫힌 것 표에 추가:
```markdown
| ~~밸런스 시뮬이 ④를 막아 사람 접촉이 늦다~~ | v0.35.0 clearability + playfeel + 예산 (B-17) |
```

"아직 열린 것" 에 추가:
```markdown
6. **`game.mjs` 모델-실제 대조가 없다** — `balance-sim` 을 요청형으로 쓸 때,
   모델이 실제 빌드와 갈라져도 아무것도 안 잡는다. `PLACEHOLDER` 가드는
   "구현 안 됨"만 잡고 "틀리게 구현됨"은 못 잡는다. v0.35.0 의 `clearability` 는
   설계 데이터를 직접 봐서 이 문제를 **우회**했지만 해결하지는 않았다.
```

- [ ] **Step 3: 최종 검증**

```bash
node scripts/validate-plugin.mjs
node scripts/ci-local.mjs
```
Expected: validate 통과 · ci-local **17/17** 통과

- [ ] **Step 4: 미러 동기 확인**

Run: `scripts\sync-plugin.ps1 -Check` (PowerShell)
Expected: `OK - root and plugins/game-dev-team are in sync.`

- [ ] **Step 5: 커밋**

```bash
git add .claude-plugin/plugin.json .codex-plugin/plugin.json REVIEW.md plugins/game-dev-team
git commit -m "v0.35.0 (5/5): 버전 bump · REVIEW B-17"
```

- [ ] **Step 6: 사람에게 푸시를 물어본다**

**푸시하지 마라.** 이 레포는 사람이 명시적으로 승인했을 때만 푸시한다(CLAUDE.md).
커밋 5개를 요약해 보고하고 승인을 받는다. 승인 후:

```bash
git fetch ver04 --prune
git log --oneline HEAD..ver04/main   # 비어 있어야 fast-forward
git push ver04 main
```

푸시했으면 원격 CI 결과를 실제로 확인한다 — 로컬 `ci-local` 은 win32 이고 CI 는
ubuntu-latest 다. 플랫폼 차이는 로컬에서 안 보인다(REVIEW.md B-13).
