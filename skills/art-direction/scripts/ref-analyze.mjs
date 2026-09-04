#!/usr/bin/env node
// ref-analyze.mjs - 레퍼런스 이미지 폴더에서 팔레트와 규격을 실측한다.
//   node ref-analyze.mjs <이미지폴더> [--out <dir>] [--colors 8] [--top 12]
//
// 왜 필요한가: VISUAL_DESIGN.md 의 "버튼 라운드 = 높이의 28%", "채도는 이 정도" 같은 값이
// 감으로 정해지면 나중에 다투게 된다. 레퍼런스에서 뽑은 숫자로 대체하면 근거가 생긴다.
//
// 내는 것:
//   palette-draft.json  대표색 후보 (palette.json 의 초안)
//   ref-report.md       파일별 규격 + 전체 통계 (사람이 읽고 판단하는 표)
//   ref-report.json     같은 내용의 기계용
//
// 주의: 이건 **측정**이다. 레퍼런스를 베끼는 게 아니라 "이 장르가 실제로 쓰는 수치 범위"를
// 알아내 우리 기준을 정하는 데 쓴다. 특정 한 게임에 쏠리면 결과물이 그 게임처럼 보인다 —
// 여러 게임을 고르게 섞어라.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG, rgb2hsv, toHex } from '../../../scripts/lib-png-read.mjs';

const args = process.argv.slice(2);
const root = args[0];
if (!root || root.startsWith('--')) {
  console.error('usage: node ref-analyze.mjs <이미지폴더> [--out dir] [--colors 8] [--top 12]');
  process.exit(2);
}
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('--out', 'ref-analysis');
const K = Number(opt('--colors', 8));
const TOP = Number(opt('--top', 12));
const PER_IMAGE_SAMPLES = 300;      // 이미지당 색 샘플 상한
const GLOBAL_SAMPLE_CAP = 600000;   // 전체 상한 (수만 장을 돌려도 메모리가 안 터지게)

// ── 파일 수집 (지금은 PNG 만 — JPG 는 디코더가 없다) ─────────────────────────
const files = [];
(function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.png$/i.test(e.name)) files.push(p);
  }
})(root);

const skipped = [];
if (!files.length) {
  console.log(`\nPNG 를 못 찾았다: ${root}`);
  console.log('JPG 만 있으면 알려달라 — 디코더를 붙여야 한다(지금은 PNG 전용).\n');
  process.exit(0);
}

