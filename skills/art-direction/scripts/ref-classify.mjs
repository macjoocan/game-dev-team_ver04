#!/usr/bin/env node
// ref-classify.mjs - 레퍼런스 이미지 수만 장을 용도별로 자동 분류한다.
//   node ref-classify.mjs <폴더> [--out <dir>] [--sort <dir>] [--samples 6] [--min-size 48]
//
// 왜: 스프라이트 덤프를 통째로 프로필로 만들면 "이 게임의 그림"이 아니라 "리소스 폴더 평균"이
// 나온다. 실제로 그렇게 만든 프로필로 생성했더니 캐릭터 뒤에 퍼즐 보드가 깔렸다(2026-08-21).
// 스타일 프로필은 **분류된 폴더** 기준으로 만들어야 의미가 있다.
//
// 신호 두 가지를 합친다:
//   1) 파일명 토큰 — 실측 33,829장 중 98%가 이름에 단어를 갖고 있었다. 제일 싼 신호다.
//   2) 픽셀 지표 — 크기·비율·단일피사체·배경순도·채도·명도·대비. 이름이 침묵할 때 판정한다.
//
// 캐시: 파일 경로+크기+mtime 로 지표를 캐싱한다. 이미지를 계속 추가해도 새 것만 읽는다.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG, rgb2hsv } from '../../../scripts/lib-png-read.mjs';

const args = process.argv.slice(2);
const root = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!root || root.startsWith('--')) {
  console.error('usage: node ref-classify.mjs <폴더> [--out dir] [--sort dir] [--samples 6] [--min-size 48]');
  console.error('  --sort <dir>  분류 결과를 라벨별 폴더로 복사한다(프로필 만들 때 그 폴더를 쓴다)');
  process.exit(2);
}
const OUT = opt('--out', 'classify');
const SORT = opt('--sort', null);
const SAMPLES = Number(opt('--samples', 6));
const MIN_SIZE = Number(opt('--min-size', 48));

// ── 라벨 규칙 (위에서부터 먼저 맞는 것) ───────────────────────────────────────
// 게임마다 명명 관례가 다르므로 여기를 늘려가며 쓴다. 규칙을 코드 밖으로 빼지 않은 이유는
// 이 표 자체가 "우리가 뭘 어떻게 부르기로 했는가"라서, 프로젝트마다 갈라지면 안 되기 때문이다.
const RULES = [
  // levelscope `categorize.py` 의 DEFAULT_RULES 와 **같은 라벨 체계**를 쓴다.
  // 분류 폴더 이름이 갈라지면 두 도구의 결과를 대조할 수 없다.
  // 순서가 곧 우선순위 — 위쪽이 이긴다(tex_fx_glow 가 텍스처가 아니라 이펙트로 가게).
  ['아틀라스', /(^|[_\-. ])sactx[-_]|\batlas\b|\bspriteatlas\b/],
  ['이펙트',   /\b(fx|vfx|eff|effect|effects|particle|particles|glow|flare|spark|light)\b/],
  ['아이콘',   /\b(ico|icon|icons)\b/],
  ['컷신',     /\b(cutscene|cutscenes|cinematic)\b/],
  ['프로필',   /\b(profile|portrait|avatar|thumbnail|thumb)\b/],
  ['배경',     /\b(bg|background|backgrounds|maptheme|mapthemes|sky|skybox)\b/],
  ['UI',       /\b(ui|img|image|popup|btn|button|title|frame|banner|panel|window|slot|badge|gauge|progress)\b/],
  ['폰트',     /\b(font|fonts|glyph)\b/],
  ['텍스처',   /\b(noise|basecolor|base_color|normalmap|roughness|metallic|specular|mask|gradient|ramp|pattern|ptn|dither|bayer|voronoi|lut|ldr|matcap|texture|tex)\b/],
  ['그림자',   /\b(shadow|shadows)\b/],
  // 게임별 규칙(configs/*.yaml)에 있는 것 중 장르 공통으로 쓸 만한 것
  ['캐릭터',   /\b(cookie|pet|npc|char|character|hero|player|monster|enemy)\b/],
  ['보상',     /\b(reward|rewards|chest|coin|gold|promotions|collection|powerup|iconpowerup)\b/],
  ['블록',     /\b(blocker|tile|tiles|tiled|block|blocks)\b/],
  ['방',       /\b(room|roomimage|rooms)\b/],
  ['팀',       /\b(team|teamlogo)\b/],
  ['상품',     /\b(package|product|shop|store|bundle)\b/],
];

// 라벨이 안 붙으면 levelscope 와 같은 이름으로 남긴다. 틀린 분류를 붙이는 것보다 낫다는
// 저쪽 원칙(뷰어 아이콘 오매칭 사고 이력)을 그대로 따른다.
const FALLBACK = '기타';

function labelFromName(rel) {
  const stem = rel.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[_\-./\\]+/g, ' ');
  for (const [label, re] of RULES) if (re.test(stem)) return label;
  return null;
}

