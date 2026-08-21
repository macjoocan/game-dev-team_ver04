#!/usr/bin/env node
// sheet-split.mjs - 캐릭터 시트 한 장을 개별 스프라이트로 잘라낸다.
//   node sheet-split.mjs <시트.png> --out <dir> [--min 0.01] [--tol 30] [--pad 8]
//
// 왜: 생성 모델은 "여러 포즈를 한 장에" 그리는 걸 아주 잘한다(오히려 막기가 어렵다).
// 그리고 **한 장 안에서는 정체성이 유지된다** — 같은 디노이징 과정이라 모델이 캐릭터를
// 스스로 일관되게 잡는다. 별도로 4번 생성하는 것보다 흔들림이 적다.
// 그래서 시트를 일부러 뽑고, 여기서 셀을 잘라내는 게 실용적인 경로다.
//
// 방법: 배경을 테두리 flood fill 로 지운 뒤, 남은 덩어리(연결 성분)를 하나씩 떼어낸다.
// 격자 좌표를 가정하지 않는다 — 모델이 요청한 셀 수를 안 지키기 때문이다(2x2 요청에 7개가 나온다).

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
const input = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!input) { console.error('usage: node sheet-split.mjs <시트.png> --out <dir> [--min 0.01] [--tol 30] [--pad 8]'); process.exit(2); }
const OUT = opt('--out', 'cells');
const MIN = Number(opt('--min', 0.01));   // 전체 면적 대비 최소 크기. 이보다 작으면 파편으로 본다
const TOL = Number(opt('--tol', 30));
const PAD = Number(opt('--pad', 8));

const img = readPNG(input);
const { width: w, height: h, data } = img;

// 배경색 = 모서리 최빈색
const cnt = new Map();
const cs = Math.max(2, Math.floor(Math.min(w, h) * 0.03));
for (const [ox, oy] of [[0, 0], [w - cs, 0], [0, h - cs], [w - cs, h - cs]]) {
  for (let y = oy; y < oy + cs; y++) for (let x = ox; x < ox + cs; x++) {
    const i = (y * w + x) * 4;
    const k = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }
}
const bg = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map((v) => (Number(v) << 3) + 4);
const dist = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);

// 전경 마스크 (테두리 flood fill 로 배경만 제거 — 캐릭터 안의 흰색은 남긴다)
const isBg = new Uint8Array(w * h);
{
  const st = new Int32Array(w * h); let sp = 0;
  const push = (p) => { if (!isBg[p] && dist(p * 4) <= TOL) { isBg[p] = 1; st[sp++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp > 0) {
    const p = st[--sp], x = p % w, y = (p - x) / w;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }
}

// 연결 성분 = 셀 후보. 8방향으로 잇는다(얇은 소품이 본체에서 떨어지지 않게)
const seen = new Uint8Array(w * h);
const st = new Int32Array(w * h);
const cells = [];
const minArea = w * h * MIN;
for (let p0 = 0; p0 < w * h; p0++) {
  if (isBg[p0] || seen[p0]) continue;
  let sp = 0, area = 0, minX = w, minY = h, maxX = -1, maxY = -1;
  st[sp++] = p0; seen[p0] = 1;
  const px = [];
  while (sp > 0) {
    const p = st[--sp]; area++; px.push(p);
    const x = p % w, y = (p - x) / w;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (!isBg[q] && !seen[q]) { seen[q] = 1; st[sp++] = q; }
    }
  }
  if (area >= minArea) cells.push({ area, minX, minY, maxX, maxY, px });
}

// 읽는 순서(위 -> 아래, 왼 -> 오른)로 정렬. 애니메이션 프레임 순서와 맞추기 쉽다.
const rowH = h * 0.18;
cells.sort((a, b) => (Math.floor(a.minY / rowH) - Math.floor(b.minY / rowH)) || (a.minX - b.minX));

fs.mkdirSync(OUT, { recursive: true });
const manifest = { source: path.basename(input), sheet: { w, h }, bg: `#${bg.map((c) => c.toString(16).padStart(2, '0')).join('')}`, cells: [] };

cells.forEach((c, i) => {
  const x0 = Math.max(0, c.minX - PAD), y0 = Math.max(0, c.minY - PAD);
  const x1 = Math.min(w - 1, c.maxX + PAD), y1 = Math.min(h - 1, c.maxY + PAD);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const buf = Buffer.alloc(cw * ch * 4);
  // 이 셀에 속한 픽셀만 옮긴다 — 옆 셀이 박스 안에 걸쳐 있어도 섞이지 않는다
  const mine = new Set(c.px);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const sp = (y0 + y) * w + (x0 + x), si = sp * 4, di = (y * cw + x) * 4;
    if (!mine.has(sp)) { buf[di + 3] = 0; continue; }
    buf[di] = data[si]; buf[di + 1] = data[si + 1]; buf[di + 2] = data[si + 2]; buf[di + 3] = 255;
  }
  const name = `cell_${String(i).padStart(2, '0')}`;
  writePNG(path.join(OUT, `${name}.png`), cw, ch, buf);
  manifest.cells.push({ name, file: `${name}.png`, rect: { x: x0, y: y0, w: cw, h: ch }, opaquePx: c.area });
  console.log(`  ${name}  ${String(cw).padStart(4)}x${String(ch).padStart(4)}  ${c.area}px`);
});

fs.writeFileSync(path.join(OUT, 'cells.json'), JSON.stringify(manifest, null, 2));
console.log(`\n셀 ${cells.length}개 -> ${OUT}`);
console.log('셀이 너무 잘게 나뉘면 --min 을 올려라(소품·파편까지 센 것). 붙어 나오면 --tol 을 올려라.');
