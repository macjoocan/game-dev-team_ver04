#!/usr/bin/env node
// style-score.mjs - 생성물이 스타일 프로필에 맞는지 채점하고 자동 탈락시킨다.
//   node style-score.mjs <생성이미지폴더> --profile <profile.json> [--out <dir>] [--pass 70]
//
// 무제한 생성이 가능해지는 순간 병목은 "뭘 쓸지 고르기"로 옮겨간다. 이 스크립트가 그 앞단을
// 자른다 — 규격은 기계가 100% 판정하고, 사람은 통과한 상위 몇 장만 본다.
//
// 판정 항목 (전부 profile.json 의 target 과 대조):
//   단일 피사체 · 배경 순도 · 채도 · 명도 · 외곽선 성향 · 피사체 면적비 · 축소 판독성 · 팔레트 거리
//
// 주의: 이건 **규격** 채점이다. 그림이 좋은지는 판정하지 않는다 — 그건 사람이 본다.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG, rgb2hsv, toHex } from '../../../scripts/lib-png-read.mjs';
import { parseHex, toLab, flattenPalette } from '../../../scripts/lib-color.mjs';

const args = process.argv.slice(2);
const root = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PROFILE = opt('--profile', null);
const OUT = opt('--out', null);
const PASS = Number(opt('--pass', 70));
const PALETTE = opt('--palette', null);

if (!root || root.startsWith('--') || !PROFILE) {
  console.error('usage: node style-score.mjs <이미지폴더> --profile <profile.json> [--out dir] [--pass 70]');
  process.exit(2);
}
const prof = JSON.parse(fs.readFileSync(PROFILE, 'utf8'));
// 프로젝트 팔레트(선택) — art-direction 의 palette.json. 있으면 톤 준수를 함께 채점한다.
const projectHexes = PALETTE
  ? Object.values(flattenPalette(JSON.parse(fs.readFileSync(PALETTE, 'utf8'))))
  : [];
const T = prof.target;

const files = fs.readdirSync(root).filter((f) => /\.png$/i.test(f)).map((f) => path.join(root, f));
if (!files.length) { console.log(`PNG 가 없다: ${root}`); process.exit(0); }

// ── 측정 ─────────────────────────────────────────────────────────────────────
function measure(img) {
  const { width: w, height: h, data } = img;
  const px = (x, y) => (y * w + x) * 4;

  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { hasAlpha = true; break; }
  const cnt = new Map();
  const cs = Math.max(2, Math.floor(Math.min(w, h) * 0.04));
  for (const [ox, oy] of [[0, 0], [w - cs, 0], [0, h - cs], [w - cs, h - cs]]) {
    for (let y = oy; y < oy + cs; y++) for (let x = ox; x < ox + cs; x++) {
      const i = px(x, y);
      const k = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
  }
  const bg = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map((v) => (Number(v) << 3) + 4);
  const isBg = (i) => (hasAlpha && data[i + 3] < 24) ||
    (Math.abs(data[i] - bg[0]) < 18 && Math.abs(data[i + 1] - bg[1]) < 18 && Math.abs(data[i + 2] - bg[2]) < 18);

  // 피사체 마스크 + 통계
  const mask = new Uint8Array(w * h);
  let subject = 0, dark = 0, bgPure = 0;
  const sats = [], vals = [], colors = [];
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 3000)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = px(x, y);
    if (isBg(i)) { bgPure++; continue; }
    mask[y * w + x] = 1; subject++;
    const { s, v } = rgb2hsv(data[i], data[i + 1], data[i + 2]);
    if (v < 0.28) dark++;
    if (x % step === 0 && y % step === 0) { sats.push(s); vals.push(v); colors.push([data[i], data[i + 1], data[i + 2]]); }
  }
  if (!subject) return null;

  // 연결 성분 — 한 장에 캐릭터가 여러 개면 여기서 걸린다(캐릭터 시트로 새는 사고).
  // 노이즈를 세지 않으려고 전체 면적의 0.5% 이상인 덩어리만 센다.
  const seen = new Uint8Array(w * h);
  const minBlob = w * h * 0.005;
  const blobs = [];
  const stack = new Int32Array(w * h);
  for (let p0 = 0; p0 < w * h; p0++) {
    if (!mask[p0] || seen[p0]) continue;
    let sp = 0, area = 0;
    stack[sp++] = p0; seen[p0] = 1;
    while (sp > 0) {
      const p = stack[--sp]; area++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    if (area >= minBlob) blobs.push(area);
  }
  blobs.sort((a, b) => b - a);

  const N = 32;
  let sum = 0, sum2 = 0;
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const i = px(Math.floor((gx + 0.5) * w / N), Math.floor((gy + 0.5) * h / N));
    const v = rgb2hsv(data[i], data[i + 1], data[i + 2]).v;
    sum += v; sum2 += v * v;
  }
  const mean = sum / (N * N);
  const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

  return {
    w, h, bgHex: toHex(bg[0], bg[1], bg[2]),
    bgPurity: bgPure / (w * h),
    subjectRatio: subject / (w * h),
    darkRatio: dark / subject,
    saturation: med(sats),
    value: med(vals),
    smallSizeContrast: Math.sqrt(Math.max(0, sum2 / (N * N) - mean * mean)),
    blobs: blobs.length,
    secondBlobShare: blobs.length > 1 ? blobs[1] / blobs[0] : 0,
    colors,
  };
}

