#!/usr/bin/env node
// tile-gen.mjs - 배경 타일셋을 스펙에서 생성한다. **이음매 없음은 수학으로 보장한다.**
//   node tile-gen.mjs <spec.json> [--out <dir>] [--palette <pal.json>]
//
// 왜 코드인가: 타일은 "예쁜 한 장"이 아니라 **반복해도 티가 안 나는가**가 결과물이다.
// 생성 모델은 매번 다른 그림을 주므로 상하좌우가 이어지지 않는다. 이어 붙이는 건 기하 문제다.
//
// 이음매 없음의 원리: 노이즈 격자를 **타일 크기로 모듈로 감싼다**(주기 노이즈).
// 그러면 x=W 의 값이 x=0 과 **정의상 같다** — 눈으로 맞추는 게 아니라 수식이 보장한다.
// 그래서 이 도구의 이음매 검사는 "잘 됐나" 확인이 아니라 **회귀 검사**다(0 이 아니면 버그다).
//
// 색은 팔레트에서만 고른다. 캐릭터와 같은 팔레트를 주면 배경과 캐릭터의 결이 맞는다
// (`palette-force` 가 쓰는 것과 같은 파일을 넣어라).

import fs from 'node:fs';
import path from 'node:path';
import { writePNG } from '../../../scripts/lib-png.mjs';
import { parseHex, toLab, toHex } from '../../../scripts/lib-color.mjs';

const args = process.argv.slice(2);
const specPath = args[0];
if (!specPath || specPath.startsWith('--')) {
  console.error('usage: node tile-gen.mjs <spec.json> [--out <dir>] [--palette <pal.json>]');
  console.error('  --palette  캐릭터와 같은 팔레트를 쓴다. 안 주면 스펙의 hex 를 그대로 쓴다');
  console.error('  판정: 0 이음매 0 · 1 이음매 발견(버그) · 2 입력 오류');
  process.exit(2);
}
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const OUT = opt('--out', spec.out || 'tiles-out');
const SIZE = spec.tileSize || 32;
fs.mkdirSync(OUT, { recursive: true });

