#!/usr/bin/env node
// econ-run.mjs - 페르소나별 코호트 시뮬 + 공정성 판정.
//
//   node econ-sim/econ-run.mjs --seed 7 --cohort 10000 --days 30
//   node econ-sim/econ-run.mjs --seed 7 --cohort 10000 --days 30 --out econ-out
//   node econ-sim/econ-run.mjs --seed 7 --ab upgradeCostGrowth=1.15
//
// balance-sim 과 나뉘는 지점: 이건 "재미"가 아니라 "경제가 성립하고 공정한가"를 본다.
// 종료 코드: 0 충족 · 1 미달 · 3 측정 불가
//
// **평균 1명을 시뮬하지 않는다.** 페르소나별로 따로 돌려 곡선을 비교한다 - 평균으로 뭉개면
// 무과금과 과금자의 격차가 사라지고, "무과금도 완주 가능한가"에 답할 수 없다.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeRng, runSeed } from './rng.mjs';
import { PERSONAS, normalizedShares } from './personas.mjs';
import { simulatePlayer, defaultConfig, PLACEHOLDER } from './economy.mjs';
import { ECON_TARGETS } from './econ-targets.mjs';
import {
  wilson, requiredN, judgeAgainstTarget, pairedDiff, mean, quantile,
  pct, textTable, METRIC_TABLE_HEAD, metricRow,
} from './lib-stats.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node econ-run.mjs [--seed 7] [--cohort 10000|auto] [--margin 0.02] [--days 30] [--ab key=value] [--out dir]');
  process.exit(2);
}

const SEED = Number(opt('--seed', 7));
const DAYS = Number(opt('--days', 30));
const MARGIN = Number(opt('--margin', 0.02));
const COHORT_ARG = opt('--cohort', 'auto');
const COHORT = COHORT_ARG === 'auto' ? requiredN(MARGIN) : Number(COHORT_ARG);
const AB = opt('--ab', null);
const OUT = opt('--out', null);

const git = (a) => {
  try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
};
const commit = git(['rev-parse', '--short', 'HEAD']);
const dirty = (git(['status', '--porcelain']) || '').length > 0;

const { personas, sum: shareSum } = normalizedShares(PERSONAS);

/** 페르소나 하나를 n명 시뮬. 시드는 페르소나 인덱스로 갈라 재현 가능하게. */
function cohort(persona, pIndex, config, n) {
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push(simulatePlayer({
      rng: makeRng(runSeed(SEED + pIndex * 7919, i)),
      config, persona, days: DAYS,
    }));
  }
  return players;
}

function aggregate(persona, players) {
  const n = players.length;
  const activeOn = (day) => players.filter((p) => p.activeDays.includes(day)).length;
  const completed = players.filter((p) => p.completedDay !== undefined);
  const payers = players.filter((p) => p.spend > 0);
  const totalDays = players.reduce((a, p) => a + p.activeDays.length, 0);
  const blocked = players.reduce((a, p) => a + p.blockedDays, 0);
  return {
    persona: persona.name,
    segment: persona.segment,
    share: persona.share,
    n,
    d1: wilson(activeOn(Math.min(2, DAYS)), n),   // D1 = 가입 다음날 접속
    d7: wilson(activeOn(Math.min(7, DAYS)), n),
    d30: DAYS >= 30 ? wilson(activeOn(30), n) : null,
    completion: wilson(completed.length, n),
    completionDaysMedian: completed.length ? quantile(completed.map((p) => p.completedDay), 0.5) : NaN,
    progressMean: mean(players.map((p) => p.progress)),
    spendMean: mean(players.map((p) => p.spend)),
    arppu: payers.length ? mean(payers.map((p) => p.spend)) : 0,
    payerRate: wilson(payers.length, n),
    adsMean: mean(players.map((p) => p.adsWatched)),
    blockedRatio: totalDays > 0 ? blocked / (totalDays + blocked) : NaN,
    earnedMean: mean(players.map((p) => p.earned)),
    spentMean: mean(players.map((p) => p.spentCurrency)),
    raw: players,
  };
}

