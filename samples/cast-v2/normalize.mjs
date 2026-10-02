// 캐스트 상대 크기 정규화 (스크래치).
// 고친 것(2026-10-02): 발을 캔버스 맨 아래에 붙이면 **잘린 것처럼 보인다.**
// 게임이 피벗을 바닥에 두더라도 스프라이트 자체에는 여백이 있어야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../scripts/lib-png-read.mjs';
import { writePNG } from '../scripts/lib-png.mjs';

const CANVAS = 256, BASE = 150, FLOOR = 10;   // FLOOR: 발 밑 여백(px)
const REL = { chaser: 0.75, hero: 1.0, lunger: 1.05, boss: 1.40 };
const IN = process.argv[2] || '.cast2/cut', OUT = process.argv[3] || '.cast2/norm';
fs.mkdirSync(OUT, { recursive: true });

const manifest = { canvas: CANVAS, baseHeightPx: BASE, floorMarginPx: FLOOR, anchor: 'bottom-center', sprites: {} };
for (const [id, rel] of Object.entries(REL)) {
  const src = readPNG(path.join(IN, `${id}_cut.png`));
  const targetH = Math.round(BASE * rel);
  const s = src.height / targetH;
  const targetW = Math.max(1, Math.round(src.width / s));
  if (targetH + FLOOR > CANVAS || targetW > CANVAS) {
    console.error(`${id}: ${targetW}x${targetH} 가 캔버스 ${CANVAS}(여백 ${FLOOR}) 를 넘는다 — BASE 를 낮춰라.`);
    process.exit(1);
  }
  const buf = Buffer.alloc(CANVAS * CANVAS * 4);
  const ox = Math.round((CANVAS - targetW) / 2);
  const oy = CANVAS - FLOOR - targetH;
  for (let y = 0; y < targetH; y++) for (let x = 0; x < targetW; x++) {
    const x0 = Math.floor(x * s), x1 = Math.min(src.width, Math.ceil((x + 1) * s));
    const y0 = Math.floor(y * s), y1 = Math.min(src.height, Math.ceil((y + 1) * s));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
      const o = (sy * src.width + sx) * 4, pa = src.data[o + 3] / 255;
      r += src.data[o] * pa; g += src.data[o + 1] * pa; b += src.data[o + 2] * pa; a += pa; n++;
    }
    if (!n) continue;
    const d = ((oy + y) * CANVAS + (ox + x)) * 4;
    if (a > 0) { buf[d] = Math.round(r / a); buf[d + 1] = Math.round(g / a); buf[d + 2] = Math.round(b / a); }
    buf[d + 3] = (a / n) >= 0.5 ? 255 : 0;
  }
  writePNG(path.join(OUT, `${id}.png`), CANVAS, CANVAS, buf);
  manifest.sprites[id] = { relativeScale: rel, heightPx: targetH, widthPx: targetW, anchorPx: [CANVAS / 2, CANVAS - FLOOR] };
  console.log(`  ${id.padEnd(7)} ${src.width}x${src.height} -> ${targetW}x${targetH} · 바닥 여백 ${FLOOR}px`);
}
fs.writeFileSync(path.join(OUT, 'cast-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