// 팔레트 거리 — 생성물 색이 프로필 대표색 근처에 있나 (0=완전 일치, 1=완전 이탈)
function paletteDistance(colors, palette) {
  if (!colors.length || !palette.length) return 1;
  const ref = palette.map((c) => [parseInt(c.hex.slice(1, 3), 16), parseInt(c.hex.slice(3, 5), 16), parseInt(c.hex.slice(5, 7), 16)]);
  let total = 0;
  for (const c of colors) {
    let best = Infinity;
    for (const r of ref) {
      const d = (c[0] - r[0]) ** 2 + (c[1] - r[1]) ** 2 + (c[2] - r[2]) ** 2;
      if (d < best) best = d;
    }
    total += Math.sqrt(best);
  }
  return Math.min(1, total / colors.length / 200);   // 200 = 눈에 띄게 다른 색으로 보는 거리
}

/**
 * 프로젝트 팔레트 준수 — **위의 프로필 거리와 다른 질문이다.**
 *   프로필 거리     = "이 장르 레퍼런스처럼 보이나"
 *   팔레트 준수     = "우리 프로젝트 톤 안에 있나"
 * 후자가 어긋나면 생성물이 예쁘더라도 게임에 넣으면 톤이 갈라진다.
 *
 * 거리는 RGB 유클리드가 아니라 **CIE Lab 색차(dE)** 로 잰다 - RGB 거리는 사람 눈과 어긋난다.
 * dE 10 이 "한눈에 다른 색"의 경계이므로 그걸 기준으로 정규화한다.
 */
function projectPaletteDeviation(colors, projectHexes) {
  if (!colors.length || !projectHexes.length) return null;
  const refLab = projectHexes.map((h) => toLab(parseHex(h)));
  let total = 0;
  let worst = 0;
  for (const c of colors) {
    const lab = toLab({ r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 });
    let best = Infinity;
    for (const r of refLab) {
      const d = Math.hypot(lab.L - r.L, lab.a - r.a, lab.b - r.b);
      if (d < best) best = d;
    }
    total += best;
    if (best > worst) worst = best;
  }
  const meanDe = total / colors.length;
  return { meanDe, worstDe: worst, score: Math.max(0, 1 - meanDe / 20) };  // dE 20 이면 0점
}

// 밴드 안이면 만점, 벗어난 만큼 감점
function bandScore(v, b) {
  if (v >= b.min && v <= b.max) return 1;
  const span = Math.max(1e-6, b.max - b.min);
  const off = v < b.min ? b.min - v : v - b.max;
  return Math.max(0, 1 - off / span);
}

