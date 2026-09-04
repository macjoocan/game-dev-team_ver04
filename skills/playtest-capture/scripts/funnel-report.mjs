#!/usr/bin/env node
// funnel-report.mjs - FTUE 단계 퍼널 + 세션1->2 전환 + 이탈 뭉침을 낸다.
//
//   node funnel-report.mjs <events.jsonl> [--steps steps.json] [--out dir]
//
// 왜 퍼널인가: **평균 튜토리얼 완료율은 고칠 곳을 알려주지 않는다.** 이탈은 단계 특정적이고,
// 첫 단계도 못 끝내는 이탈이 20% 수준으로 흔하다. 그게 "완료율 65%" 하나에 묶이면 안 보인다.
//
// 형식·이벤트 목록: references/ftue-telemetry.md

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { wilson, judgeAgainstTarget, pct, textTable, quantile, mean } =
  await import(new URL('../../../scripts/lib-stats.mjs', import.meta.url).href);

const args = process.argv.slice(2);
const src = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!src || src.startsWith('--')) {
  console.error('usage: node funnel-report.mjs <events.jsonl> [--steps steps.json] [--out dir]');
  console.error('  events.jsonl: 한 줄에 한 이벤트 (references/ftue-telemetry.md 참고)');
  console.error('  steps.json:   퍼널 단계 순서 + 목표. 없으면 step_index 로 순서를 추론한다');
  process.exit(2);
}

// ── 이벤트 읽기 ──────────────────────────────────────────────────────────────
const lines = fs.readFileSync(src, 'utf8').split('\n').filter((l) => l.trim());
const events = [];
let broken = 0;
for (const l of lines) {
  try { events.push(JSON.parse(l)); } catch { broken++; }
}
if (!events.length) { console.error('읽을 이벤트가 없다.'); process.exit(3); }

const notes = [];
if (broken) notes.push(`파싱 실패한 줄 ${broken}개를 건너뛰었다 — 계측이 깨진 구간이 있는지 확인해라.`);

// ── 단계 순서 ────────────────────────────────────────────────────────────────
let steps = null;
let targets = {};
const stepsPath = opt('--steps', null);
if (stepsPath) {
  const cfg = JSON.parse(fs.readFileSync(stepsPath, 'utf8'));
  steps = cfg.steps;
  targets = cfg.targets || {};
} else {
  // step_index 로 순서를 추론한다. 없으면 첫 등장 순서.
  const seen = new Map();
  for (const e of events) {
    if (e.event !== 'ftue_step' || !e.step_id) continue;
    if (!seen.has(e.step_id)) seen.set(e.step_id, e.step_index ?? seen.size);
  }
  steps = [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => ({ id, label: id }));
  notes.push('단계 순서를 이벤트에서 **추론**했다 — `--steps steps.json` 으로 명시하면 확실하다.');
}
if (!steps || !steps.length) { console.error('퍼널 단계를 못 찾았다 (ftue_step 이벤트가 없다).'); process.exit(3); }

// ── 세션별 집계 ──────────────────────────────────────────────────────────────
const sessions = new Map();
const get = (id) => {
  if (!sessions.has(id)) sessions.set(id, { reached: new Set(), completed: new Set(), index: null, build: null, len: null, firstInput: null, exit: null });
  return sessions.get(id);
};
for (const e of events) {
  const id = e.session_id;
  if (!id) continue;
  const s = get(id);
  if (e.build_version) s.build = e.build_version;
  if (e.session_index != null) s.index = e.session_index;
  switch (e.event) {
    case 'ftue_step': if (e.step_id) s.reached.add(e.step_id); break;
    case 'ftue_step_complete': if (e.step_id) { s.reached.add(e.step_id); s.completed.add(e.step_id); } break;
    case 'first_input': s.firstInput = e.time_since_session_start ?? s.firstInput; break;
    case 'session_end': s.len = e.session_length_sec ?? s.len; s.exit = e.exit_reason ?? s.exit; break;
  }
}

const builds = [...new Set([...sessions.values()].map((s) => s.build).filter(Boolean))];
if (builds.length > 1) {
  notes.push(`**빌드가 ${builds.length}종 섞여 있다** (${builds.join(', ')}) — 서로 다른 게임의 퍼널을 합산하면 수정 효과가 사라진다. 빌드별로 나눠 돌려라.`);
}
if (!builds.length) notes.push('`build_version` 이 없다 — 이 퍼널은 다음 회차와 비교할 수 없다.');

