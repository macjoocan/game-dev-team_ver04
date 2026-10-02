#!/usr/bin/env node
// dot-rules.mjs - 상용 도트에서 **보정 규칙을 측정해서 뽑는다.**
//   node dot-rules.mjs <레퍼런스폴더> [--sample 400] [--out rules.json]
//   node dot-rules.mjs <대상.png|폴더> --against rules.json      # 대조
//
// 왜 측정인가: 도트 찍는 사람에게 "규칙이 뭐냐"고 물으면 추상적인 답이 온다("깔끔하게").
// 물어볼 사람이 없을 수도 있다. 그런데 **상용 도트 자체가 규칙의 증거**다 —
// 수천 장을 재면 그 바닥이 실제로 지키는 값이 분포로 나온다.
// 도트 계약(색 22 중앙값 · 반투명 0% · 외톨이 6~11%)도 이렇게 뽑았다.
//
// 여기서 재는 것은 계약이 **안 보던 축**이다:
//   1) 계단(jaggy) — 대각 경계의 런렝스가 고른가. "AI 티"의 대부분이 여기 있다
//   2) 외곽선 — 쓰는가, 단색인가
//   3) 명암 단계 — 한 색군에 몇 단계를 쓰는가
//
// **이 도구는 게이트가 아니다.** 분포를 내놓을 뿐이고, 게이트로 쓸지는 사람이 정한다.
// 임의 임계값을 박았다가 멀쩡한 결과를 기각한 적이 세 번 있다.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { toLab, parseHex } from '../../../scripts/lib-color.mjs';

const args = process.argv.slice(2);
const target = args[0];
if (!target || target.startsWith('--')) {
  console.error('usage: node dot-rules.mjs <레퍼런스폴더> [--sample 400] [--out rules.json]');
  console.error('       node dot-rules.mjs <대상.png|폴더> --against rules.json');
  console.error('  측정 축: 계단 런렝스 · 외곽선 · 명암 단계. (색 수·반투명·외톨이는 pixel-contract 가 본다)');
  process.exit(2);
}
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SAMPLE = Number(opt('--sample', 400));
const AGAINST = opt('--against', null);

function listPngs(root, limit) {
  const out = [];
  (function walk(d) {
    if (out.length >= limit) return;
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= limit) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.png')) out.push(p);
    }
  })(root);
  return out;
}

const key = (d, o) => (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];

/**
 * 계단(jaggy) 측정.
 *
 * 도트에서 대각선은 **같은 길이의 계단**으로 내려간다(2-2-2, 혹은 1-1-1).
 * 길이가 제멋대로면(1-3-2-1) 사람 눈에 "지저분하다"로 읽힌다.
 * 그래서 **실루엣 경계를 따라가며 수평 런의 길이**를 모으고, 그 **고르기**를 본다.
 *
 * 구현: 각 행에서 알파 경계(왼쪽 끝 픽셀)의 x 를 구하고, 연속한 행끼리 x 가 같으면 런이 이어진다.
 * x 가 바뀌면 런이 끊긴다. 그 런 길이들의 분포가 계단 패턴이다.
 */
function jaggy(img) {
  const { width: w, height: h, data } = img;
  const edgeX = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 127) { edgeX[y] = x; break; }
  }
  const runs = [];
  let cur = 0;
  for (let y = 0; y < h; y++) {
    if (edgeX[y] < 0) { if (cur) { runs.push(cur); cur = 0; } continue; }
    if (y > 0 && edgeX[y] === edgeX[y - 1]) cur++;
    else { if (cur) runs.push(cur); cur = 1; }
  }
  if (cur) runs.push(cur);
  // 수직 경계만 있는(= 런 하나짜리) 스프라이트는 계단 정보가 없다
  if (runs.length < 4) return null;
  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  const varr = runs.reduce((a, b) => a + (b - mean) ** 2, 0) / runs.length;
  // 고립 런(길이 1 이 더 긴 런들 사이에 낀 것) 비율 — 이게 "튄다"의 정체다
  let orphan = 0;
  for (let i = 1; i < runs.length - 1; i++) if (runs[i] === 1 && runs[i - 1] > 1 && runs[i + 1] > 1) orphan++;
  return { runCount: runs.length, meanRun: mean, cv: mean ? Math.sqrt(varr) / mean : 0, orphanRatio: orphan / runs.length };
}