// ── 한 장 분석 ───────────────────────────────────────────────────────────────
function analyze(img) {
  const { width: w, height: h, data } = img;
  const px = (x, y) => (y * w + x) * 4;

  // 배경 추정: 네 모서리 영역의 최빈색. 알파가 있으면 알파 0 이 곧 배경이다.
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { hasAlpha = true; break; }

  const cornerCounts = new Map();
  const cs = Math.max(2, Math.floor(Math.min(w, h) * 0.04));
  for (const [ox, oy] of [[0, 0], [w - cs, 0], [0, h - cs], [w - cs, h - cs]]) {
    for (let y = oy; y < oy + cs; y++) for (let x = ox; x < ox + cs; x++) {
      const i = px(x, y);
      const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
      cornerCounts.set(key, (cornerCounts.get(key) || 0) + 1);
    }
  }
  const bgKey = [...cornerCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = bgKey.split(',').map((v) => (Number(v) << 3) + 4);

  const isBg = (i) => {
    if (hasAlpha && data[i + 3] < 24) return true;
    return Math.abs(data[i] - bg[0]) < 18 && Math.abs(data[i + 1] - bg[1]) < 18 && Math.abs(data[i + 2] - bg[2]) < 18;
  };

  // 피사체 bbox + 면적, 어두운 픽셀(외곽선 후보), 색 샘플
  let minX = w, minY = h, maxX = -1, maxY = -1, subject = 0, dark = 0, bgPure = 0;
  const samples = [];
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / PER_IMAGE_SAMPLES)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = px(x, y);
      if (isBg(i)) { bgPure++; continue; }
      subject++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const { v, s } = rgb2hsv(data[i], data[i + 1], data[i + 2]);
      if (v < 0.28) dark++;
      if (x % step === 0 && y % step === 0) samples.push([data[i], data[i + 1], data[i + 2], s, v]);
    }
  }
  if (maxX < 0) return null; // 전부 배경

  // 외곽선 두께 추정: 가로 스캔에서 "어두운 픽셀 연속 구간" 길이의 중앙값.
  // 굵은 아웃라인 스타일이면 이 값이 또렷하게 잡힌다.
  const runs = [];
  for (let y = minY; y <= maxY; y += Math.max(1, Math.floor((maxY - minY) / 120))) {
    let run = 0;
    for (let x = minX; x <= maxX; x++) {
      const i = px(x, y);
      const d = !isBg(i) && rgb2hsv(data[i], data[i + 1], data[i + 2]).v < 0.28;
      if (d) run++;
      else { if (run > 0 && run < (maxX - minX) * 0.3) runs.push(run); run = 0; }
    }
  }
  runs.sort((a, b) => a - b);
  const strokePx = runs.length ? runs[Math.floor(runs.length / 2)] : 0;

  // 축소 판독성: 32px 로 줄였을 때 배경 대비 밝기 표준편차
  const N = 32;
  let sum = 0, sum2 = 0;
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const i = px(Math.floor((gx + 0.5) * w / N), Math.floor((gy + 0.5) * h / N));
    const v = rgb2hsv(data[i], data[i + 1], data[i + 2]).v;
    sum += v; sum2 += v * v;
  }
  const mean = sum / (N * N);
  const contrast = Math.sqrt(Math.max(0, sum2 / (N * N) - mean * mean));

  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  return {
    w, h, aspect: +(w / h).toFixed(3), hasAlpha,
    bgHex: toHex(bg[0], bg[1], bg[2]),
    bgPurity: +(bgPure / (w * h)).toFixed(3),
    subjectRatio: +(subject / (w * h)).toFixed(3),
    bboxRatio: +((bw * bh) / (w * h)).toFixed(3),
    fillOfBbox: +(subject / (bw * bh)).toFixed(3),
    marginTop: +(minY / h).toFixed(3), marginBottom: +((h - 1 - maxY) / h).toFixed(3),
    marginLeft: +(minX / w).toFixed(3), marginRight: +((w - 1 - maxX) / w).toFixed(3),
    centerOffsetX: +(((minX + maxX) / 2 - w / 2) / w).toFixed(3),
    darkRatio: +(dark / Math.max(1, subject)).toFixed(3),
    strokePx, strokeRatio: +(strokePx / Math.max(w, h)).toFixed(4),
    smallSizeContrast: +contrast.toFixed(3),
    samples,
  };
}

// ── 미디언 컷 색 양자화 ──────────────────────────────────────────────────────
function medianCut(pixels, k) {
  let boxes = [pixels];
  while (boxes.length < k) {
    let bi = -1, brange = -1;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let mn = 255, mx = 0;
        for (const p of b) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; }
        if (mx - mn > brange) { brange = mx - mn; bi = i; }
      }
    });
    if (bi < 0) break;
    const box = boxes[bi];
    let ch = 0, best = -1;
    for (let c = 0; c < 3; c++) {
      let mn = 255, mx = 0;
      for (const p of box) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; }
      if (mx - mn > best) { best = mx - mn; ch = c; }
    }
    box.sort((a, b) => a[ch] - b[ch]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.filter((b) => b.length).map((b) => {
    const n = b.length;
    const r = b.reduce((a, p) => a + p[0], 0) / n;
    const g = b.reduce((a, p) => a + p[1], 0) / n;
    const bl = b.reduce((a, p) => a + p[2], 0) / n;
    const hsv = rgb2hsv(r, g, bl);
    return { hex: toHex(r, g, bl), share: n, h: Math.round(hsv.h), s: +hsv.s.toFixed(2), v: +hsv.v.toFixed(2) };
  }).sort((a, b) => b.share - a.share);
}

const q = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const fmt = (n) => (typeof n === 'number' ? (Number.isInteger(n) ? String(n) : n.toFixed(3)) : String(n));

// ── 실행 ─────────────────────────────────────────────────────────────────────
console.log(`\n레퍼런스 분석 — ${files.length}장 (${root})`);
const rows = [];
const allSamples = [];
for (const f of files) {
  let img;
  try { img = readPNG(f); } catch (e) { skipped.push({ file: f, why: e.message }); continue; }
  const a = analyze(img);
  if (!a) { skipped.push({ file: f, why: '피사체를 못 찾음(전부 배경)' }); continue; }
  const { samples, ...rest } = a;
  // 스프레드(push(...arr))는 인자 수가 많으면 스택이 터진다 — 루프로 넣는다
  if (allSamples.length < GLOBAL_SAMPLE_CAP) for (const sp of samples) allSamples.push(sp);
  rows.push({ file: path.relative(root, f).replace(/\\/g, '/'), ...rest });
  process.stdout.write('.');
}
console.log('');
if (!rows.length) { console.log('분석 가능한 이미지가 없다.'); process.exit(0); }

