#!/usr/bin/env node
// feel-audit.mjs - 연출 상수(feel bible)를 논리·접근성·예산으로 검사한다.
//
//   node feel-audit.mjs <feel.json> [--out dir]
//
// **"느낌이 좋은가"는 판정하지 않는다.** 그건 사람이 사인오프한다(polish 는 주관 축이다).
// 이 도구가 보는 건 **느낌과 무관하게 틀린 것**들이다:
//
//   1) 논리 모순 — 강한 타격이 약한 타격보다 피드백이 약하다 (무게가 뒤집혔다)
//   2) 예산 초과 — 피드백 총 길이가 액션 간격을 넘는다 (입력이 밀리는 느낌이 된다)
//   3) 접근성 누락 — 모션 감소 경로가 선언되지 않았다 (P2 게이트 필수)
//   4) 일관성 붕괴 — 같은 부류 이벤트가 서로 다른 이징 계열을 쓴다
//   5) 이징 방향 — 등장은 ease-out, 퇴장은 ease-in 이 관례다
//
// 판정 등급을 구분한다:
//   **미달** = 위 1·2·3 (논리·예산·접근성. 취향과 무관하게 틀렸다)
//   **경고** = 4·5 와 권장 범위 이탈 (업계 관행 인용값이라 프로젝트가 다를 수 있다)
//
// 권장 범위의 출처는 업계 관행이고 **절대 기준이 아니다.** 어긋나면 왜 그런지 한 줄 적으면 된다.
// 그래서 경고는 게이트를 막지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { textTable } from '../../../scripts/lib-stats.mjs';

const args = process.argv.slice(2);
const src = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!src || src.startsWith('--')) {
  console.error('usage: node feel-audit.mjs <feel.json> [--out dir]');
  console.error('  뼈대: skills/art-direction/references/starter-kit/feel.json');
  process.exit(2);
}
const OUT = opt('--out', null);

let feel;
try { feel = JSON.parse(fs.readFileSync(src, 'utf8')); }
catch (e) { console.error(`읽기 실패: ${e.message}`); process.exit(3); }

// ── 기준값 (프로젝트가 _thresholds 로 덮어쓸 수 있다) ───────────────────────
const T = {
  // 입력→반응. 100ms 아래면 즉각적으로 느껴지고, 액션 게임은 더 낮게 잡는다.
  inputResponseMaxMs: 50,
  // hit-stop. 업계 관행 인용: 3~5프레임이 흔하고 40~80ms, 넓게는 3~12프레임(0.05~0.2초).
  hitStopFrameRange: [2, 12],
  shakeMaxDurationMs: 400,
  shakeMaxAmplitudePx: 12,
  // 피드백 총 길이 / 액션 간격. 넘으면 다음 입력이 피드백에 묻힌다.
  feedbackBudgetRatio: 0.6,
  ...(feel._thresholds || {}),
};
const FPS = Number(feel.fps) || 60;
const f2ms = (fr) => (Number(fr) || 0) * (1000 / FPS);

const events = feel.events || {};
const names = Object.keys(events).filter((k) => !k.startsWith('_'));
if (!names.length) { console.error('events 가 비어 있다.'); process.exit(3); }

const fails = [];   // 미달 — 논리·예산·접근성
const warns = [];   // 경고 — 관행 이탈·일관성
const rows = [];

// ── 1) 접근성: 모션 감소 경로 ───────────────────────────────────────────────
// polish/SKILL.md 의 P2 게이트가 이미 "모션 감소 옵션"을 요구한다. 선언을 검사로 만든다.
const rm = feel.reducedMotion;
const usesShake = names.some((n) => events[n].shake);
const usesFlash = names.some((n) => events[n].flash);
if (!rm || rm.declared !== true) {
  fails.push({ kind: '접근성', where: 'reducedMotion', msg: '모션 감소 경로가 선언되지 않았다. 모션 민감·광과민 사용자에게 대안이 없다 (P2 게이트 필수)' });
} else {
  const off = new Set([...(rm.disables || []), ...Object.keys(rm.scales || {})]);
  if (usesShake && !off.has('shake') && !off.has('screenShake')) {
    fails.push({ kind: '접근성', where: 'reducedMotion', msg: '화면 흔들림을 쓰는데 모션 감소에서 끄거나 줄이지 않는다' });
  }
  if (usesFlash && !off.has('flash')) {
    fails.push({ kind: '접근성', where: 'reducedMotion', msg: '화면 플래시를 쓰는데 모션 감소에서 끄지 않는다 — 광과민성 위험 경로다' });
  }
  if (rm.scales && rm.scales.shake !== undefined && Number(rm.scales.shake) > 0.5) {
    warns.push({ kind: '접근성', where: 'reducedMotion.scales.shake', msg: `흔들림 배율 ${rm.scales.shake} 는 "감소"라기엔 크다 (0 또는 0.3 이하 권장)` });
  }
}