// ── 픽셀 지표 ────────────────────────────────────────────────────────────────
function measure(file) {
  const img = readPNG(file);
  const { width: w, height: h, data } = img;
  const px = (x, y) => (y * w + x) * 4;

  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { hasAlpha = true; break; }
  const cnt = new Map();
  const cs = Math.max(1, Math.floor(Math.min(w, h) * 0.06));
  for (const [ox, oy] of [[0, 0], [Math.max(0, w - cs), 0], [0, Math.max(0, h - cs)], [Math.max(0, w - cs), Math.max(0, h - cs)]]) {
    for (let y = oy; y < Math.min(h, oy + cs); y++) for (let x = ox; x < Math.min(w, ox + cs); x++) {
      const i = px(x, y);
      const k = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
  }
  const bg = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map((v) => (Number(v) << 3) + 4);
  const isBg = (i) => (hasAlpha && data[i + 3] < 24) ||
    (Math.abs(data[i] - bg[0]) < 18 && Math.abs(data[i + 1] - bg[1]) < 18 && Math.abs(data[i + 2] - bg[2]) < 18);

  const mask = new Uint8Array(w * h);
  let subject = 0, bgPure = 0, dark = 0;
  const sats = [], vals = [], hues = [];
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 800)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = px(x, y);
    if (isBg(i)) { bgPure++; continue; }
    mask[y * w + x] = 1; subject++;
    const { h: hu, s, v } = rgb2hsv(data[i], data[i + 1], data[i + 2]);
    if (v < 0.28) dark++;
    if (x % step === 0 && y % step === 0) { sats.push(s); vals.push(v); if (s > 0.2) hues.push(hu); }
  }
  if (!subject) return { w, h, empty: true };

  // 연결 성분 (0.5% 이상만)
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const minBlob = w * h * 0.005;
  let blobs = 0, biggest = 0;
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
    if (area >= minBlob) { blobs++; if (area > biggest) biggest = area; }
  }

  const N = 24;
  let sum = 0, sum2 = 0;
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const i = px(Math.floor((gx + 0.5) * w / N), Math.floor((gy + 0.5) * h / N));
    sum += rgb2hsv(data[i], data[i + 1], data[i + 2]).v; sum2 += rgb2hsv(data[i], data[i + 1], data[i + 2]).v ** 2;
  }
  const mean = sum / (N * N);
  const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

  return {
    w, h, empty: false, hasAlpha,
    aspect: +(w / h).toFixed(3),
    bgPurity: +(bgPure / (w * h)).toFixed(3),
    subjectRatio: +(subject / (w * h)).toFixed(3),
    blobs, darkRatio: +(dark / subject).toFixed(3),
    saturation: +med(sats).toFixed(2), value: +med(vals).toFixed(2),
    hue: hues.length ? Math.round(med(hues)) : -1,
    contrast: +Math.sqrt(Math.max(0, sum2 / (N * N) - mean * mean)).toFixed(3),
  };
}

// 이름이 침묵할 때 픽셀로 판정한다. 확신이 낮은 건 unsorted 로 보내 사람이 보게 한다.
function labelFromPixels(m) {
  const maxDim = Math.max(m.w, m.h);
  const ar = m.aspect;
  if (maxDim >= 700 && m.bgPurity < 0.2) return ['배경', 0.7];
  if (m.darkRatio < 0.02 && m.contrast > 0.18 && m.bgPurity > 0.4 && m.saturation > 0.4) return ['이펙트', 0.5];
  if (ar > 1.8 && m.blobs <= 2 && maxDim >= 120) return ['UI', 0.5];          // 가로로 긴 것 = 바·버튼
  if (Math.abs(ar - 1) < 0.15 && maxDim <= 160 && m.bgPurity > 0.3) return ['아이콘', 0.5];
  if (ar < 0.9 && m.blobs === 1 && m.subjectRatio > 0.15) return ['캐릭터', 0.45];
  return [FALLBACK, 0.2];
}

// ── 캐시 ─────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const cachePath = path.join(OUT, 'metrics-cache.json');
let cache = {};
if (fs.existsSync(cachePath)) { try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch {} }

// ── 수집 ─────────────────────────────────────────────────────────────────────
const files = [];
(function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.png$/i.test(e.name)) files.push(p);
  }
})(root);

console.log(`\n분류 — ${files.length}장 (${root})`);
let fresh = 0, cached = 0;
const rows = [];
for (const f of files) {
  const st = fs.statSync(f);
  const key = `${path.relative(root, f)}|${st.size}|${Math.round(st.mtimeMs)}`;
  let m = cache[key];
  if (m) cached++;
  else {
    try { m = measure(f); } catch (e) { m = { error: e.message }; }
    cache[key] = m; fresh++;
    if (fresh % 2000 === 0) process.stdout.write(`  ${fresh}장 측정...\n`);
  }
  const rel = path.relative(root, f).replace(/\\/g, '/');

  let label, conf, via;
  if (m.error) { label = 'error'; conf = 1; via = m.error; }
  else if (m.empty) { label = '조각'; conf = 1; via = '빈 이미지'; }
  else if (Math.max(m.w, m.h) < MIN_SIZE) { label = '조각'; conf = 1; via = `작음(${m.w}x${m.h})`; }
  else if (m.aspect > 8 || m.aspect < 0.125) { label = '조각'; conf = 1; via = `극단 비율(${m.aspect})`; }
  else {
    const byName = labelFromName(rel);
    if (byName) { label = byName; conf = 0.9; via = '이름'; }
    else { [label, conf] = labelFromPixels(m); via = '픽셀'; }
  }
  rows.push({ file: rel, label, conf, via, ...m });
}
fs.writeFileSync(cachePath, JSON.stringify(cache));
console.log(`  측정 ${fresh}장 · 캐시 재사용 ${cached}장`);

