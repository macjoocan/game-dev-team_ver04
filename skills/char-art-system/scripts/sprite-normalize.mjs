#!/usr/bin/env node
// sprite-normalize.mjs - 스프라이트를 같은 규격으로 맞춘다(캔버스·크기·피벗).
//   node sprite-normalize.mjs <폴더> --out <dir> [--canvas 512x768] [--fit 0.86]
//                             [--anchor bottom|center] [--no-scale]
//
// 왜: 생성물은 매번 크기가 다르다(실측 596x1473 ~ 927x1482). 그대로 애니메이션에 넣으면
// **프레임마다 캐릭터가 튄다.** 같은 캔버스에 같은 비율로, 발바닥을 같은 선에 맞춰야 한다.
//
// - 알파 bbox 로 실제 캐릭터 크기를 재고, 목표 높이 비율(--fit)에 맞춰 균일 축소한다
// - 발바닥(bbox 아래)을 baseline 에 고정한다(--anchor bottom). 점프 프레임은 center 가 낫다
// - 크기가 크게 튀는 것은 **이상치로 보고**한다 — 반신 컷이 섞이면 잘못 확대되기 때문이다

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
const input = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!input || input.startsWith('--')) {
  console.error('usage: node sprite-normalize.mjs <폴더> --out <dir> [--canvas 512x768] [--fit 0.86] [--anchor bottom|center]');
  process.exit(2);
}
const OUT = opt('--out', 'normalized');
const [CW, CH] = opt('--canvas', '512x768').split('x').map(Number);
const FIT = Number(opt('--fit', 0.86));       // 캐릭터 높이 / 캔버스 높이
const ANCHOR = opt('--anchor', 'bottom');
const NOSCALE = args.includes('--no-scale');

const files = fs.readdirSync(input).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.join(input, f));
if (!files.length) { console.error(`PNG 없음: ${input}`); process.exit(1); }

function bboxOf(img) {
  const { width: w, height: h, data } = img;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 16) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// 면적 평균 축소 — 최근접으로 줄이면 선이 끊긴다(오늘 hires 에서 계단을 겪은 것과 같은 이유)
function resample(img, bb, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const sx = bb.w / dw, sy = bb.h / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = bb.y + y * sy, y1 = Math.min(bb.y + bb.h, y0 + sy);
    for (let x = 0; x < dw; x++) {
      const x0 = bb.x + x * sx, x1 = Math.min(bb.x + bb.w, x0 + sx);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = Math.floor(y0); yy < Math.max(Math.floor(y0) + 1, Math.ceil(y1)); yy++) {
        for (let xx = Math.floor(x0); xx < Math.max(Math.floor(x0) + 1, Math.ceil(x1)); xx++) {
          if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
          const i = (yy * img.width + xx) * 4, al = img.data[i + 3] / 255;
          r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al; a += al; n++;
        }
      }
      const o = (y * dw + x) * 4;
      if (n > 0 && a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = Math.round((a / n) * 255); }
    }
  }
  return out;
}

// 1차: 전부 재서 기준 높이를 정한다(중앙값). 이상치 판정에 쓴다.
const metas = [];
for (const f of files) {
  const img = readPNG(f);
  const bb = bboxOf(img);
  if (!bb) { console.log(`  ${path.basename(f)}: 비어 있음 — 건너뜀`); continue; }
  metas.push({ f, img, bb });
}
const heights = metas.map((m) => m.bb.h).sort((a, b) => a - b);
const medH = heights[heights.length >> 1];

fs.mkdirSync(OUT, { recursive: true });
const manifest = { canvas: { w: CW, h: CH }, fit: FIT, anchor: ANCHOR, pivot: ANCHOR === 'bottom' ? { x: 0.5, y: 0.0 } : { x: 0.5, y: 0.5 }, sprites: [] };
const targetH = Math.round(CH * FIT);

console.log(`\n규격 통일 — ${metas.length}장 · 캔버스 ${CW}x${CH} · 높이 ${Math.round(FIT * 100)}% · 기준 ${ANCHOR}`);
for (const m of metas) {
  const ratio = m.bb.h / medH;
  const outlier = ratio < 0.7 || ratio > 1.4;   // 반신 컷·클로즈업이 섞였을 때
  let dw, dh;
  if (NOSCALE) { dw = m.bb.w; dh = m.bb.h; }
  else { dh = targetH; dw = Math.max(1, Math.round(m.bb.w * (targetH / m.bb.h))); }
  if (dw > CW) { const k = CW / dw; dw = CW; dh = Math.max(1, Math.round(dh * k)); }

  const small = resample(m.img, m.bb, dw, dh);
  const buf = Buffer.alloc(CW * CH * 4);
  const ox = Math.round((CW - dw) / 2);
  const oy = ANCHOR === 'bottom' ? CH - dh : Math.round((CH - dh) / 2);
  for (let y = 0; y < dh; y++) {
    if (oy + y < 0 || oy + y >= CH) continue;
    small.copy(buf, ((oy + y) * CW + ox) * 4, y * dw * 4, y * dw * 4 + dw * 4);
  }
  const name = path.basename(m.f);
  writePNG(path.join(OUT, name), CW, CH, buf);
  manifest.sprites.push({ name, srcSize: `${m.bb.w}x${m.bb.h}`, placed: `${dw}x${dh}`, heightRatio: +ratio.toFixed(2), outlier });
  console.log(`  ${name.padEnd(14)} ${String(m.bb.w).padStart(4)}x${String(m.bb.h).padStart(4)} -> ${String(dw).padStart(3)}x${String(dh).padStart(3)}  비율 ${ratio.toFixed(2)}${outlier ? '  ⚠ 이상치(반신 컷?)' : ''}`);
}
fs.writeFileSync(path.join(OUT, 'normalize.json'), JSON.stringify(manifest, null, 2));

const bad = manifest.sprites.filter((s) => s.outlier).length;
console.log(`\n-> ${OUT}  (피벗 ${manifest.pivot.x},${manifest.pivot.y})`);
if (bad) console.log(`⚠ 이상치 ${bad}장 — 반신·클로즈업이 섞이면 잘못 확대된다. 빼고 다시 돌려라.`);