// ── 2) 이벤트별 범위·예산 ────────────────────────────────────────────────────
const pace = feel.pace || {};
const actionMs = Number(pace.actionIntervalMs) || 0;
// 턴제는 다음 액션이 플레이어 입력을 기다리므로 **피드백 예산 개념이 없다.**
// 이 필드가 장식으로만 있어서 리포트가 "액션 간격 미설정"(누락처럼 읽힘)을 냈다 —
// 실사용(hex-danmaku, 턴제)에서 확인했다. **해당 없음과 누락은 다르게 보고해야 한다.**
const turnBased = pace.turnBasedGame === true;

for (const n of names) {
  const e = events[n];
  const hs = Number(e.hitStopFrames) || 0;
  const shakeMs = Number(e.shake?.durationMs) || 0;
  const shakePx = Number(e.shake?.amplitudePx) || 0;
  const flashMs = Number(e.flash?.durationMs) || 0;
  const respFr = e.responseFrames;
  const dur = Number(e.durationMs) || 0;

  // 피드백 총 길이 — hit-stop 은 게임을 멈추므로 직렬로 더한다.
  // 흔들림·플래시는 병행하므로 둘 중 긴 쪽만 센다.
  const totalMs = f2ms(hs) + Math.max(shakeMs, flashMs);

  rows.push({
    name: n, weight: e.weight ?? '', hitStop: hs || '', hitStopMs: hs ? f2ms(hs).toFixed(0) : '',
    shakePx: shakePx || '', shakeMs: shakeMs || '', flashMs: flashMs || '',
    resp: respFr === undefined ? '' : respFr, easing: e.easing || '', durMs: dur || '',
    totalMs: totalMs ? totalMs.toFixed(0) : '',
  });

  // 입력 반응 지연 — 미달이 아니라 경고다(프로젝트 장르에 따라 다르다)
  if (respFr !== undefined) {
    const ms = f2ms(respFr);
    if (ms > T.inputResponseMaxMs) {
      warns.push({ kind: '반응지연', where: n, msg: `입력→반응 ${respFr}프레임(${ms.toFixed(0)}ms) > 권장 ${T.inputResponseMaxMs}ms. 누른 느낌이 끊긴다` });
    }
  }

  // hit-stop 권장 범위
  if (hs) {
    const [lo, hi] = T.hitStopFrameRange;
    if (hs < lo) warns.push({ kind: 'hit-stop', where: n, msg: `${hs}프레임(${f2ms(hs).toFixed(0)}ms) < 권장 하한 ${lo}프레임 — 타격이 안 느껴질 수 있다` });
    if (hs > hi) warns.push({ kind: 'hit-stop', where: n, msg: `${hs}프레임(${f2ms(hs).toFixed(0)}ms) > 권장 상한 ${hi}프레임 — 게임이 멈춘 것처럼 느껴진다` });
  }

  // 흔들림 상한
  if (shakeMs > T.shakeMaxDurationMs) {
    warns.push({ kind: '흔들림', where: n, msg: `${shakeMs}ms > 권장 상한 ${T.shakeMaxDurationMs}ms — 길면 멀미를 유발한다` });
  }
  if (shakePx > T.shakeMaxAmplitudePx) {
    warns.push({ kind: '흔들림', where: n, msg: `진폭 ${shakePx}px > 권장 상한 ${T.shakeMaxAmplitudePx}px — 가독성을 해친다` });
  }
  if (e.shake && !e.shake.decay) {
    warns.push({ kind: '흔들림', where: n, msg: '감쇠(decay)가 없다 — 일정 진폭으로 끝까지 흔들리면 싸구려로 느껴진다' });
  }

  // **예산 초과는 미달이다.** 취향이 아니라 조작감이 실제로 망가진다.
  if (!turnBased && actionMs > 0 && totalMs > actionMs * T.feedbackBudgetRatio) {
    fails.push({
      kind: '예산초과', where: n,
      msg: `피드백 ${totalMs.toFixed(0)}ms > 액션 간격 ${actionMs}ms 의 ${(T.feedbackBudgetRatio * 100).toFixed(0)}%(${(actionMs * T.feedbackBudgetRatio).toFixed(0)}ms). 다음 입력이 피드백에 묻힌다`,
    });
  }
}

