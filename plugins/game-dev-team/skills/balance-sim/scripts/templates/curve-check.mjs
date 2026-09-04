#!/usr/bin/env node
// curve-check.mjs - 난이도 곡선의 **모양**을 판정한다.
//
//   node sim/curve-check.mjs <results.json|stages.json> [--band 0.35,0.75] [--spike 0.25]
//
// 스테이지별 클리어율은 이미 뽑고 있는 값이다(예: 51/38/68/100/46). 그런데 지금은 그
// **수열의 모양**을 아무도 판정하지 않는다. 난이도 곡선은 계단형이 정상이다 - 올라가다
// 평지, 보스에서 스파이크. 무작위로 요동치면 플레이어가 난이도를 학습할 수 없다.
//
// 두 가지를 제대로 해야 결과가 의미를 갖는다:
//
//   1) **조건부 통과율**로 본다. "그 스테이지에서 죽은 판수"는 난이도가 아니다 - 뒤쪽은
//      도달한 사람이 적어서 사망자도 적다. 도달한 판 중 넘은 비율이 난이도다.
//   2) **진행 순서**를 알아야 한다. 빈도순으로 늘어놓고 판정하면 "역전 구간"이 전부 허위로 나온다.
//      순서는 targets.mjs 의 stageOrder 로 주고, 없으면 이름 자연순으로 **추론**한다(추론이라고 밝힌다).
//
// 입력 형식 (둘 다 받는다):
//   run.mjs --out 의 results.json                                       (exits + stageOrder 로 퍼널 유도)
//   또는 직접 만든 { "stages": [{ "name", "reached", "cleared" }, ...] }  (이미 퍼널인 경우)

import fs from 'node:fs';
import { curveShape, exitsToFunnel, naturalSort, pct, textTable } from './lib-stats.mjs';
import { TARGETS } from './targets.mjs';

const args = process.argv.slice(2);
const src = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!src || src.startsWith('--')) {
  console.error('usage: node curve-check.mjs <results.json|stages.json> [--band 0.35,0.75] [--spike 0.25]');
  console.error('  입력: run.mjs 의 results.json, 또는 { "stages": [{ "name", "reached", "cleared" }, ...] }');
  console.error('  진행 순서: targets.mjs 의 stageOrder 에 적어라 (없으면 이름 자연순으로 추론)');
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const notes = [];
let stages = raw.stages;

if (!stages && raw.a) {
  const total = raw.a.n;
  const exits = raw.a.exits || [];
  if (!exits.length) {
    console.error('results.json 에 exits 가 없다. game.mjs 가 exitStage 를 돌려주는지 확인해라.');
    process.exit(3);
  }
  // 클리어(승리)로 끝난 항목은 스테이지가 아니다 - 퍼널의 끝이다.
  const dieExits = exits.filter((e) => e.id !== 'clear');

  let order = TARGETS.stageOrder;
  if (!Array.isArray(order) || !order.length) {
    order = naturalSort(dieExits.map((e) => e.id));
    notes.push('진행 순서를 **이름 자연순으로 추론**했다 — 실제 순서와 다르면 판정이 틀린다. ' +
      '`targets.mjs` 의 `stageOrder` 에 진짜 순서를 적어라.');
  } else {
    const unknown = dieExits.map((e) => e.id).filter((id) => !order.includes(id));
    if (unknown.length) notes.push('stageOrder 에 없는 이탈 지점이 있다: ' + unknown.join(', ') + ' (판정에서 빠진다)');
  }
  stages = exitsToFunnel(order, dieExits, total);
  notes.push('통과율은 **조건부**다 — 그 스테이지에 도달한 판 중 넘은 비율.');
}

if (!Array.isArray(stages) || !stages.length) {
  console.error('스테이지 목록을 못 찾았다.');
  process.exit(3);
}

const bandArg = (opt('--band', null) || '').split(',').map(Number).filter(Number.isFinite);
const band = bandArg.length === 2 ? bandArg : TARGETS.clearBand;
const spike = Number(opt('--spike', TARGETS.clearSpike));
const result = curveShape(stages, { band, spike, exceptions: TARGETS.clearExceptions || [] });

console.log('');
console.log('# 난이도 곡선 판정');
console.log('');
console.log(textTable(
  ['스테이지', '도달', '통과율', '95% CI', '구간', '예외'],
  result.rows.map((r) => [
    r.name,
    r.reached,
    pct(r.p),
    pct(r.lo) + '~' + pct(r.hi),
    r.late ? '후반' : '',
    r.exception ? '등재' : '',
  ]),
));
console.log('');
console.log('좌절선 ' + pct(band[0]) + ' · 후반 지루함선 ' + pct(band[1]) + ' · 허용 낙차 ' + pct(spike));
console.log('');

console.log('## [주장]');
console.log('곡선 판정: **' + result.verdict + '**');
console.log('');

if (result.findings.length) {
  console.log('## [발견]');
  for (const f of result.findings) console.log('- **' + f.kind + '** ' + f.stage + ': ' + f.msg);
  console.log('');
}
if (result.inversions.length) {
  console.log('## [역전 구간]');
  console.log('뒤 스테이지가 앞보다 **확실히 쉽다**. 의도한 평지·휴식 구간이면 괜찮지만,');
  console.log('아니면 난이도 순서가 잘못됐다는 신호다.');
  for (const i of result.inversions) console.log('- ' + i);
  console.log('');
}
if (!result.findings.length && !result.inversions.length) {
  console.log('발견된 결함 없음 — 좌절 벽 없음, 후반 램프 살아 있음, 급락·역전 없음.');
  console.log('');
}

console.log('## [공백]');
for (const n of notes) console.log('- ' + n);
console.log('- 이건 **통과율 수열의 모양**만 본다. 스테이지가 재밌는지는 판정하지 않는다.');
console.log('- 봇 통과율이며 사람 통과율이 아니다. 학습 곡선(사람이 실패하며 배우는 과정)은');
console.log('  봇으로 측정되지 않는다 → `playtest-capture` 로 넘긴다.');
if (result.unmeasurable.length) {
  console.log('- 판정 불가 스테이지: ' + result.unmeasurable.join(', ') + ' — 이 구간의 결함 유무는 말할 수 없다.');
}
console.log('');

if (result.verdict === '미달') process.exit(1);
if (result.verdict === '측정 불가') process.exit(3);