// 색 통계 — 배경 제외 픽셀만 들어가 있다
const pix = allSamples.map((s) => [s[0], s[1], s[2]]);
const palette = medianCut(pix, K);
const totalPix = pix.length || 1;
const sats = allSamples.map((s) => s[3]);
const vals = allSamples.map((s) => s[4]);

const agg = {
  files: rows.length,
  canvas: { widths: [...new Set(rows.map((r) => r.w))].sort((a, b) => a - b).slice(0, 10), aspectMedian: q(rows.map((r) => r.aspect), 0.5) },
  subjectRatio: { p25: q(rows.map((r) => r.subjectRatio), 0.25), median: q(rows.map((r) => r.subjectRatio), 0.5), p75: q(rows.map((r) => r.subjectRatio), 0.75) },
  bboxRatio: { median: q(rows.map((r) => r.bboxRatio), 0.5) },
  margin: { top: q(rows.map((r) => r.marginTop), 0.5), bottom: q(rows.map((r) => r.marginBottom), 0.5), side: q(rows.map((r) => (r.marginLeft + r.marginRight) / 2), 0.5) },
  outline: { strokePxMedian: q(rows.map((r) => r.strokePx), 0.5), strokeRatioMedian: q(rows.map((r) => r.strokeRatio), 0.5), darkRatioMedian: q(rows.map((r) => r.darkRatio), 0.5) },
  saturation: { p10: +q(sats, 0.1).toFixed(2), median: +q(sats, 0.5).toFixed(2), p90: +q(sats, 0.9).toFixed(2) },
  value: { p10: +q(vals, 0.1).toFixed(2), median: +q(vals, 0.5).toFixed(2), p90: +q(vals, 0.9).toFixed(2) },
  smallSizeContrast: { median: q(rows.map((r) => r.smallSizeContrast), 0.5) },
  bgPurity: { median: q(rows.map((r) => r.bgPurity), 0.5) },
};

fs.mkdirSync(OUT, { recursive: true });

// palette.json 초안 — 채도·명도로 역할을 나눠 배치한다(사람이 보고 고치는 출발점)
const byV = [...palette].sort((a, b) => b.v - a.v);
const vivid = [...palette].filter((c) => c.s > 0.35).sort((a, b) => b.share - a.share);
const draft = {
  _note: `ref-analyze 자동 초안 — ${rows.length}장에서 추출. 역할 배치는 추정이니 사람이 고쳐라.`,
  _measured: { saturationMedian: agg.saturation.median, valueMedian: agg.value.median },
  primary: {
    light: byV[0]?.hex || '#FFFFFF',
    base: vivid[0]?.hex || palette[0]?.hex || '#888888',
    dark: [...palette].sort((a, b) => a.v - b.v)[0]?.hex || '#222222',
  },
  accent: { base: vivid[1]?.hex || vivid[0]?.hex || '#FFC132' },
  _candidates: palette.map((c) => ({ hex: c.hex, sharePct: +((c.share / totalPix) * 100).toFixed(1), h: c.h, s: c.s, v: c.v })),
};
fs.writeFileSync(path.join(OUT, 'palette-draft.json'), JSON.stringify(draft, null, 2));

// profile.json — 스타일 계약서. 생성(프롬프트 구성)과 채점(합격 기준)에 **같은 파일**이 쓰인다.
// 한쪽만 고치면 "레퍼런스처럼 나왔나"를 판정할 근거가 사라지므로 반드시 이 파일 하나를 본다.
const band = (o) => ({ min: o.p10, target: o.median, max: o.p90 });
const profile = {
  name: path.basename(path.resolve(root)),
  refs: rows.length,
  measuredAt: null,                    // 채우는 쪽은 호출자(스크립트는 시간을 안 만든다)
  palette: palette.slice(0, 8).map((c) => ({ hex: c.hex, sharePct: +((c.share / totalPix) * 100).toFixed(1), h: c.h, s: c.s, v: c.v })),
  target: {
    saturation: band(agg.saturation),
    value: band(agg.value),
    outlineRatio: { target: agg.outline.strokeRatioMedian, maxDark: +(agg.outline.darkRatioMedian * 3).toFixed(3) },
    subjectRatio: { min: agg.subjectRatio.p25, target: agg.subjectRatio.median, max: agg.subjectRatio.p75 },
    smallSizeContrast: { min: +(agg.smallSizeContrast.median * 0.6).toFixed(3) },
    singleSubject: true,               // 게임 에셋은 한 장에 하나 — 시트로 새면 탈락
  },
  promptHints: {
    palette: palette.slice(0, 4).map((c) => c.hex).join(', '),
    saturation: agg.saturation.median >= 0.65 ? 'vivid saturated colors' : agg.saturation.median >= 0.45 ? 'moderately saturated colors' : 'soft muted colors',
    value: agg.value.median >= 0.85 ? 'bright light tones, airy' : agg.value.median >= 0.7 ? 'balanced tones' : 'deep rich tones',
    outline: agg.outline.darkRatioMedian >= 0.05 ? 'thick dark outline' : 'no heavy black outline, shapes separated by color and value contrast',
  },
};
fs.writeFileSync(path.join(OUT, 'profile.json'), JSON.stringify(profile, null, 2));