// ── 채점 ─────────────────────────────────────────────────────────────────────
const results = [];
for (const f of files) {
  let m;
  try { m = measure(readPNG(f)); } catch (e) { results.push({ file: path.basename(f), score: 0, verdict: '읽기 실패', reasons: [e.message] }); continue; }
  if (!m) { results.push({ file: path.basename(f), score: 0, verdict: '탈락', reasons: ['피사체 없음'] }); continue; }

  const reasons = [], parts = [];
  const add = (label, w, s, why) => { parts.push({ label, w, s }); if (s < 0.6 && why) reasons.push(why); };

  const single = T.singleSubject ? (m.blobs <= 1 ? 1 : m.secondBlobShare < 0.12 ? 0.7 : 0) : 1;
  add('단일 피사체', 25, single, m.blobs > 1 ? `피사체 ${m.blobs}개 (2번째가 ${(m.secondBlobShare * 100).toFixed(0)}%) — 시트로 샜다` : null);
  add('배경 순도', 15, Math.min(1, m.bgPurity / 0.25), m.bgPurity < 0.15 ? `배경 비율 ${(m.bgPurity * 100).toFixed(0)}% — 잘라내기 어렵다` : null);
  add('채도', 15, bandScore(m.saturation, T.saturation), null);
  add('명도', 15, bandScore(m.value, T.value), null);
  add('피사체 면적비', 10, bandScore(m.subjectRatio, T.subjectRatio), null);
  add('축소 판독성', 10, Math.min(1, m.smallSizeContrast / Math.max(1e-6, T.smallSizeContrast.min)),
      m.smallSizeContrast < T.smallSizeContrast.min ? `축소 대비 ${m.smallSizeContrast.toFixed(3)} < 기준 ${T.smallSizeContrast.min}` : null);
  add('외곽선 성향', 5, m.darkRatio <= T.outlineRatio.maxDark ? 1 : Math.max(0, 1 - (m.darkRatio - T.outlineRatio.maxDark) / 0.1), null);
  const pd = paletteDistance(m.colors, prof.palette);
  add('프로필 거리', 5, 1 - pd, pd > 0.5 ? `레퍼런스 팔레트에서 멀다 (${pd.toFixed(2)})` : null);
  const dev = projectHexes.length ? projectPaletteDeviation(m.colors, projectHexes) : null;
  if (dev) add('프로젝트 팔레트 준수', 10, dev.score,
    dev.meanDe > 15 ? `프로젝트 톤에서 벗어났다 (평균 dE ${dev.meanDe.toFixed(1)}, 최악 ${dev.worstDe.toFixed(1)})` : null);

  if (m.saturation < T.saturation.min) reasons.push(`채도 ${m.saturation.toFixed(2)} < ${T.saturation.min}`);
  if (m.saturation > T.saturation.max) reasons.push(`채도 ${m.saturation.toFixed(2)} > ${T.saturation.max}`);
  if (m.value < T.value.min) reasons.push(`명도 ${m.value.toFixed(2)} < ${T.value.min}`);
  if (m.value > T.value.max) reasons.push(`명도 ${m.value.toFixed(2)} > ${T.value.max}`);

  // 가중치 합으로 정규화한다. --palette 를 주면 항목이 하나 늘어나 합이 110 이 되므로,
  // 정규화하지 않으면 --pass 70 이 다른 기준을 뜻하게 된다.
  const wSum = parts.reduce((a, p) => a + p.w, 0) || 1;
  const score = Math.round((parts.reduce((a, p) => a + p.w * p.s, 0) / wSum) * 100);
  // 하드 게이트: 감점만으로는 못 막는 결함이 있다. 실제로 피사체 28개짜리가 다른 항목 점수로
  // 합격선을 넘은 사례가 나왔다(2026-08-21). 이런 건 점수와 무관하게 탈락시킨다.
  const hardFail = [];
  if (T.singleSubject && m.blobs > 1 && m.secondBlobShare >= 0.12) hardFail.push('다중 피사체');
  if (m.bgPurity < 0.08) hardFail.push('배경 없음(잘라낼 수 없다)');
  results.push({
    file: path.basename(f), score,
    verdict: hardFail.length ? `탈락(${hardFail.join('·')})` : score >= PASS ? '통과' : '탈락',
    hardFail,
    reasons,
    metrics: {
      blobs: m.blobs, bgPurity: +m.bgPurity.toFixed(3), saturation: +m.saturation.toFixed(2),
      value: +m.value.toFixed(2), subjectRatio: +m.subjectRatio.toFixed(3),
      smallSizeContrast: +m.smallSizeContrast.toFixed(3), darkRatio: +m.darkRatio.toFixed(3),
      paletteDistance: +pd.toFixed(2), bgHex: m.bgHex,
    },
    breakdown: parts.map((p) => `${p.label} ${Math.round(p.w * p.s)}/${p.w}`),
  });
}

results.sort((a, b) => b.score - a.score);

console.log(`\n스타일 채점 — 프로필 "${prof.name}" (레퍼런스 ${prof.refs}장) · 합격선 ${PASS}점\n`);
console.log('점수  판정   파일');
console.log('----  ----   ----');
for (const r of results) {
  console.log(`${String(r.score).padStart(4)}  ${r.verdict}   ${r.file}`);
  for (const why of r.reasons) console.log(`             - ${why}`);
}
const pass = results.filter((r) => r.verdict === '통과');
console.log(`\n통과 ${pass.length} / ${results.length}  (사람은 이 ${pass.length}장만 보면 된다)`);

if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'score.json'), JSON.stringify({ profile: prof.name, pass: PASS, results }, null, 2));
  // 통과분만 따로 모아두면 다음 단계(사람 채택)가 폴더 하나만 보면 된다
  const passDir = path.join(OUT, 'passed');
  fs.mkdirSync(passDir, { recursive: true });
  for (const r of pass) fs.copyFileSync(path.join(root, r.file), path.join(passDir, r.file));
  console.log(`-> ${OUT}/score.json · passed/ (${pass.length}장)`);
}