// ── 집계 ─────────────────────────────────────────────────────────────────────
const byLabel = new Map();
for (const r of rows) {
  if (!byLabel.has(r.label)) byLabel.set(r.label, []);
  byLabel.get(r.label).push(r);
}
const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

const summary = [...byLabel.entries()].map(([label, list]) => {
  const real = list.filter((r) => !r.empty && !r.error);
  return {
    label, count: list.length,
    byName: list.filter((r) => r.via === '이름').length,
    byPixel: list.filter((r) => r.via === '픽셀').length,
    medianSize: `${med(real.map((r) => r.w))}x${med(real.map((r) => r.h))}`,
    saturation: +med(real.map((r) => r.saturation)).toFixed(2),
    value: +med(real.map((r) => r.value)).toFixed(2),
    bgPurity: +med(real.map((r) => r.bgPurity)).toFixed(2),
    blobs: med(real.map((r) => r.blobs)),
  };
}).sort((a, b) => b.count - a.count);

// ── 대표 샘플 ────────────────────────────────────────────────────────────────
// 라벨 중앙값에 가장 가까운 것들 = "이 군집이 대체로 이렇게 생겼다". 사람은 이것만 보면 된다.
const sampleDir = path.join(OUT, 'samples');
fs.rmSync(sampleDir, { recursive: true, force: true });
for (const [label, list] of byLabel) {
  const real = list.filter((r) => !r.empty && !r.error);
  if (!real.length) continue;
  const c = { w: med(real.map((r) => r.w)), s: med(real.map((r) => r.saturation)), v: med(real.map((r) => r.value)), a: med(real.map((r) => r.aspect)) };
  const scored = real.map((r) => ({
    r, d: Math.abs(r.w - c.w) / (c.w || 1) + Math.abs(r.saturation - c.s) + Math.abs(r.value - c.v) + Math.abs(r.aspect - c.a),
  })).sort((a, b) => a.d - b.d);
  const dir = path.join(sampleDir, label);
  fs.mkdirSync(dir, { recursive: true });
  scored.slice(0, SAMPLES).forEach((x, i) => {
    fs.copyFileSync(path.join(root, x.r.file), path.join(dir, `${String(i).padStart(2, '0')}_${path.basename(x.r.file)}`));
  });
}

// ── 라벨별 폴더로 분류(선택) ──────────────────────────────────────────────────
if (SORT) {
  for (const [label, list] of byLabel) {
    if (label === '조각' || label === 'error') continue;
    const dir = path.join(SORT, label, 'refs');
    fs.mkdirSync(dir, { recursive: true });
    for (const r of list) {
      const dest = path.join(dir, r.file.replace(/[/\\]/g, '__'));
      try { fs.copyFileSync(path.join(root, r.file), dest); } catch {}
    }
  }
  console.log(`  라벨별 복사 -> ${SORT}/<라벨>/refs/`);
}

// ── 출력 ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUT, 'classify.json'), JSON.stringify({ root, total: rows.length, summary, rows }, null, 2));

const md = ['# 레퍼런스 자동 분류\n', `- 대상: \`${root}\``, `- 총 ${rows.length}장\n`,
  '| 라벨 | 장수 | 이름판정 | 픽셀판정 | 중앙크기 | 채도 | 명도 | 배경순도 | 덩어리 |',
  '|---|---|---|---|---|---|---|---|---|'];
for (const s of summary) md.push(`| ${s.label} | ${s.count} | ${s.byName} | ${s.byPixel} | ${s.medianSize} | ${s.saturation} | ${s.value} | ${s.bgPurity} | ${s.blobs} |`);
md.push('\n대표 샘플은 `samples/<라벨>/` 에 있다. 그것만 보고 라벨 이름을 확정하면 된다.');
md.push('\n라벨이 틀렸으면 `ref-classify.mjs` 의 `RULES` 표에 토큰을 추가한다 — 캐시는 지표만 담으므로 규칙을 고쳐도 재측정하지 않는다.');
fs.writeFileSync(path.join(OUT, 'classify.md'), md.join('\n') + '\n');

console.log('');
console.log('라벨       장수   중앙크기    채도  명도  배경순도');
for (const s of summary) {
  console.log(`${s.label.padEnd(10)} ${String(s.count).padStart(5)}   ${s.medianSize.padEnd(10)} ${String(s.saturation).padStart(5)} ${String(s.value).padStart(5)} ${String(s.bgPurity).padStart(9)}`);
}
console.log(`\n-> ${OUT}/classify.md · classify.json · samples/<라벨>/ (라벨당 ${SAMPLES}장)`);