// 사람이 읽는 리포트
const md = [];
md.push(`# 레퍼런스 분석 리포트\n`);
md.push(`- 대상: \`${root}\``);
md.push(`- 분석 ${rows.length}장 / 건너뜀 ${skipped.length}장\n`);
md.push(`## 대표색 (배경 제외 픽셀 기준)\n`);
md.push(`| 색 | 점유율 | H | S | V |`);
md.push(`|---|---|---|---|---|`);
for (const c of palette.slice(0, TOP)) md.push(`| \`${c.hex}\` | ${((c.share / totalPix) * 100).toFixed(1)}% | ${c.h} | ${c.s} | ${c.v} |`);
md.push(`\n채도 중앙값 **${agg.saturation.median}** (p10 ${agg.saturation.p10} ~ p90 ${agg.saturation.p90}) · 명도 중앙값 **${agg.value.median}** (p10 ${agg.value.p10} ~ p90 ${agg.value.p90})\n`);
md.push(`## 규격 통계\n`);
md.push(`| 항목 | 값 | 우리 기준에 쓰는 법 |`);
md.push(`|---|---|---|`);
md.push(`| 피사체 면적 비율(중앙값) | ${agg.subjectRatio.median} (p25 ${agg.subjectRatio.p25} ~ p75 ${agg.subjectRatio.p75}) | 캔버스에서 캐릭터가 차지할 비율 |`);
md.push(`| bbox 면적 비율 | ${agg.bboxRatio.median} | 여백 설계 |`);
md.push(`| 여백 상/하/좌우 | ${agg.margin.top} / ${agg.margin.bottom} / ${agg.margin.side} | 피벗·세이프에어리어 |`);
md.push(`| 외곽선 두께(중앙값) | ${agg.outline.strokePxMedian}px = 긴 변의 ${(agg.outline.strokeRatioMedian * 100).toFixed(2)}% | 스펙의 stroke.width |`);
md.push(`| 어두운 픽셀 비율 | ${agg.outline.darkRatioMedian} | 굵은 아웃라인 스타일 여부 |`);
md.push(`| 축소(32px) 대비 | ${agg.smallSizeContrast.median} | 작은 화면 판독성 하한 |`);
md.push(`| 배경 순도 | ${agg.bgPurity.median} | 알파 추출 난이도 |`);
md.push(`\n## 파일별\n`);
md.push(`| 파일 | 크기 | 피사체비 | 외곽선px | 배경 | 축소대비 |`);
md.push(`|---|---|---|---|---|---|`);
for (const r of rows.slice(0, 200)) md.push(`| ${r.file} | ${r.w}x${r.h} | ${fmt(r.subjectRatio)} | ${r.strokePx} | \`${r.bgHex}\` | ${fmt(r.smallSizeContrast)} |`);
if (rows.length > 200) md.push(`\n(외 ${rows.length - 200}장은 ref-report.json 참고)`);
if (skipped.length) {
  md.push(`\n## 건너뛴 파일\n`);
  for (const s of skipped.slice(0, 20)) md.push(`- \`${path.relative(root, s.file)}\` — ${s.why}`);
}
fs.writeFileSync(path.join(OUT, 'ref-report.md'), md.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'ref-report.json'), JSON.stringify({ aggregate: agg, palette, files: rows, skipped }, null, 2));

console.log(`\n대표색 ${palette.length}종 · 채도 중앙값 ${agg.saturation.median} · 명도 중앙값 ${agg.value.median}`);
console.log(`외곽선 중앙값 ${agg.outline.strokePxMedian}px (긴 변의 ${(agg.outline.strokeRatioMedian * 100).toFixed(2)}%) · 피사체 면적비 ${agg.subjectRatio.median}`);
if (skipped.length) console.log(`건너뜀 ${skipped.length}장 (ref-report.md 하단 참고)`);
console.log(`\n-> ${OUT}/palette-draft.json · ref-report.md · ref-report.json`);
