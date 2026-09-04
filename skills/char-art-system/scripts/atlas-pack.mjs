#!/usr/bin/env node
// atlas-pack.mjs - 스프라이트들을 아틀라스 한 장으로 묶는다.
//   node atlas-pack.mjs <폴더> --out atlas.png [--max 2048] [--pad 2] [--trim] [--pot]
//
// 왜: 스프라이트가 낱장으로 흩어져 있으면 드로우콜이 그만큼 늘고, 엔진 임포트도 번거롭다.
// 아틀라스로 묶으면 배칭이 되고 좌표 JSON 하나로 관리된다.
//
// - **투명 여백을 잘라(--trim) 담고, 원래 위치를 JSON 에 남긴다.** 잘라내지 않으면 규격 통일로
//   만든 빈 공간이 그대로 아틀라스를 잡아먹는다(오늘 512x768 중 실제 픽셀은 절반 이하였다)
// - skyline 방식으로 채운다. 완벽한 최적해는 아니지만 이 규모(수십 장)에서는 충분하다
// - 좌표계는 **좌상단 원점**이다. 유니티 Sprite Editor 는 좌하단이므로 JSON 의 `originTopLeft`
//   플래그를 보고 변환해야 한다 — 이걸 놓치면 스프라이트가 위아래로 뒤집혀 잘린다

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
const input = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!input || input.startsWith('--')) { console.error('usage: node atlas-pack.mjs <폴더> --out atlas.png [--max 2048] [--pad 2] [--trim] [--pot]'); process.exit(2); }
const OUT = opt('--out', 'atlas.png');
const MAX = Number(opt('--max', 2048));
const PAD = Number(opt('--pad', 2));
const TRIM = args.includes('--trim');
const POT = args.includes('--pot');

const files = fs.readdirSync(input).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.join(input, f));
if (!files.length) { console.error(`PNG 없음: ${input}`); process.exit(1); }

const items = [];
for (const f of files) {
  const img = readPNG(f);
  let bb = { x: 0, y: 0, w: img.width, h: img.height };
  if (TRIM) {
    let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3] > 4) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    if (maxX < 0) { console.log(`  ${path.basename(f)}: 비어 있음 — 건너뜀`); continue; }
    bb = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  items.push({ name: path.basename(f), img, bb, srcSize: { w: img.width, h: img.height } });
}
// 높은 것부터 채우면 빈틈이 줄어든다
items.sort((a, b) => b.bb.h - a.bb.h);

// skyline 패킹
function pack(width) {
  const skyline = [{ x: 0, y: 0, w: width }];
  const placed = [];
  let used = 0;
  for (const it of items) {
    const nw = it.bb.w + PAD * 2, nh = it.bb.h + PAD * 2;
    let best = null;
    for (let i = 0; i < skyline.length; i++) {
      let x = skyline[i].x, rest = nw, y = 0, j = i;
      while (rest > 0 && j < skyline.length) { y = Math.max(y, skyline[j].y); rest -= skyline[j].w; j++; }
      if (rest > 0) continue;
      if (x + nw > width) continue;
      if (!best || y < best.y) best = { x, y, i, j };
    }
    if (!best) return null;
    placed.push({ it, x: best.x + PAD, y: best.y + PAD });
    used = Math.max(used, best.y + nh);
    // skyline 갱신
    const seg = { x: best.x, y: best.y + nh, w: nw };
    const next = [];
    for (const s of skyline) {
      if (s.x + s.w <= seg.x || s.x >= seg.x + seg.w) { next.push(s); continue; }
      if (s.x < seg.x) next.push({ x: s.x, y: s.y, w: seg.x - s.x });
      if (s.x + s.w > seg.x + seg.w) next.push({ x: seg.x + seg.w, y: s.y, w: s.x + s.w - (seg.x + seg.w) });
    }
    next.push(seg);
    next.sort((a, b) => a.x - b.x);
    skyline.length = 0; skyline.push(...next);
  }
  return { placed, height: used };
}

let W = 256, res = null;
while (W <= MAX) { res = pack(W); if (res && res.height <= MAX) break; W *= 2; res = null; }
if (!res) { console.error(`${MAX}px 안에 안 들어간다. --max 를 올리거나 스프라이트를 줄여라.`); process.exit(1); }
let H = POT ? 2 ** Math.ceil(Math.log2(res.height)) : res.height;

const buf = Buffer.alloc(W * H * 4);
const frames = [];
for (const p of res.placed) {
  const { it } = p;
  for (let y = 0; y < it.bb.h; y++) for (let x = 0; x < it.bb.w; x++) {
    const si = ((it.bb.y + y) * it.img.width + (it.bb.x + x)) * 4;
    const di = ((p.y + y) * W + (p.x + x)) * 4;
    buf[di] = it.img.data[si]; buf[di + 1] = it.img.data[si + 1];
    buf[di + 2] = it.img.data[si + 2]; buf[di + 3] = it.img.data[si + 3];
  }
  frames.push({
    name: it.name.replace(/\.png$/i, ''),
    frame: { x: p.x, y: p.y, w: it.bb.w, h: it.bb.h },
    // trim 으로 자른 만큼을 남긴다. 이게 없으면 엔진에서 위치가 어긋난다
    spriteSourceSize: { x: it.bb.x, y: it.bb.y, w: it.bb.w, h: it.bb.h },
    sourceSize: it.srcSize,
    pivot: { x: 0.5, y: 0.0 },
  });
}
writePNG(OUT, W, H, buf);

const jsonPath = OUT.replace(/\.png$/i, '.json');
const usedPx = frames.reduce((a, f) => a + f.frame.w * f.frame.h, 0);
fs.writeFileSync(jsonPath, JSON.stringify({
  meta: { image: path.basename(OUT), size: { w: W, h: H }, padding: PAD, trimmed: TRIM,
          originTopLeft: true, note: '유니티 Sprite Editor 는 좌하단 원점이다. y 를 뒤집어 넣어라.' },
  frames,
}, null, 2));

console.log(`\n아틀라스 ${W}x${H} · 스프라이트 ${frames.length}장 · 점유율 ${(usedPx / (W * H) * 100).toFixed(1)}%`);
console.log(`-> ${OUT}\n-> ${jsonPath}`);