// ── 3) 논리 모순: 무게 순서 ─────────────────────────────────────────────────
// 강한 타격이 약한 타격보다 피드백이 약하면 그건 취향이 아니라 **틀린 것**이다.
//
// **단, 같은 부류 안에서만 비교한다.** "플레이어 피격"과 "적에게 강타"를 한 축에 놓고
// 무게를 비교하는 건 틀렸다 — 서로 다른 이벤트 부류이고 연출 의도가 다르다.
// (실제로 이 오탐이 났다. 게이트에서 오탐은 없는 것보다 나쁘다 — 아무도 안 믿게 된다.)
// 부류는 `class` 로 명시하고, 없으면 이름의 첫 토큰(`hit_heavy` -> `hit`)으로 추론한다.
const classOf = (n) => events[n].class || String(n).split('_')[0];
const byClass = new Map();
for (const n of names) {
  const e = events[n];
  if (e.weight === undefined || !(e.hitStopFrames || e.shake)) continue;
  const c = classOf(n);
  if (!byClass.has(c)) byClass.set(c, []);
  byClass.get(c).push({
    n, w: Number(e.weight),
    hs: Number(e.hitStopFrames) || 0,
    px: Number(e.shake?.amplitudePx) || 0,
  });
}
for (const [c, list] of byClass) {
  if (list.length < 2) continue;
  list.sort((a, b) => a.w - b.w);
  for (let i = 1; i < list.length; i++) {
    const lo = list[i - 1], hi = list[i];
    if (lo.w === hi.w) continue;
    if (hi.hs && lo.hs && hi.hs < lo.hs) {
      fails.push({ kind: '무게역전', where: hi.n, msg: `[${c}] 무게 ${hi.w} 인데 hit-stop ${hi.hs}프레임 < 무게 ${lo.w}(${lo.n}) 의 ${lo.hs}프레임. 강한 쪽이 더 약하게 느껴진다` });
    }
    if (hi.px && lo.px && hi.px < lo.px) {
      fails.push({ kind: '무게역전', where: hi.n, msg: `[${c}] 무게 ${hi.w} 인데 흔들림 ${hi.px}px < 무게 ${lo.w}(${lo.n}) 의 ${lo.px}px` });
    }
  }
}
const singletonClasses = [...byClass.entries()].filter(([, l]) => l.length < 2).map(([c]) => c);

// ── 4) 이징 일관성·방향 ─────────────────────────────────────────────────────
const easings = names.filter((n) => events[n].easing).map((n) => ({ n, e: String(events[n].easing) }));
const family = (e) => e.replace(/^ease(In|Out|InOut)/, '').toLowerCase() || 'linear';
const fams = new Set(easings.map((x) => family(x.e)));
if (fams.size > 3) {
  warns.push({ kind: '일관성', where: 'easing', msg: `이징 계열이 ${fams.size}종(${[...fams].join(', ')}) 섞여 있다 — 2~3종으로 줄이면 한 게임처럼 느껴진다` });
}
for (const { n, e } of easings) {
  // 관례: 등장(enter/in/show/popup)은 ease-out, 퇴장(exit/out/hide/close)은 ease-in
  const isEnter = /enter|_in\b|show|open|popup|appear/i.test(n);
  const isExit = /exit|_out\b|hide|close|dismiss|disappear/i.test(n);
  if (isEnter && /^easeIn(?!Out)/.test(e)) {
    warns.push({ kind: '이징방향', where: n, msg: `등장인데 \`${e}\` — 등장은 ease-out 이 관례다(빠르게 나타나 부드럽게 정착)` });
  }
  if (isExit && /^easeOut/.test(e)) {
    warns.push({ kind: '이징방향', where: n, msg: `퇴장인데 \`${e}\` — 퇴장은 ease-in 이 관례다(부드럽게 시작해 빠르게 사라짐)` });
  }
}

// ── 5) 사운드 훅 누락 ───────────────────────────────────────────────────────
const noSound = names.filter((n) => (events[n].hitStopFrames || events[n].shake) && !events[n].sound);
if (noSound.length) {
  warns.push({ kind: '사운드', where: noSound.join(', '), msg: '타격 피드백에 사운드 훅이 없다 — 시각만으로는 타격감의 절반이다' });
}

// ── 판정 ────────────────────────────────────────────────────────────────────
const verdict = fails.length ? '미달' : '충족';

const L = [];
L.push('', '# 연출 상수 감사 (feel bible)', '');
L.push(`\`${src}\` · 이벤트 ${names.length}개 · ${FPS}fps` +
  (turnBased ? ' · **턴제** (피드백 예산 해당 없음)'
    : actionMs ? ` · 액션 간격 ${actionMs}ms`
      : ' · **액션 간격 미설정**'));
L.push('');
L.push('## [주장]');
L.push(`판정: **${verdict}**` + (fails.length ? ` — 미달 ${fails.length}건` : '') + (warns.length ? ` · 경고 ${warns.length}건` : ''));
L.push('');
L.push('> **"느낌이 좋은가"는 판정하지 않는다** — 그건 사람이 사인오프한다.');
L.push('> 여기서 보는 건 느낌과 무관하게 틀린 것(논리 모순·예산 초과·접근성 누락)이다.');
L.push('');

