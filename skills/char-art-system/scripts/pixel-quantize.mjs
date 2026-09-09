#!/usr/bin/env node
// pixel-quantize.mjs - 큰 일러스트를 **도트 계약**(색 N개 · 알파 이진 · 격자 정렬)으로 변환한다.
//   node pixel-quantize.mjs <일러스트.png> --out <out.png> [--size 48] [--colors 24]
//                          [--fit 0.94] [--clean 2] [--alpha-cut 0.5] [--supersample 4]
//
// 왜 이게 필요한가 — **확산 모델은 도트를 못 만든다.** 품질이 모자란 게 아니라 종류가 다르다.
// VAE 가 연속 RGB 를 뱉으므로 1024px 생성물은 색이 10만 개 넘고 경계가 전부 부드럽다.
// 그걸 48px 로 줄이면 도트가 되는 게 아니라 **흐릿한 썸네일**이 된다.
// 그래서 격자·팔레트·알파를 **모델 바깥에서 강제**한다.
//
// 도트 계약 (레퍼런스 상용 픽셀아트 300장 실측, 2026-09-09):
//   불투명 색 수   중앙 22개 (16~32 가 52%)
//   반투명 픽셀    91% 가 0%  -> 알파는 이진이다. 안티에일리어싱이 아예 없다
//   외톨이 픽셀    중앙 9.1%  -> **0 이 목표가 아니다**. 1픽셀 하이라이트는 도트 기법이다
//   평평한 픽셀    중앙 14.3%
//   어두운 외곽선  안 쓴다(가장자리가 더 어두운 건 27%뿐)
//
// 처리 순서가 중요하다:
//   1) 알파를 **먼저** 이진화한 뒤 축소한다. 순서를 바꾸면 반투명 테두리 색이 본체에 섞여 탁해진다
//   2) 면적 평균 축소는 **알파 가중**으로. 투명부의 검정이 섞이면 테두리가 어두워진다
//   3) 색 양자화는 **Lab 에서** k-means. RGB 로 하면 사람 눈에 다른 색을 한 덩어리로 합친다
//   4) 외톨이 픽셀 정리 — 축소한 일러스트와 손으로 찍은 도트를 가르는 지문이다
//      실측: 정리 전 36.5% -> clean=2 에서 6.6% (레퍼런스 9.1%)
//
// 한계 (알고 쓴다):
//   - 얼굴은 안 살아난다. 48px 에서 얼굴은 6x6 픽셀이라 축소로는 표정이 안 나온다 — 손으로 찍어야 한다
//   - 원본 디테일이 많으면 결과도 시끄럽다. 무엇을 버릴지는 사람이 정한다(그게 도트의 본질이다)
//   - `--clean` 을 올릴수록 평평해지지만 4 이상은 **과하게 밀린다**(외톨이 2.6%, 레퍼런스보다 밋밋)

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
const input = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!input || input.startsWith('--') || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node pixel-quantize.mjs <일러스트.png> --out <out.png> [--size 48] [--colors 24]');
  console.error('       [--fit 0.94] [--clean 2] [--alpha-cut 0.5] [--supersample 4]');
  process.exit(2);
}
const OUT   = opt('--out', null);
const SIZE  = Number(opt('--size', 48));
const K     = Number(opt('--colors', 24));
const FIT   = Number(opt('--fit', 0.94));
const CLEAN = Number(opt('--clean', 2));     // 2 가 레퍼런스 대역에 가장 가깝다
const ACUT  = Number(opt('--alpha-cut', 0.5));
const SS    = Number(opt('--supersample', 4));
if (!OUT) { console.error('--out 이 필요하다'); process.exit(2); }
if (!(SIZE >= 8 && SIZE <= 256)) { console.error('--size 는 8~256'); process.exit(2); }
if (!(K >= 2 && K <= 64)) { console.error('--colors 는 2~64'); process.exit(2); }