function runAll(config) {
  return personas.map((p, i) => aggregate(p, cohort(p, i, config, COHORT)));
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

const baseConfig = { ...defaultConfig };
let abConfig = null;
if (AB) {
  const eq = AB.indexOf('=');
  if (eq < 0) { console.error('--ab 형식: key=value'); process.exit(2); }
  abConfig = { ...baseConfig, [AB.slice(0, eq)]: isNaN(Number(AB.slice(eq + 1))) ? AB.slice(eq + 1) : Number(AB.slice(eq + 1)) };
}

const t0 = Date.now();
const A = runAll(baseConfig);
const B = abConfig ? runAll(abConfig) : null;
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const f2p = A.find((r) => r.segment === 'f2p');
const topPayer = A.filter((r) => r.segment !== 'f2p').sort((a, b) => b.progressMean - a.progressMean)[0];
const progressGap = f2p && topPayer && f2p.progressMean > 0 ? topPayer.progressMean / f2p.progressMean : NaN;

// 가중 평균 (전체 유저 기준 지표)
const weighted = (fn) => A.reduce((a, r) => a + fn(r) * r.share, 0);

// ── 판정 ─────────────────────────────────────────────────────────────────────

const checks = [];
const add = (label, verdict, why) => checks.push({ label, verdict, why });

if (PLACEHOLDER) {
  add('전체', '측정 불가', 'economy.mjs 가 아직 자리표시자다 (PLACEHOLDER = true) — 실제 경제 로직으로 바꿔야 측정이 시작된다');
} else {
  if (f2p) {
    const c = judgeAgainstTarget(f2p.completion, ECON_TARGETS.f2pCompletionRate);
    add('무과금 완주율', c.verdict, c.why + ` (실측 ${pct(f2p.completion.p)})`);

    if (Number.isFinite(f2p.completionDaysMedian)) {
      const okDays = f2p.completionDaysMedian <= ECON_TARGETS.f2pCompletionDays;
      add('무과금 완주 소요', okDays ? '충족' : '미달',
        `중위 ${f2p.completionDaysMedian.toFixed(0)}일 (상한 ${ECON_TARGETS.f2pCompletionDays}일)`);
    } else {
      add('무과금 완주 소요', '미달', `완주자가 없다 — ${DAYS}일 안에 아무도 완주하지 못했다 (페이월 의심)`);
    }

    if (Number.isFinite(f2p.blockedRatio)) {
      const okBlock = f2p.blockedRatio <= ECON_TARGETS.maxBlockedDayRatio;
      add('무과금 진행 막힘', okBlock ? '충족' : '미달',
        `재화 부족으로 진행 못 한 비율 ${pct(f2p.blockedRatio)} (상한 ${pct(ECON_TARGETS.maxBlockedDayRatio)})`);
    }
  } else {
    add('무과금 완주율', '측정 불가', "personas.mjs 에 segment 'f2p' 페르소나가 없다");
  }

  if (Number.isFinite(progressGap)) {
    const okGap = progressGap <= ECON_TARGETS.maxProgressGap;
    add('페이투윈 격차', okGap ? '충족' : '미달',
      `${topPayer.persona} / 무과금 진행도 = ${progressGap.toFixed(2)}배 (상한 ${ECON_TARGETS.maxProgressGap}배)`);
  }

  const wD1 = wilson(Math.round(weighted((r) => r.d1.p) * COHORT), COHORT);
  const d1j = judgeAgainstTarget(wD1, ECON_TARGETS.retentionD1);
  add('D1 리텐션(가중)', d1j.verdict, d1j.why + ` (실측 ${pct(wD1.p)})`);
}

const worst = checks.some((c) => c.verdict === '측정 불가') ? '측정 불가'
  : checks.some((c) => c.verdict === '미달') ? '미달' : '충족';

// ── 리포트 ───────────────────────────────────────────────────────────────────

const cmd = 'node econ-sim/econ-run.mjs --seed ' + SEED + ' --cohort ' + COHORT + ' --days ' + DAYS + (AB ? ' --ab ' + AB : '');
const out = [];
out.push('', '# 경제 검증 리포트', '');
out.push('시드 **' + SEED + '** · 페르소나별 **' + COHORT + '명** · **' + DAYS + '일** · 커밋 **' +
  (commit || '(git 없음)') + (dirty ? ' +미커밋변경' : '') + '** · ' + elapsed + 's');
if (COHORT_ARG === 'auto') out.push('', '> 코호트 크기는 목표 오차 ±' + pct(MARGIN) + ' 에서 역산했다.');
if (PLACEHOLDER) out.push('', '> **경고: economy.mjs 가 자리표시자다.** 아래 수치는 하네스 동작 확인용이며 경제를 측정한 것이 아니다.');
if (Math.abs(shareSum - 1) > 0.01) out.push('', '> 페르소나 비중 합이 ' + shareSum.toFixed(3) + ' 이라 정규화했다. `personas.mjs` 를 확인해라.');
out.push('');

out.push('## [주장]');
out.push('경제 판정: **' + worst + '**', '');
out.push('| 항목 | 판정 | 근거 |', '|---|---|---|');
for (const c of checks) out.push('| ' + c.label + ' | **' + c.verdict + '** | ' + c.why + ' |');
out.push('');

out.push('## [증거]');
out.push('```', cmd, '```', '');
out.push('### 페르소나별 곡선 — 평균으로 뭉개면 안 보이는 것', '```');
out.push(textTable(
  ['페르소나', '비중', 'D1', 'D7', '완주율', '완주중위', '진행도', 'ARPPU', '광고', '막힘'],
  A.map((r) => [
    r.persona, pct(r.share, 1), pct(r.d1.p), pct(r.d7.p), pct(r.completion.p),
    Number.isFinite(r.completionDaysMedian) ? r.completionDaysMedian.toFixed(0) + '일' : '없음',
    r.progressMean.toFixed(1), r.arppu.toFixed(1), r.adsMean.toFixed(1),
    Number.isFinite(r.blockedRatio) ? pct(r.blockedRatio) : '-',
  ]),
));
out.push('```', '');
if (Number.isFinite(progressGap)) {
  out.push('**진행도 격차: ' + progressGap.toFixed(2) + '배** (' + topPayer.persona + ' vs 무과금). ' +
    '이 값이 크면 무과금은 같은 게임을 하는 게 아니다.', '');
}

out.push('### 리텐션 (95% CI)', '```');
out.push(textTable(
  ['페르소나', 'D1', 'D7', 'D30'],
  A.map((r) => [
    r.persona,
    pct(r.d1.p) + ' (' + pct(r.d1.lo) + '~' + pct(r.d1.hi) + ')',
    pct(r.d7.p) + ' (' + pct(r.d7.lo) + '~' + pct(r.d7.hi) + ')',
    r.d30 ? pct(r.d30.p) + ' (' + pct(r.d30.lo) + '~' + pct(r.d30.hi) + ')' : '기간부족',
  ]),
));
out.push('```', '');

out.push('### 재화 수지 (소스 vs 싱크)', '```');
out.push(textTable(
  ['페르소나', '획득', '소비', '잔액', '판정'],
  A.map((r) => {
    const bal = r.earnedMean - r.spentMean;
    const infl = r.earnedMean > 0 ? bal / r.earnedMean : 0;
    return [r.persona, r.earnedMean.toFixed(0), r.spentMean.toFixed(0), bal.toFixed(0),
      infl > 0.35 ? '인플레 의심' : infl < -0.05 ? '계산오류' : '정상'];
  }),
));
out.push('```', '');
out.push('> 잔액이 계속 쌓이면 싱크가 부족한 것이다(인플레). 싱크 없는 재화는 곧 의미 없는 재화가 된다.', '');

if (B) {
  out.push('## [A/B] 공통 난수 대응 비교', '');
  out.push('변경: `' + AB + '`', '');
  out.push('| 페르소나 | 지표 | OFF | ON | 차이 (95% CI) | 유의 |', '|---|---|---|---|---|---|');
  for (let i = 0; i < A.length; i++) {
    const d = pairedDiff(A[i].raw.map((p) => p.progress), B[i].raw.map((p) => p.progress));
    out.push('| ' + A[i].persona + ' | 진행도 | ' + A[i].progressMean.toFixed(1) + ' | ' + B[i].progressMean.toFixed(1) +
      ' | ' + d.meanDiff.toFixed(2) + ' (' + d.lo.toFixed(2) + '~' + d.hi.toFixed(2) + ') | ' +
      (d.significant ? '예' : '**아니오**') + ' |');
  }
  out.push('');
  out.push('> 같은 시드로 짝지어 비교하므로 코호트 편차가 상쇄된다. 차이 구간이 0 을 포함하면 효과를 주장할 수 없다.', '');
}

out.push('## [기준]');
out.push('목표 지표 출처: `econ-sim/econ-targets.mjs` (경제 원장·기획 문서에서 옮겨온 값 — 경로·줄을 주석에 적어라)', '');

out.push('## [공백]');
if (PLACEHOLDER) out.push('- **경제 로직 전체.** economy.mjs 가 자리표시자라 이번 실행은 아무것도 측정하지 않았다.');
out.push('- **컴플라이언스는 시뮬로 판정되지 않는다.** 확률형 아이템 확률 공개(한국 등 법적 의무),');
out.push('  미성년 지출 보호는 사람이 확인한다. 출시 전 실제 법률 검토가 필요하다.');
out.push('- **다크패턴 판정은 수치가 아니다.** 강제 FOMO·미끼 확률·손실 회피 악용은 설계 리뷰 대상이다.');
out.push('- 페르소나 파라미터는 **가정**이다. 실제 유저 행동과 다르면 이 곡선 전체가 틀린다 —');
out.push('  라이브 데이터(분석 커넥터)가 있으면 대조해 파라미터를 보정해라.');
if (DAYS < 30) out.push('- 시뮬 ' + DAYS + '일이라 D30 을 측정하지 못했다.');
if (dirty) out.push('- **미커밋 변경이 있는 상태로 측정했다.**');
out.push('');

out.push('## [잔여 위험]');
out.push('- (통과했지만 남는 위험을 여기 적는다. 비워두면 "위험이 없다"는 주장이 된다.)', '');

const report = out.join('\n');
console.log(report);

if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + '/econ-report.md', report);
  fs.writeFileSync(OUT + '/econ-results.json', JSON.stringify({
    meta: { seed: SEED, cohort: COHORT, days: DAYS, commit, dirty, ab: AB, at: new Date().toISOString() },
    targets: ECON_TARGETS, checks, progressGap,
    personas: A.map(({ raw, ...rest }) => rest),
  }, null, 2));
  console.log('-> ' + OUT + '/econ-report.md · econ-results.json');
}

if (worst === '미달') process.exit(1);
if (worst === '측정 불가') process.exit(3);
