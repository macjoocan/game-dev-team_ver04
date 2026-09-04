#!/usr/bin/env node
// run.mjs - 몬테카를로 배치 실행 + 판정 리포트.
//
//   node sim/run.mjs --seed 42 --runs 1000 --policy greedy
//   node sim/run.mjs --seed 42 --runs auto --margin 0.02      # 목표 오차에서 판수 역산
//   node sim/run.mjs --seed 42 --runs 1000 --ab damageMax=25  # 기능/수치 A/B (공통 난수)
//   node sim/run.mjs --seed 42 --runs 1000 --out results      # report.md + results.json 저장
//
// 이 스크립트는 게임을 모른다. game.mjs 의 simulateRun 만 부른다.
// 종료 코드: 0 충족 · 1 미달 · 3 측정 불가 (CI 게이트로 쓸 수 있다)

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeRng, runSeed } from './rng.mjs';
import { POLICIES } from './policies.mjs';
import { simulateRun, defaultConfig, PLACEHOLDER } from './game.mjs';
import {
  wilson, requiredN, judgeAgainstTarget, pairedDiff, histogram, quantile, mean,
  pct, textTable, METRIC_TABLE_HEAD, metricRow,
} from './lib-stats.mjs';
import { TARGETS } from './targets.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node run.mjs [--seed 42] [--runs 1000|auto] [--margin 0.03] [--policy greedy] [--ab key=value] [--out dir]');
  process.exit(2);
}

const SEED = Number(opt('--seed', 42));
const POLICY_NAME = opt('--policy', 'greedy');
const MARGIN = Number(opt('--margin', 0.03));
const RUNS_ARG = opt('--runs', 'auto');
const RUNS = RUNS_ARG === 'auto' ? requiredN(MARGIN) : Number(RUNS_ARG);
const AB = opt('--ab', null);
const OUT = opt('--out', null);

const policy = POLICIES[POLICY_NAME];
if (!policy) {
  console.error('알 수 없는 정책: ' + POLICY_NAME + ' (있는 것: ' + Object.keys(POLICIES).join(', ') + ')');
  process.exit(2);
}

// 대상 커밋을 자동으로 박는다. 손으로 적게 하면 안 적거나 틀린다 - 그러면 증거가 아니다.
const git = (a) => {
  try {
    return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
};
const commit = git(['rev-parse', '--short', 'HEAD']);
const dirty = (git(['status', '--porcelain']) || '').length > 0;

/** config 로 RUNS 판 돌린다. 판 시드는 항상 runSeed(SEED, i) - A/B 가 짝을 맞출 수 있게. */
function batch(config) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    runs.push(simulateRun({ rng: makeRng(runSeed(SEED, i)), config, policy }));
  }
  return runs;
}

function aggregate(runs) {
  const wins = runs.filter((r) => r.win).length;
  const lengths = runs.map((r) => r.length);
  const pickCounts = new Map();
  for (const r of runs) for (const p of r.picks || []) pickCounts.set(p, (pickCounts.get(p) || 0) + 1);
  const totalPicks = [...pickCounts.values()].reduce((a, b) => a + b, 0);
  const exits = new Map();
  for (const r of runs) if (!r.win && r.exitStage) exits.set(r.exitStage, (exits.get(r.exitStage) || 0) + 1);
  return {
    n: runs.length,
    winRate: wilson(wins, runs.length),
    lengthMean: mean(lengths),
    lengthP10: quantile(lengths, 0.1),
    lengthP90: quantile(lengths, 0.9),
    choicesMean: mean(runs.map((r) => (r.choices === undefined ? NaN : r.choices))),
    deathHist: histogram(runs.filter((r) => !r.win).map((r) => (r.deathAt === undefined ? r.length : r.deathAt)), 8),
    picks: [...pickCounts.entries()]
      .map(([id, c]) => ({ id, count: c, share: totalPicks ? c / totalPicks : 0 }))
      .sort((a, b) => b.share - a.share),
    exits: [...exits.entries()]
      .map(([id, c]) => ({ id, count: c, share: c / runs.length }))
      .sort((a, b) => b.share - a.share),
    raw: runs,
  };
}