// ── 퍼널 ─────────────────────────────────────────────────────────────────────
const rows = [];
for (const st of steps) {
  const reached = [...sessions.values()].filter((s) => s.reached.has(st.id)).length;
  const passed = [...sessions.values()].filter((s) => s.completed.has(st.id)).length;
  rows.push({ ...st, reached, passed, ci: wilson(passed, reached) });
}

// ── 세션1 -> 세션2 전환 ──────────────────────────────────────────────────────
const s1 = [...sessions.values()].filter((s) => s.index === 1).length;
const s2 = [...sessions.values()].filter((s) => s.index === 2).length;
const conv = s1 > 0 ? wilson(Math.min(s2, s1), s1) : null;

// ── 이탈·사망 뭉침 ───────────────────────────────────────────────────────────
const deaths = events.filter((e) => e.event === 'death' && Number.isFinite(e.x) && Number.isFinite(e.y));
const clusters = (() => {
  if (deaths.length < 5) return [];
  const CELL = 64;
  const grid = new Map();
  for (const d of deaths) {
    const k = Math.floor(d.x / CELL) + ',' + Math.floor(d.y / CELL) + '|' + (d.stage_id ?? '');
    grid.set(k, (grid.get(k) || 0) + 1);
  }
  return [...grid.entries()]
    .map(([k, c]) => ({ cell: k, count: c, share: c / deaths.length }))
    .filter((c) => c.share >= 0.15)
    .sort((a, b) => b.count - a.count);
})();

// ── 판정 ─────────────────────────────────────────────────────────────────────
const checks = [];
const passTarget = targets.stepPassRate;
const blocking = [];
for (const r of rows) {
  if (r.reached === 0) { checks.push({ label: r.label, verdict: '측정 불가', why: '도달한 세션이 0 이다' }); continue; }
  if (r.ci.hi - r.ci.lo > 0.35) {
    checks.push({ label: r.label, verdict: '측정 불가', why: `도달 ${r.reached}명, 오차 ±${pct(r.ci.margin)} — 표본이 부족해 판정 불가` });
    continue;
  }
  if (passTarget != null && r.ci.hi < passTarget) {
    blocking.push(r);
    checks.push({ label: r.label, verdict: '미달', why: `통과율 ${pct(r.ci.p)} (${pct(r.ci.lo)}~${pct(r.ci.hi)}) — 하한 ${pct(passTarget)} 아래. **막힘 지점**` });
  } else if (passTarget != null) {
    checks.push({ label: r.label, verdict: '충족', why: `통과율 ${pct(r.ci.p)}` });
  }
}
if (conv && targets.session1to2) {
  const j = judgeAgainstTarget(conv, targets.session1to2);
  checks.push({ label: '세션1→2 전환', verdict: j.verdict, why: j.why + ` (실측 ${pct(conv.p)})` });
} else if (!conv) {
  checks.push({ label: '세션1→2 전환', verdict: '측정 불가', why: '`session_index` 가 없어 계산할 수 없다' });
}
const fi = [...sessions.values()].map((s) => s.firstInput).filter(Number.isFinite);
if (fi.length && targets.maxTimeToFirstInput != null) {
  const med = quantile(fi, 0.5);
  checks.push({
    label: '첫 입력까지',
    verdict: med <= targets.maxTimeToFirstInput ? '충족' : '미달',
    why: `중위 ${med.toFixed(1)}초 (상한 ${targets.maxTimeToFirstInput}초)` + (med > targets.maxTimeToFirstInput ? ' — 무엇을 해야 할지 모르고 있다' : ''),
  });
}

const verdict = checks.some((c) => c.verdict === '측정 불가') ? '측정 불가'
  : checks.some((c) => c.verdict === '미달') ? '미달'
    : checks.length ? '충족' : '측정 불가';

// ── 출력 ─────────────────────────────────────────────────────────────────────
const out = [];
out.push('', '# FTUE 퍼널 리포트', '');
out.push(`세션 **${sessions.size}개** · 이벤트 ${events.length}건 · 빌드 ${builds.join(', ') || '(없음)'}`);
out.push('');
out.push('## [주장]');
out.push(`판정: **${verdict}**`, '');
if (checks.length) {
  out.push('| 항목 | 판정 | 근거 |', '|---|---|---|');
  for (const c of checks) out.push(`| ${c.label} | **${c.verdict}** | ${c.why} |`);
  out.push('');
}