/**
 * 외곽선 — 실루엣 가장자리 픽셀이 내부보다 어두운가, 그리고 **한 색으로 통일됐는가.**
 * 우리 이전 실측(300장)은 "27% 만 더 어둡다"였다. 여기서는 **통일성**을 추가로 본다.
 */
function outline(img) {
  const { width: w, height: h, data } = img;
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 127;
  const edge = [], inner = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (data[o + 3] <= 127) continue;
    const isEdge = !op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1);
    (isEdge ? edge : inner).push(o);
  }
  if (edge.length < 12 || inner.length < 12) return null;
  const lum = (o) => 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  const eL = edge.reduce((a, o) => a + lum(o), 0) / edge.length;
  const iL = inner.reduce((a, o) => a + lum(o), 0) / inner.length;
  const counts = new Map();
  for (const o of edge) { const k = key(data, o); counts.set(k, (counts.get(k) || 0) + 1); }
  const top = Math.max(...counts.values());
  return {
    darker: (eL - iL) / 255,                 // 음수면 가장자리가 더 어둡다
    edgeColors: counts.size,
    topShare: top / edge.length,             // 1 에 가까우면 외곽선이 단색이다
  };
}

/** 명암 단계 — 색상(hue)이 비슷한 색끼리 묶어, 한 색군이 몇 단계를 쓰는지 */
function shadeSteps(img) {
  const { width: w, height: h, data } = img;
  const counts = new Map();
  for (let p = 0; p < w * h; p++) {
    const o = p * 4; if (data[o + 3] <= 127) continue;
    const k = key(data, o); counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (counts.size < 2) return null;
  const cols = [...counts.keys()].map((k) => {
    const r = (k >> 16) & 255, g = (k >> 8) & 255, b = k & 255;
    return { lab: toLab({ r: r / 255, g: g / 255, b: b / 255 }) };
  });
  // a,b (색도) 가 가까우면 같은 색군. L 만 다른 = 명암 단계다.
  const groups = [];
  for (const c of cols) {
    let g = groups.find((G) => Math.hypot(G.a - c.lab.a, G.b - c.lab.b) < 12);
    if (!g) { g = { a: c.lab.a, b: c.lab.b, n: 0 }; groups.push(g); }
    g.n++;
  }
  const sizes = groups.map((g) => g.n).sort((a, b) => b - a);
  return { groups: groups.length, maxSteps: sizes[0], medianSteps: sizes[Math.floor(sizes.length / 2)] };
}

const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const stat = (arr) => arr.length ? { n: arr.length, p25: +q(arr, 0.25).toFixed(3), median: +q(arr, 0.5).toFixed(3), p75: +q(arr, 0.75).toFixed(3), p95: +q(arr, 0.95).toFixed(3) } : null;

// ── 실행 ─────────────────────────────────────────────────────────────────────
const files = fs.existsSync(target) && fs.statSync(target).isDirectory()
  ? listPngs(target, AGAINST ? 1e9 : SAMPLE)
  : [target];
if (!files.length) { console.error('PNG 가 없다.'); process.exit(2); }

const J = { cv: [], orphan: [], meanRun: [] }, O = { darker: [], edgeColors: [], topShare: [] }, S = { groups: [], maxSteps: [] };
let used = 0;
for (const f of files) {
  let img; try { img = readPNG(f); } catch { continue; }
  if (img.width < 12 || img.height < 12) continue;
  const j = jaggy(img); if (j) { J.cv.push(j.cv); J.orphan.push(j.orphanRatio); J.meanRun.push(j.meanRun); }
  const o = outline(img); if (o) { O.darker.push(o.darker); O.edgeColors.push(o.edgeColors); O.topShare.push(o.topShare); }
  const s = shadeSteps(img); if (s) { S.groups.push(s.groups); S.maxSteps.push(s.maxSteps); }
  used++;
}

const rules = {
  measuredFrom: path.resolve(target), sampled: used, at: new Date().toISOString(),
  jaggy: { cv: stat(J.cv), orphanRatio: stat(J.orphan), meanRun: stat(J.meanRun) },
  outline: { darker: stat(O.darker), edgeColors: stat(O.edgeColors), topShare: stat(O.topShare) },
  shade: { groups: stat(S.groups), maxSteps: stat(S.maxSteps) },
};

if (AGAINST) {
  const ref = JSON.parse(fs.readFileSync(AGAINST, 'utf8'));
  console.log(`# 대조 — 대상 ${used}장 vs 레퍼런스 ${ref.sampled}장\n`);
  const row = (label, mine, theirs) => {
    if (!mine || !theirs) return;
    const inBand = mine.median >= theirs.p25 && mine.median <= theirs.p75;
    const inRange = mine.median <= theirs.p95;
    console.log(`  ${inBand ? 'O' : inRange ? '~' : 'X'} ${label.padEnd(22)} 우리 ${String(mine.median).padStart(7)}  |  상용 ${theirs.p25}~${theirs.p75} (p95 ${theirs.p95})`);
  };
  row('계단 고르기(cv)', rules.jaggy.cv, ref.jaggy.cv);
  row('계단 고립런 비율', rules.jaggy.orphanRatio, ref.jaggy.orphanRatio);
  row('계단 평균 길이', rules.jaggy.meanRun, ref.jaggy.meanRun);
  row('외곽선 어두움', rules.outline.darker, ref.outline.darker);
  row('외곽선 색 수', rules.outline.edgeColors, ref.outline.edgeColors);
  row('외곽선 단색 비율', rules.outline.topShare, ref.outline.topShare);
  row('색군 수', rules.shade.groups, ref.shade.groups);
  row('색군당 최대 단계', rules.shade.maxSteps, ref.shade.maxSteps);
  console.log('\n  O = 상용 사분위 안 · ~ = p95 안 · X = 벗어남');
  console.log('  **색군 수는 스프라이트 한 장당 수치다.** 폴더를 재면 장별 중앙값이 나온다 —');
  console.log('  캐스트를 한 덩어리로 보고 색군을 줄이면 캐릭터 고유색이 서로 끌려간다(2026-10-02 실측).');
  console.log('  **X 가 곧 불합격이 아니다.** 화풍 차이일 수 있다 — 사람이 보고 정한다.');
} else {
  const OUT = opt('--out', 'dot-rules.json');
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rules, null, 2) + '\n');
  console.log(`# 상용 도트 규칙 측정 — ${used}장\n`);
  const show = (label, s) => s && console.log(`  ${label.padEnd(22)} 중앙값 ${String(s.median).padStart(7)}  사분위 ${s.p25}~${s.p75}  p95 ${s.p95}`);
  show('계단 고르기(cv)', rules.jaggy.cv);
  show('계단 고립런 비율', rules.jaggy.orphanRatio);
  show('계단 평균 길이', rules.jaggy.meanRun);
  show('외곽선 어두움', rules.outline.darker);
  show('외곽선 색 수', rules.outline.edgeColors);
  show('외곽선 단색 비율', rules.outline.topShare);
  show('색군 수', rules.shade.groups);
  show('색군당 최대 단계', rules.shade.maxSteps);
  console.log(`\n-> ${OUT}`);
  console.log('\n**이건 게이트가 아니라 분포다.** 보정 도구의 목표값으로 쓰고, 게이트 승격은 사람이 정한다.');
}