function inBand(v, band) {
  if (!band || !Number.isFinite(v)) return '-';
  return v >= band[0] && v <= band[1] ? '충족' : '미달';
}
function strip(a) {
  const { raw, ...rest } = a;
  return rest;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

const baseConfig = { ...defaultConfig };
let abConfig = null;
if (AB) {
  const eq = AB.indexOf('=');
  if (eq < 0) { console.error('--ab 형식: key=value'); process.exit(2); }
  const k = AB.slice(0, eq);
  const v = AB.slice(eq + 1);
  abConfig = { ...baseConfig, [k]: isNaN(Number(v)) ? v : Number(v) };
}

const t0 = Date.now();
const A = aggregate(batch(baseConfig));
const B = abConfig ? aggregate(batch(abConfig)) : null;
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

// ── 리포트 (ORCHESTRATION.md §5 의 5섹션) ────────────────────────────────────

const cmd = 'node sim/run.mjs --seed ' + SEED + ' --runs ' + RUNS + ' --policy ' + POLICY_NAME + (AB ? ' --ab ' + AB : '');
const out = [];
out.push('', '# 게임성 검증 리포트', '');
out.push('정책 **' + POLICY_NAME + '** · 시드 **' + SEED + '** · **' + RUNS + '판** · 커밋 **' +
  (commit || '(git 없음)') + (dirty ? ' +미커밋변경' : '') + '** · ' + elapsed + 's');
if (RUNS_ARG === 'auto') out.push('', '> 판수는 목표 오차 ±' + pct(MARGIN) + ' 에서 역산했다.');
if (PLACEHOLDER) out.push('', '> **경고: game.mjs 가 자리표시자다.** 아래 수치는 하네스 동작 확인용이며 게임을 측정한 것이 아니다.');
out.push('');

// 자리표시자 로직이 만든 수치는 어떤 값이 나와도 판정 근거가 아니다.
// 이걸 막지 않으면 하네스가 만든 숫자가 게이트 리포트에 미달로 올라가고,
// 기획이 멀쩡한 밸런스를 흔들기 시작한다 - 되돌릴 곳은 기획이 아니라 game.mjs 다.
const winJudge = PLACEHOLDER
  ? { verdict: '측정 불가', why: 'game.mjs 가 아직 자리표시자다 (PLACEHOLDER = true) — 실제 런 로직으로 바꿔야 측정이 시작된다' }
  : TARGETS.winRate
    ? judgeAgainstTarget(A.winRate, TARGETS.winRate)
    : { verdict: '측정 불가', why: 'targets.mjs 에 winRate 목표가 없다' };

out.push('## [주장]');
out.push('승률 판정: **' + winJudge.verdict + '** — ' + winJudge.why, '');

out.push('## [증거]');
out.push('```', cmd, '```');
out.push(...METRIC_TABLE_HEAD);
out.push(metricRow('승률', TARGETS.winRate, A.winRate, winJudge.verdict));
out.push('| 런 길이(평균) | ' + (TARGETS.lengthMean ? TARGETS.lengthMean[0] + '~' + TARGETS.lengthMean[1] : '-') +
  ' | ' + A.lengthMean.toFixed(1) + ' | P10 ' + A.lengthP10.toFixed(1) + ' / P90 ' + A.lengthP90.toFixed(1) +
  ' | ' + inBand(A.lengthMean, TARGETS.lengthMean) + ' |');
if (Number.isFinite(A.choicesMean)) {
  out.push('| 선택 밀도(판당) | ' + (TARGETS.choicesMean ? TARGETS.choicesMean[0] + '~' + TARGETS.choicesMean[1] : '-') +
    ' | ' + A.choicesMean.toFixed(2) + ' | - | ' + inBand(A.choicesMean, TARGETS.choicesMean) + ' |');
}
if (A.picks.length) {
  const top = A.picks[0];
  const cap = TARGETS.maxPickShare;
  out.push('| 최다 픽 편중 | ' + (cap ? '<= ' + pct(cap) : '-') + ' | ' + pct(top.share) + ' (' + top.id + ')' +
    ' | - | ' + (cap ? (top.share <= cap ? '충족' : '미달') : '-') + ' |');
}
out.push('');

if (A.picks.length > 1) {
  out.push('### 픽률', '```');
  out.push(textTable(['선택지', '픽률', '횟수'], A.picks.slice(0, 12).map((p) => [p.id, pct(p.share), p.count])));
  out.push('```', '');
}
if (A.exits.length) {
  out.push('### 이탈 분포 (패배가 끝난 지점)', '```');
  out.push(textTable(['지점', '비율', '판수'], A.exits.slice(0, 12).map((e) => [e.id, pct(e.share), e.count])));
  out.push('```', '');
}
if (A.deathHist.n) {
  out.push('### 사망 시점 분포', '```');
  out.push(textTable(['구간', '비율', '판수'],
    A.deathHist.bins.map((b) => [b.lo.toFixed(1) + '~' + b.hi.toFixed(1), pct(b.ratio), b.count])));
  out.push('```', '');
  out.push('> 특정 구간에 몰려 있으면 급사 스파이크다. 고르게 퍼져 있어야 난이도가 학습된다.', '');
}

if (B) {
  out.push('## [A/B] 공통 난수 대응 비교', '');
  out.push('변경: `' + AB + '` · 같은 시드 ' + RUNS + '쌍', '');
  const winDiff = pairedDiff(A.raw.map((r) => (r.win ? 1 : 0)), B.raw.map((r) => (r.win ? 1 : 0)));
  const lenDiff = pairedDiff(A.raw.map((r) => r.length), B.raw.map((r) => r.length));
  out.push('| 지표 | OFF | ON | 차이 (95% CI) | 유의 |', '|---|---|---|---|---|');
  out.push('| 승률 | ' + pct(A.winRate.p) + ' | ' + pct(B.winRate.p) + ' | ' + pct(winDiff.meanDiff) +
    ' (' + pct(winDiff.lo) + '~' + pct(winDiff.hi) + ') | ' + (winDiff.significant ? '예' : '**아니오**') + ' |');
  out.push('| 런 길이 | ' + A.lengthMean.toFixed(1) + ' | ' + B.lengthMean.toFixed(1) + ' | ' + lenDiff.meanDiff.toFixed(2) +
    ' (' + lenDiff.lo.toFixed(2) + '~' + lenDiff.hi.toFixed(2) + ') | ' + (lenDiff.significant ? '예' : '**아니오**') + ' |');
  out.push('');
  out.push('> 차이 구간이 0 을 포함하면(유의=아니오) "효과가 있다"고 말할 수 없다. 판수를 늘려라.');
  out.push('> 같은 시드로 짝지어 비교하므로 게임 자체의 편차가 상쇄된다 — 독립 표본보다 적은 판수로 잡힌다.', '');
}

out.push('## [기준]');
out.push('목표 지표 출처: `sim/targets.mjs` (기획 문서에서 옮겨온 값 — 문서 경로와 줄을 거기 주석으로 적어라)', '');

out.push('## [공백]');
if (PLACEHOLDER) out.push('- **게임 로직 전체.** game.mjs 가 자리표시자라 이번 실행은 아무것도 측정하지 않았다.');
out.push('- 봇이 측정하지 못하는 축(체감·연출·첫 인상·학습 곡선)은 여기 남는다 → `playtest-capture` 로 넘긴다.');
out.push('- 정책 ' + POLICY_NAME + ' 기준 수치다. ' +
  (POLICY_NAME === 'greedy'
    ? '봇이 기능을 소극적으로 쓰면 하한 추정이다.'
    : '무작위 정책이므로 승률의 하한이다.'));
if (dirty) out.push('- **미커밋 변경이 있는 상태로 측정했다.** 재현하려면 커밋 후 다시 돌려라.');
if (!commit) out.push('- **git 저장소가 아니라 대상 커밋을 기록하지 못했다.** 다음 측정과 비교할 수 없다.');
out.push('');

out.push('## [잔여 위험]');
out.push('- (통과했지만 남는 위험을 여기 적는다. 비워두면 "위험이 없다"는 주장이 된다.)', '');

const report = out.join('\n');
console.log(report);

if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + '/report.md', report);
  fs.writeFileSync(OUT + '/results.json', JSON.stringify({
    meta: { seed: SEED, runs: RUNS, policy: POLICY_NAME, commit, dirty, ab: AB, at: new Date().toISOString() },
    targets: TARGETS,
    a: strip(A),
    b: B ? strip(B) : null,
  }, null, 2));
  console.log('-> ' + OUT + '/report.md · results.json');
}

if (winJudge.verdict === '미달') process.exit(1);
if (winJudge.verdict === '측정 불가') process.exit(3);