// ── sRGB -> Lab ──────────────────────────────────────────────────────────────
function toLab(r, g, b) {
  const f = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  let x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  let y = (0.2126 * R + 0.7152 * G + 0.0722 * B);
  let z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const t = (u) => (u > 0.008856 ? Math.cbrt(u) : 7.787 * u + 16 / 116);
  x = t(x); y = t(y); z = t(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const img = readPNG(input);
const { width: W, height: H, data } = img;
const A = (x, y) => data[(y * W + x) * 4 + 3];

let minX = W, minY = H, maxX = -1, maxY = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 16) {
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
}
if (maxY < 0) { console.error('알파가 전부 비었다. cutout/rembg 로 배경을 먼저 지워라.'); process.exit(1); }
const BW = maxX - minX + 1, BH = maxY - minY + 1;

// 목표는 **캔버스 크기** 기준이다
let th = Math.max(1, Math.round(SIZE * FIT));
let tw = Math.max(1, Math.round(BW * th / BH));
if (tw > SIZE) { tw = SIZE; th = Math.max(1, Math.round(BH * tw / BW)); }

// ── 알파 가중 면적 평균 축소 ─────────────────────────────────────────────────
// 원본 bbox 를 (tw*SS) x (th*SS) 로 본 뒤 SS x SS 블록 평균. 별도 리샘플러 없이 한 번에 간다.
const gw = tw * SS, gh = th * SS;
const accR = new Float64Array(tw * th), accG = new Float64Array(tw * th);
const accB = new Float64Array(tw * th), accA = new Float64Array(tw * th);
const accN = new Float64Array(tw * th);
for (let gy = 0; gy < gh; gy++) {
  const sy = Math.min(maxY, minY + Math.floor(gy * BH / gh));
  const cy = Math.floor(gy / SS);
  for (let gx = 0; gx < gw; gx++) {
    const sx = Math.min(maxX, minX + Math.floor(gx * BW / gw));
    const o = (sy * W + sx) * 4;
    const a = data[o + 3] / 255;
    const c = cy * tw + Math.floor(gx / SS);
    accR[c] += data[o] * a; accG[c] += data[o + 1] * a; accB[c] += data[o + 2] * a;
    accA[c] += a; accN[c] += 1;
  }
}

// ── 알파 이진화 + 불투명 픽셀 수집 ───────────────────────────────────────────
const mask = new Uint8Array(tw * th);
const px = [];
for (let i = 0; i < tw * th; i++) {
  const a = accA[i] / accN[i];
  if (a < ACUT) continue;
  mask[i] = 1;
  const w = Math.max(accA[i], 1e-6);
  px.push([accR[i] / w, accG[i] / w, accB[i] / w]);
}
if (px.length < K) { console.error(`불투명 픽셀이 ${px.length}개뿐이다 — --colors 를 줄이거나 --size 를 키워라`); process.exit(1); }

// ── Lab k-means (k-means++ 초기화) ──────────────────────────────────────────
const lab = px.map(([r, g, b]) => toLab(r, g, b));
const d2 = (a, b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const cent = [lab[Math.floor(rnd() * lab.length)]];
while (cent.length < K) {
  const dist = lab.map((p) => Math.min(...cent.map((c) => d2(p, c))));
  const sum = dist.reduce((a, b) => a + b, 0);
  let t = rnd() * sum, pick = 0;
  for (let i = 0; i < dist.length; i++) { t -= dist[i]; if (t <= 0) { pick = i; break; } }
  cent.push(lab[pick]);
}
let assign = new Int32Array(px.length);
for (let it = 0; it < 40; it++) {
  for (let i = 0; i < lab.length; i++) {
    let bi = 0, bd = Infinity;
    for (let j = 0; j < K; j++) { const d = d2(lab[i], cent[j]); if (d < bd) { bd = d; bi = j; } }
    assign[i] = bi;
  }
  const s = Array.from({ length: K }, () => [0, 0, 0, 0]);
  for (let i = 0; i < lab.length; i++) { const a = s[assign[i]]; a[0]+=lab[i][0]; a[1]+=lab[i][1]; a[2]+=lab[i][2]; a[3]++; }
  for (let j = 0; j < K; j++) if (s[j][3]) cent[j] = [s[j][0]/s[j][3], s[j][1]/s[j][3], s[j][2]/s[j][3]];
}
// 대표색은 평균 Lab 이 아니라 그 군집의 **평균 RGB** 로 — Lab->RGB 역변환 오차를 피한다
const pal = Array.from({ length: K }, () => [0, 0, 0, 0]);
for (let i = 0; i < px.length; i++) { const p = pal[assign[i]]; p[0]+=px[i][0]; p[1]+=px[i][1]; p[2]+=px[i][2]; p[3]++; }
for (const p of pal) if (p[3]) { p[0]/=p[3]; p[1]/=p[3]; p[2]/=p[3]; }

// ── 인덱스 맵 + 외톨이 픽셀 정리 ────────────────────────────────────────────
const idx = new Int32Array(tw * th).fill(-1);
{ let k = 0; for (let i = 0; i < tw * th; i++) if (mask[i]) idx[i] = assign[k++]; }
for (let pass = 0; pass < CLEAN; pass++) {
  const next = Int32Array.from(idx);
  let changed = 0;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const i = y * tw + x;
    if (idx[i] < 0) continue;
    const nb = [];
    if (x > 0) nb.push(idx[i - 1]);
    if (x < tw - 1) nb.push(idx[i + 1]);
    if (y > 0) nb.push(idx[i - tw]);
    if (y < th - 1) nb.push(idx[i + tw]);
    const valid = nb.filter((v) => v >= 0);
    if (valid.some((v) => v === idx[i]) || !valid.length) continue;   // 이웃에 자기 색이 있으면 둔다
    const cnt = new Map();
    for (const v of valid) cnt.set(v, (cnt.get(v) || 0) + 1);
    next[i] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];   // 이웃 최빈색
    changed++;
  }
  idx.set(next);
  if (!changed) break;
}

// ── 캔버스에 하단 중앙 정렬 ─────────────────────────────────────────────────
const buf = Buffer.alloc(SIZE * SIZE * 4);
const oy = SIZE - th, ox = (SIZE - tw) >> 1;
const used = new Set();
for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
  const i = y * tw + x;
  if (idx[i] < 0) continue;
  const c = pal[idx[i]];
  const o = ((oy + y) * SIZE + ox + x) * 4;
  buf[o] = Math.round(c[0]); buf[o+1] = Math.round(c[1]); buf[o+2] = Math.round(c[2]); buf[o+3] = 255;
  used.add(buf[o] * 65536 + buf[o+1] * 256 + buf[o+2]);
}
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
writePNG(OUT, SIZE, SIZE, buf);

const opaque = idx.reduce((a, v) => a + (v >= 0 ? 1 : 0), 0);
console.log(`${OUT}  ${SIZE}x${SIZE}  사용색 ${used.size}개  불투명 ${opaque}px  반투명 0%`);
console.log('판정은 pixel-contract.mjs 로 한다 — 색 수만 맞아도 축소한 일러스트일 수 있다.');