// ── 팔레트 ───────────────────────────────────────────────────────────────────
// 외부 팔레트를 주면 스펙의 색을 **가장 가까운 팔레트 색으로 당긴다.**
// 배경이 캐릭터와 다른 팔레트를 쓰면 화면에서 바로 티가 난다.
let snap = (hex) => hex;
const PAL = opt('--palette', null);
if (PAL) {
  const raw = JSON.parse(fs.readFileSync(PAL, 'utf8'));
  const list = (Array.isArray(raw) ? raw : raw.colors || []).filter((x) => /^#?[0-9a-f]{6}$/i.test(x))
    .map((x) => (x[0] === '#' ? x : '#' + x));
  if (!list.length) { console.error(`팔레트에 색이 없다: ${PAL}`); process.exit(2); }
  const labs = list.map((h) => ({ h, lab: toLab(parseHex(h)) }));
  const cache = new Map();
  snap = (hex) => {
    if (cache.has(hex)) return cache.get(hex);
    const l = toLab(parseHex(hex));
    let best = labs[0], bd = Infinity;
    for (const c of labs) { const d = Math.hypot(l.L - c.lab.L, l.a - c.lab.a, l.b - c.lab.b); if (d < bd) { bd = d; best = c; } }
    cache.set(hex, best.h); return best.h;
  };
  console.log(`팔레트 ${list.length}색으로 스냅한다 (${path.basename(PAL)})`);
}

// ── 주기 노이즈 ───────────────────────────────────────────────────────────────
// 격자 인덱스를 period 로 감싸는 것이 전부다. 이게 이음매 없음의 근거다.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// 격자는 (period, seed) 당 하나면 된다. 캐시 안 하면 **픽셀마다 period^2 개 난수를 다시 뽑는다.**
const latticeCache = new Map();
function lattice(period, seed) {
  const key = period + ':' + seed;
  let g = latticeCache.get(key);
  if (!g) {
    const rnd = mulberry(seed);
    g = new Float64Array(period * period);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    latticeCache.set(key, g);
  }
  return (x, y) => g[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
}
const fade = (t) => t * t * (3 - 2 * t);
function periodicNoise(px, py, period, seed) {
  const L = lattice(period, seed);
  const x = px * period, y = py * period;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = fade(x - x0), fy = fade(y - y0);
  const a = L(x0, y0), b = L(x0 + 1, y0), c = L(x0, y0 + 1), d = L(x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// 옥타브를 쌓아도 **각 옥타브의 period 가 정수배**면 감싸짐이 유지된다.
function fbm(px, py, baseP, octaves, seed) {
  let v = 0, amp = 1, norm = 0, p = baseP;
  for (let o = 0; o < octaves; o++) {
    v += periodicNoise(px, py, p, seed + o * 1013) * amp;
    norm += amp; amp *= 0.5; p *= 2;
  }
  return v / norm;
}

// ── 타일 한 장 ───────────────────────────────────────────────────────────────
function renderTile(mat, seed) {
  const ramp = (mat.colors || ['#4a7c3f', '#3c6634', '#2f5129']).map(snap).map(parseHex);
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const baseP = Math.max(2, mat.grain || 4);
  const oct = Math.max(1, mat.octaves || 3);
  const contrast = mat.contrast ?? 1;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let n = fbm(x / SIZE, y / SIZE, baseP, oct, seed);
    n = Math.min(1, Math.max(0, (n - 0.5) * contrast + 0.5));
    // 색 밴딩 — 도트는 연속 그라디언트가 아니라 단계다. ramp 길이만큼 계단으로 끊는다.
    const idx = Math.min(ramp.length - 1, Math.floor(n * ramp.length));
    const c = ramp[idx];
    const o = (y * SIZE + x) * 4;
    buf[o] = Math.round(c.r * 255); buf[o + 1] = Math.round(c.g * 255); buf[o + 2] = Math.round(c.b * 255); buf[o + 3] = 255;
  }
  // 점 디테일(자갈·풀포기) — 좌표를 타일 크기로 감싸 넣으므로 가장자리를 넘어가도 반대편에 이어진다.
  if (mat.speckle) {
    const rnd = mulberry(seed * 7919 + 13);
    const n = Math.round(SIZE * SIZE * (mat.speckle.density ?? 0.02));
    const sc = parseHex(snap(mat.speckle.color || ramp.length ? toHex(ramp[0]) : '#000000'));
    const r = Math.max(1, mat.speckle.size || 1);
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(rnd() * SIZE), cy = Math.floor(rnd() * SIZE);
      for (let dy = -r + 1; dy < r; dy++) for (let dx = -r + 1; dx < r; dx++) {
        if (dx * dx + dy * dy >= r * r) continue;
        const X = ((cx + dx) % SIZE + SIZE) % SIZE, Y = ((cy + dy) % SIZE + SIZE) % SIZE;
        const o = (Y * SIZE + X) * 4;
        buf[o] = Math.round(sc.r * 255); buf[o + 1] = Math.round(sc.g * 255); buf[o + 2] = Math.round(sc.b * 255);
      }
    }
  }
  return buf;
}

// ── 전이 타일 (코너 기반 16장) ────────────────────────────────────────────────
// 재질 경계가 직각이면 화면이 바로 가짜로 보인다. 전이 타일이 그걸 푼다.
//
// **왜 코너 기반인가:** 네 모서리가 각각 A/B 인 16가지를 만든다. 픽셀의 소속은
// 네 코너값의 **쌍선형 보간**으로 정한다 — 윗변 위의 값은 좌상·우상 코너에만 의존하므로
// 위 타일의 아랫변과 **정의상 일치한다.** 이웃 타일을 몰라도 이어진다.
//
// 경계를 울퉁불퉁하게 만드는 노이즈는 **모든 타일이 같은 주기 노이즈 한 장**을 본다.
// 타일마다 다른 노이즈를 쓰면 공유 변에서 어긋난다 — 그래서 시드를 타일별로 바꾸지 않는다.
function renderTransition(matA, matB, corners, seed, edgeNoise) {
  const [c00, c10, c01, c11] = corners;     // 좌상, 우상, 좌하, 우하 (0=A, 1=B)
  const a = renderTile(matA, seed);
  const b = renderTile(matB, seed + 5003);
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = (x + 0.5) / SIZE, v = (y + 0.5) / SIZE;
    const cov = (c00 * (1 - u) + c10 * u) * (1 - v) + (c01 * (1 - u) + c11 * u) * v;
    // 경계 흔들기 — 공유 변에서 어긋나지 않도록 전 타일 공용 노이즈를 쓴다
    const n = (fbm(u, v, edgeNoise.grain, 2, edgeNoise.seed) - 0.5) * edgeNoise.amp;
    const src = (cov + n) > 0.5 ? b : a;
    const o = (y * SIZE + x) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = src[o + c];
  }
  return out;
}

// ── 이음매 검사 ───────────────────────────────────────────────────────────────
// 타일을 이어 붙이면 **마지막 열과 첫 열이 이웃**이 된다. 거기 생기는 색 변화가
// 타일 안의 **보통 이웃 열 변화보다 튀면** 이음매가 보인다.
//
// 주의 — 첫 판에 `이음매 <= 내부평균 + 0.5` 로 박았다가 7장 중 5장을 잘못 반려했다(2026-10-02).
// 노이즈 자체는 **주기성 오차 0** 으로 수학적으로 보장돼 있었고, 틀린 건 게이트였다.
// 마지막 열과 첫 열은 **한 칸 이웃**이라 차이가 나는 게 정상인데, 임의 임계값을 쓴 탓이다.
// 그래서 지금은 임계값을 쓰지 않는다 — **타일 안의 모든 이웃 열 차이 분포와 비교**한다.
// 이음매가 그중 최댓값보다 크지 않으면, 이음매는 "보통 자리"와 구분되지 않는다.
function seamScore(buf) {
  const at = (x, y, c) => buf[(y * SIZE + x) * 4 + c];
  const d = (x1, y1, x2, y2) => Math.abs(at(x1, y1, 0) - at(x2, y2, 0)) + Math.abs(at(x1, y1, 1) - at(x2, y2, 1)) + Math.abs(at(x1, y1, 2) - at(x2, y2, 2));

  // 열(column) 쌍마다 평균 차이 — 세로 경계들의 분포
  const colDiff = [];
  for (let x = 1; x < SIZE; x++) { let s2 = 0; for (let y = 0; y < SIZE; y++) s2 += d(x - 1, y, x, y); colDiff.push(s2 / SIZE); }
  const rowDiff = [];
  for (let y = 1; y < SIZE; y++) { let s2 = 0; for (let x = 0; x < SIZE; x++) s2 += d(x, y - 1, x, y); rowDiff.push(s2 / SIZE); }

  let sh = 0, sv = 0;
  for (let i = 0; i < SIZE; i++) { sh += d(SIZE - 1, i, 0, i); sv += d(i, SIZE - 1, i, 0); }
  sh /= SIZE; sv /= SIZE;

  const maxCol = Math.max(...colDiff), maxRow = Math.max(...rowDiff);
  const avgCol = colDiff.reduce((a, b) => a + b, 0) / colDiff.length;
  const avgRow = rowDiff.reduce((a, b) => a + b, 0) / rowDiff.length;
  return { seamH: sh, seamV: sv, maxCol, maxRow, avgCol, avgRow, ok: sh <= maxCol && sv <= maxRow };
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
const manifest = { generatedFrom: path.basename(specPath), tileSize: SIZE, tiles: [] };
let bad = 0;
const all = [];
for (const mat of spec.materials || []) {
  const variants = Math.max(1, mat.variants || 1);
  for (let v = 0; v < variants; v++) {
    const seed = (mat.seed ?? 1) + v * 101;
    const buf = renderTile(mat, seed);
    const name = variants > 1 ? `${mat.name}_${v}` : mat.name;
    writePNG(path.join(OUT, `${name}.png`), SIZE, SIZE, buf);
    const s = seamScore(buf);
    if (!s.ok) bad++;
    all.push({ name, buf });
    manifest.tiles.push({ name, file: `${name}.png`, material: mat.name, variant: v, seed, seamH: +s.seamH.toFixed(2), seamV: +s.seamV.toFixed(2), maxCol: +s.maxCol.toFixed(2), maxRow: +s.maxRow.toFixed(2) });
    console.log(`  ${s.ok ? 'O' : 'X'} ${name.padEnd(16)} 이음매 ${s.seamH.toFixed(1)}/${s.seamV.toFixed(1)} · 내부 최대 ${s.maxCol.toFixed(1)}/${s.maxRow.toFixed(1)} · 평균 ${s.avgCol.toFixed(1)}/${s.avgRow.toFixed(1)}`);
  }
}
// 전이 타일
for (const tr of spec.transitions || []) {
  const A = (spec.materials || []).find((m) => m.name === tr.from);
  const B = (spec.materials || []).find((m) => m.name === tr.to);
  if (!A || !B) { console.error(`transitions: 모르는 재질 ${tr.from} -> ${tr.to}`); process.exit(2); }
  const edgeNoise = { grain: tr.edgeGrain || 6, seed: tr.edgeSeed ?? 909, amp: tr.edgeAmp ?? 0.35 };
  for (let mask = 0; mask < 16; mask++) {
    const corners = [(mask >> 0) & 1, (mask >> 1) & 1, (mask >> 2) & 1, (mask >> 3) & 1];
    const buf = renderTransition(A, B, corners, (tr.seed ?? 71), edgeNoise);
    const name = `${tr.from}-${tr.to}_${String(mask).padStart(2, '0')}`;
    writePNG(path.join(OUT, `${name}.png`), SIZE, SIZE, buf);
    all.push({ name, buf });
    manifest.tiles.push({ name, file: `${name}.png`, transition: `${tr.from}->${tr.to}`, cornerMask: mask,
      corners: { topLeft: corners[0], topRight: corners[1], bottomLeft: corners[2], bottomRight: corners[3] } });
  }
  console.log(`  + 전이 ${tr.from} -> ${tr.to} 16장 (코너 마스크 0~15)`);
}

if (!all.length) { console.error('스펙에 materials 가 없다.'); process.exit(2); }

// 시트: 가로 한 줄
const sheetW = SIZE * all.length, sheet = Buffer.alloc(sheetW * SIZE * 4);
all.forEach((t, i) => { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const s = (y * SIZE + x) * 4, d = (y * sheetW + x + i * SIZE) * 4;
  for (let c = 0; c < 4; c++) sheet[d + c] = t.buf[s + c];
} });
writePNG(path.join(OUT, 'tileset.png'), sheetW, SIZE, sheet);
manifest.sheet = { path: 'tileset.png', columns: all.length, rows: 1, padding: 0 };

// 프리뷰: **오토타일로 깔아 본다.** 무작위로 섞으면 전이 타일이 쓰이지 않아 아무것도 증명 못 한다.
//
// 코너 격자를 노이즈로 만들고(어느 코너가 B 인가), 칸마다 네 코너를 읽어
// 전부 같으면 해당 재질의 기본 타일, 섞여 있으면 그 코너 마스크의 전이 타일을 놓는다.
// **전이 타일이 제대로면 경계가 자연스럽게 흐르고, 어긋나면 눈에 바로 보인다.**
const FW = 14, FH = 9;
const pw = FW * SIZE, ph = FH * SIZE, prev = Buffer.alloc(pw * ph * 4);
const byName = new Map(all.map((t) => [t.name, t.buf]));
const tr0 = (spec.transitions || [])[0];
const rnd = mulberry(spec.previewSeed ?? 7);

if (tr0 && byName.has(`${tr0.from}-${tr0.to}_00`)) {
  // 코너 격자 (FW+1) x (FH+1): 0 = from, 1 = to
  const cw = FW + 1, ch = FH + 1, corner = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++)
    corner[y * cw + x] = fbm(x / cw, y / ch, 3, 2, spec.previewSeed ?? 7) > 0.5 ? 1 : 0;
  const variantsOf = (name) => all.filter((t) => t.name === name || t.name.startsWith(name + '_')).map((t) => t.buf);
  const baseA = variantsOf(tr0.from), baseB = variantsOf(tr0.to);
  for (let ty = 0; ty < FH; ty++) for (let tx = 0; tx < FW; tx++) {
    const c = [corner[ty * cw + tx], corner[ty * cw + tx + 1], corner[(ty + 1) * cw + tx], corner[(ty + 1) * cw + tx + 1]];
    const sum = c[0] + c[1] + c[2] + c[3];
    let buf;
    if (sum === 0) buf = baseA[Math.floor(rnd() * baseA.length)] || all[0].buf;
    else if (sum === 4) buf = baseB[Math.floor(rnd() * baseB.length)] || all[0].buf;
    else buf = byName.get(`${tr0.from}-${tr0.to}_${String(c[0] | (c[1] << 1) | (c[2] << 2) | (c[3] << 3)).padStart(2, '0')}`);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const si = (y * SIZE + x) * 4, di = ((ty * SIZE + y) * pw + tx * SIZE + x) * 4;
      for (let k = 0; k < 4; k++) prev[di + k] = buf[si + k];
    }
  }
  console.log(`프리뷰: ${tr0.from} -> ${tr0.to} 오토타일 배치 (${FW}x${FH})`);
} else {
  for (let ty = 0; ty < FH; ty++) for (let tx = 0; tx < FW; tx++) {
    const t = all[Math.floor(rnd() * all.length)];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const si = (y * SIZE + x) * 4, di = ((ty * SIZE + y) * pw + tx * SIZE + x) * 4;
      for (let k = 0; k < 4; k++) prev[di + k] = t.buf[si + k];
    }
  }
  console.log(`프리뷰: 전이 타일이 없어 무작위 배치 (${FW}x${FH}) — transitions 를 주면 오토타일로 깐다`);
}
writePNG(path.join(OUT, 'preview.png'), pw, ph, prev);

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n타일 ${all.length}장 · ${SIZE}px -> ${OUT}`);
console.log(`시트 tileset.png (${all.length}열 1행) · 프리뷰 preview.png (${FW}x${FH} 필드)`);
console.log('\n**수치가 0 이어도 preview.png 를 눈으로 봐라.** 이음매는 없는데 무늬가 반복돼 티가 날 수 있다 —');
console.log('그건 variants 를 늘리거나 grain 을 키워서 푼다. 도구는 "이어지는가"만 보지 "지루한가"는 안 본다.');
if (bad) { console.error(`\n이음매 발견 ${bad}건 — 주기 노이즈가 깨졌다는 뜻이다(버그).`); process.exit(1); }
