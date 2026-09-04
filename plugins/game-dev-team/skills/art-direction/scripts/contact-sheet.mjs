#!/usr/bin/env node
// contact-sheet.mjs - 여러 이미지를 한 장의 격자(콘택트 시트)로 합친다.
//   node contact-sheet.mjs <폴더> --out sheet.png [--cell 128] [--cols 8] [--bg "#202830"]
//
// 하위 폴더가 있으면 **폴더당 한 줄**로 배치한다(자동 분류 결과 검수용).
// 수십 장을 한 장으로 보면 라벨이 맞는지 즉시 판정된다 — 한 장씩 여는 것보다 훨씬 빠르다.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG, hex } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
const root = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!root || root.startsWith('--')) { console.error('usage: node contact-sheet.mjs <폴더> --out sheet.png [--cell 128] [--cols 8]'); process.exit(2); }
const OUT = opt('--out', 'sheet.png');
const CELL = Number(opt('--cell', 128));
const COLS = Number(opt('--cols', 8));
const BG = hex(opt('--bg', '#202830'));
const PAD = 4;

// 폴더 구성 파악: 하위 폴더가 있으면 그룹, 없으면 단일 그룹
const ents = fs.readdirSync(root, { withFileTypes: true });
const groups = [];
const dirs = ents.filter((e) => e.isDirectory()).map((e) => e.name).sort();
if (dirs.length) {
  for (const d of dirs) {
    const fl = fs.readdirSync(path.join(root, d)).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.join(root, d, f));
    if (fl.length) groups.push({ name: d, files: fl });
  }
} else {
  groups.push({ name: path.basename(root), files: ents.filter((e) => /\.png$/i.test(e.name)).map((e) => path.join(root, e.name)) });
}
if (!groups.length) { console.error('PNG 를 못 찾았다'); process.exit(1); }

const cols = Math.min(COLS, Math.max(...groups.map((g) => g.files.length)));
const rows = groups.reduce((a, g) => a + Math.ceil(Math.min(g.files.length, cols) / cols), 0);
const W = cols * (CELL + PAD) + PAD;
const H = rows * (CELL + PAD) + PAD;
const out = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { out[i * 4] = BG[0]; out[i * 4 + 1] = BG[1]; out[i * 4 + 2] = BG[2]; out[i * 4 + 3] = 255; }

// 셀에 맞춰 축소(최근접) + 중앙 배치. 알파는 체커 대신 배경색 위에 합성한다.
function blit(img, cx, cy) {
  const scale = Math.min(CELL / img.width, CELL / img.height, 1);
  const dw = Math.max(1, Math.round(img.width * scale));
  const dh = Math.max(1, Math.round(img.height * scale));
  const ox = cx + ((CELL - dw) >> 1);
  const oy = cy + ((CELL - dh) >> 1);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / scale));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / scale));
      const si = (sy * img.width + sx) * 4;
      const a = img.data[si + 3] / 255;
      if (a <= 0) continue;
      const di = ((oy + y) * W + (ox + x)) * 4;
      out[di]     = Math.round(img.data[si] * a + out[di] * (1 - a));
      out[di + 1] = Math.round(img.data[si + 1] * a + out[di + 1] * (1 - a));
      out[di + 2] = Math.round(img.data[si + 2] * a + out[di + 2] * (1 - a));
    }
  }
}

let row = 0;
const order = [];
for (const g of groups) {
  const take = g.files.slice(0, cols);
  take.forEach((f, i) => {
    try { blit(readPNG(f), PAD + i * (CELL + PAD), PAD + row * (CELL + PAD)); } catch {}
  });
  order.push(`${row + 1}행: ${g.name} (${take.length}/${g.files.length}장)`);
  row++;
}

writePNG(OUT, W, H, out);
console.log(`콘택트 시트 ${W}x${H} -> ${OUT}`);
for (const o of order) console.log('  ' + o);