out.push('## [증거]');
out.push('```');
out.push(textTable(
  ['단계', '도달', '통과', '통과율', '95% CI', '이탈'],
  rows.map((r) => [
    r.label, r.reached, r.passed,
    r.reached ? pct(r.ci.p) : '-',
    r.reached ? pct(r.ci.lo) + '~' + pct(r.ci.hi) : '-',
    r.reached ? r.reached - r.passed : '-',
  ]),
));
out.push('```', '');
out.push('> 통과율은 **조건부**다 — 그 단계에 도달한 세션 중 통과한 비율. 평균이 아니라 단계로 봐야');
out.push('> 고칠 곳이 보인다.', '');

if (blocking.length) {
  out.push('### 막힘 지점 — 여기부터 고친다', '');
  for (const b of blocking) out.push(`- **${b.label}** (${b.id}): 도달 ${b.reached}명 중 ${b.reached - b.passed}명 이탈`);
  out.push('');
  out.push('> 퍼널은 **어디서** 떠나는지만 알려준다. **왜** 떠나는지는 관찰 기록에 있다 —');
  out.push('> 이 단계의 think-aloud 기록을 읽고 `이해실패`/`발견실패`/`조작`/`난이도`/`버그` 중');
  out.push('> 무엇인지 확인해라. 관찰 없이 숫자만 보면 대개 난이도로 오진한다.', '');
}

if (conv) out.push(`### 세션1→2 전환`, `${s1}명 중 ${s2}명 = **${pct(conv.p)}** (${pct(conv.lo)}~${pct(conv.hi)})`, '',
  '> D1 리텐션의 선행지표다. 첫 세션 내부 지표보다 이게 먼저다.', '');

if (clusters.length) {
  out.push('### 사망 뭉침 (좌표 기준)', '```');
  out.push(textTable(['셀|스테이지', '건수', '비율'], clusters.slice(0, 8).map((c) => [c.cell, c.count, pct(c.share)])));
  out.push('```', '');
  out.push('> 한 곳에 뭉쳐 있으면 원인은 셋 중 하나다 — **충돌 버그 / 과도한 난이도 / 동선 혼란.**');
  out.push('> 셋은 고치는 곳이 다르다. 관찰 기록으로 가려라.', '');
} else if (deaths.length >= 5) {
  out.push('### 사망 분포', '좌표가 고르게 퍼져 있다 — 특정 지점의 뭉침 없음.', '');
}

out.push('## [기준]');
out.push(stepsPath ? `단계·목표 출처: \`${stepsPath}\`` : '**목표가 주어지지 않았다** — `--steps steps.json` 없이는 통과/미달을 판정할 수 없다.', '');

out.push('## [공백]');
for (const n of notes) out.push('- ' + n);
out.push('- **왜 떠났는지는 이 퍼널에 없다.** think-aloud 관찰 기록과 함께 읽어야 원인이 나온다.');
out.push('- 계측되지 않은 구간은 이 리포트에 존재하지 않는다 — 이벤트가 없는 것과 이탈이 없는 것은 다르다.');
if (!deaths.length) out.push('- `death` 이벤트에 좌표가 없어 뭉침 분석을 하지 못했다.');
out.push('');
out.push('## [잔여 위험]');
out.push('- (통과했지만 남는 위험을 여기 적는다.)', '');

const report = out.join('\n');
console.log(report);

const OUT = opt('--out', null);
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'funnel-report.md'), report);
  fs.writeFileSync(path.join(OUT, 'funnel.json'), JSON.stringify({
    sessions: sessions.size, events: events.length, builds, checks, verdict,
    steps: rows.map(({ ci, ...r }) => ({ ...r, passRate: ci.p, lo: ci.lo, hi: ci.hi })),
    session1to2: conv ? { s1, s2, rate: conv.p, lo: conv.lo, hi: conv.hi } : null,
    clusters,
  }, null, 2));
  console.log(`-> ${OUT}/funnel-report.md · funnel.json`);
}

if (verdict === '미달') process.exit(1);
if (verdict === '측정 불가') process.exit(3);