if (fails.length) {
  L.push('## [미달] 취향과 무관하게 틀린 것');
  L.push('');
  L.push('| 종류 | 위치 | 내용 |', '|---|---|---|');
  for (const f of fails) L.push(`| **${f.kind}** | \`${f.where}\` | ${f.msg} |`);
  L.push('');
}
if (warns.length) {
  L.push('## [경고] 업계 관행 이탈 — 이유가 있으면 적고 넘어가라');
  L.push('');
  L.push('| 종류 | 위치 | 내용 |', '|---|---|---|');
  for (const w of warns) L.push(`| ${w.kind} | \`${w.where}\` | ${w.msg} |`);
  L.push('');
  L.push('> 권장 범위는 **업계 관행 인용값이고 절대 기준이 아니다.** 장르에 따라 다르다 —');
  L.push('> 턴제라면 hit-stop 상한이 무의미하고, 리듬 게임이라면 반응 지연 기준이 훨씬 엄격하다.');
  L.push('> 어긋나는 이유를 한 줄 적으면 그걸로 끝이다. 경고는 게이트를 막지 않는다.');
  L.push('');
}

L.push('## [증거]', '```');
L.push(textTable(
  ['이벤트', '무게', 'hitStop', '(ms)', '흔들림px', '흔들림ms', '플래시ms', '반응fr', '이징', '길이ms', '피드백총'],
  rows.map((r) => [r.name, r.weight, r.hitStop, r.hitStopMs, r.shakePx, r.shakeMs, r.flashMs, r.resp, r.easing, r.durMs, r.totalMs]),
));
L.push('```');
L.push('> 피드백총 = hit-stop(게임이 멈추므로 직렬) + max(흔들림, 플래시)(병행).');
if (actionMs) L.push(`> 예산 = 액션 간격 ${actionMs}ms × ${T.feedbackBudgetRatio} = ${(actionMs * T.feedbackBudgetRatio).toFixed(0)}ms`);
L.push('');

L.push('## [기준]');
L.push(`\`${src}\` 의 \`_thresholds\`(없으면 도구 기본값). 현재 적용값:`);
L.push(`입력 반응 ≤ ${T.inputResponseMaxMs}ms · hit-stop ${T.hitStopFrameRange[0]}~${T.hitStopFrameRange[1]}프레임 ·`);
L.push(`흔들림 ≤ ${T.shakeMaxDurationMs}ms / ${T.shakeMaxAmplitudePx}px · 피드백 예산 ${T.feedbackBudgetRatio}`);
L.push('');
L.push('hit-stop 권장 범위의 출처는 업계 관행이다 — 3~5프레임이 흔하고 40~80ms 대,');
L.push('넓게는 3~12프레임(0.05~0.2초)까지 쓴다. 무게에 따라 나누는 게 정석이다.');
L.push('');

L.push('## [공백]');
if (turnBased) L.push('- **턴제라 피드백 예산 검사를 건너뛰었다** — 다음 액션이 입력을 기다리므로 피드백이 입력을 가리지 않는다. 이건 누락이 아니라 **해당 없음**이다.');
else if (!actionMs) L.push('- **`pace.actionIntervalMs` 가 없어 예산 검사를 못 했다.** 피드백이 조작감을 해치는지 모른다.');
L.push('- **"느낌이 좋은가"는 이 도구 밖이다.** 사람 사인오프가 P1·P2 게이트의 본체다.');
L.push('- 선언된 값과 **실제 구현이 일치하는지는 검사하지 않았다.** 코드가 이 표를 읽어야 의미가 있다 —');
L.push('  숫자를 코드에 따로 박아두면 이 감사는 장식이다.');
L.push('- 실제 프레임 유지(연출이 프레임을 깎지 않는가)는 실기기 프로파일링 몫이다.');
L.push('- 이펙트 자체의 광과민성 위험은 `flash-check.mjs` 가 본다 — 이 도구는 수치 표만 본다.');
if (singletonClasses.length) {
  L.push(`- 부류 \`${singletonClasses.join('`, `')}\` 는 항목이 1개라 **무게 순서를 검사하지 못했다** — 비교 대상이 없다.`);
}
if (singletonClasses.length) L.push();
L.push('');
L.push('## [잔여 위험]');
L.push('- (통과했지만 남는 위험을 여기 적는다.)');
L.push('');

const report = L.join('\n');
console.log(report);

if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'feel-audit.md'), report);
  fs.writeFileSync(path.join(OUT, 'feel-audit.json'), JSON.stringify({ verdict, thresholds: T, fails, warns, events: rows }, null, 2));
  console.log(`-> ${OUT}/feel-audit.md · feel-audit.json`);
}

if (verdict === '미달') process.exit(1);
