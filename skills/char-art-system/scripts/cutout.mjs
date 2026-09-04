#!/usr/bin/env node
// cutout.mjs - 생성 이미지의 배경을 지워 알파(투명)를 만든다.
//   node cutout.mjs <입력.png|폴더> [--out <dir>] [--tol 26] [--feather 1.5] [--trim]
//
// 왜 필요한가: 생성 모델은 알파를 못 만든다. 나오는 건 항상 RGB 라서, 게임에 넣으려면
// 배경을 잘라내야 한다.
//
// **단순 색 제거를 쓰면 안 된다.** "흰색을 지워라"로 하면 캐릭터가 입은 흰 옷·눈 흰자까지
// 사라진다(실제로 흰 튜닉 캐릭터에서 확인). 그래서 **테두리에서만 번져 들어가는**
// flood fill 을 쓴다 — 바깥과 이어진 배경만 지우고, 안쪽에 갇힌 흰색은 남는다.
//
// 출력: RGBA PNG + 잘라낸 비율·경계 품질 리포트

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
const input = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!input || input.startsWith('--')) {
  console.error('usage: node cutout.mjs <입력.png|폴더> [--out dir] [--tol 26] [--feather 1.5] [--trim]');
  console.error('  --tol      확실한 배경으로 볼 색 거리 (기본 26)');
  console.error('  --soft     부분 배경 상한 (기본 tol*2.6). 접지 그림자를 반투명으로 녹인다');
  console.error('  --feather  경계 부드럽게 (기본 1.5px). 0 이면 계단이 남는다');
  console.error('  --trim     투명 여백을 잘라 캔버스를 줄인다');
  process.exit(2);
}
const OUT = opt('--out', null);
const TOL = Number(opt('--tol', 26));            // 확실한 배경
const SOFT = Number(opt('--soft', 0)) || TOL * 2.6; // 여기까지는 "부분 배경"(접지 그림자 등)
const FEATHER = Number(opt('--feather', 1.5));
const TRIM = args.includes('--trim');

function cutout(file, destDir) {
  const img = readPNG(file);
  const { width: w, height: h, data } = img;

  // 배경색 = 네 모서리 최빈색. 균일한 배경을 전제로 한다(생성 프롬프트에서 순백을 강제한 이유)
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

  // 테두리에서 flood fill. 안쪽에 갇힌 같은 색(흰 옷)은 건드리지 않는다.
  // 히스테리시스: SOFT 까지 번지되, TOL 을 넘는 픽셀은 "부분 배경"으로 반투명 처리한다.
  // 순백 배경에 깔린 옅은 접지 그림자가 딱 이 구간에 들어온다 — 이분법으로 자르면
  // tol 을 올려야 하고, 그러면 캐릭터의 밝은 부분이 뚫린다.
  const isBg = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (p) => { if (!isBg[p] && dist(p * 4) <= SOFT) { isBg[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }

  // 알파 산출. 경계에서는 배경색과의 거리로 부분 알파를 준다(계단 방지).
  const out = Buffer.alloc(w * h * 4);
  let opaque = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    let a;
    if (isBg[p]) {
      const d = dist(i);
      // TOL 이하 = 완전 투명, TOL~SOFT = 거리에 비례한 반투명(그림자가 녹는다)
      a = d <= TOL ? 0 : Math.min(1, (d - TOL) / Math.max(1e-6, SOFT - TOL)) * 0.85;
    } else if (FEATHER > 0) {
      // 배경과 가까운 색일수록 반투명 — 배경에 인접한 픽셀에만 적용한다
      const x = p % w, y = (p - x) / w;
      const nearBg = (x > 0 && isBg[p - 1]) || (x < w - 1 && isBg[p + 1]) ||
                     (y > 0 && isBg[p - w]) || (y < h - 1 && isBg[p + w]);
      a = nearBg ? Math.max(0, Math.min(1, (dist(i) - TOL) / (TOL * FEATHER))) : 1;
    } else a = 1;
    out[i] = data[i]; out[i + 1] = data[i + 1]; out[i + 2] = data[i + 2];
    out[i + 3] = Math.round(a * 255);
    if (a > 0.5) opaque++;
  }

  let W = w, H = h, buf = out, ox = 0, oy = 0;
  if (TRIM) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (out[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX >= 0) {
      W = maxX - minX + 1; H = maxY - minY + 1; ox = minX; oy = minY;
      buf = Buffer.alloc(W * H * 4);
      for (let y = 0; y < H; y++) out.copy(buf, y * W * 4, ((oy + y) * w + ox) * 4, ((oy + y) * w + ox + W) * 4);
    }
  }

  // 구멍 검사 — 바깥과 안 이어졌는데 투명해진 픽셀이 있으면 캐릭터가 뚫린 것이다.
  // isBg 는 테두리 연결 성분만 표시하므로, 그 밖에서 알파 0 이 나오면 결함이다.
  let holes = 0;
  for (let p = 0; p < w * h; p++) if (!isBg[p] && out[p * 4 + 3] === 0) holes++;

  const dest = path.join(destDir, path.basename(file).replace(/\.png$/i, '_cut.png'));
  writePNG(dest, W, H, buf);
  return {
    file: path.basename(file), bg: `#${bg.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
    removedPct: +((1 - opaque / (w * h)) * 100).toFixed(1), holes,
    size: `${w}x${h}${TRIM ? ` -> ${W}x${H}` : ''}`, dest,
  };
}

const files = fs.statSync(input).isDirectory()
  ? fs.readdirSync(input).filter((f) => /\.png$/i.test(f) && !/_cut\.png$/i.test(f)).map((f) => path.join(input, f))
  : [input];
const destDir = OUT || (fs.statSync(input).isDirectory() ? path.join(input, 'cut') : path.dirname(input));
fs.mkdirSync(destDir, { recursive: true });

console.log(`\n배경 제거 — ${files.length}장 · tol ${TOL} · feather ${FEATHER}${TRIM ? ' · trim' : ''}`);
for (const f of files) {
  const r = cutout(f, destDir);
  console.log(`  ${r.file}  배경 ${r.bg} · 제거 ${r.removedPct}% · 구멍 ${r.holes} · ${r.size}`);
  if (r.holes > 0) console.log(`      !! 캐릭터가 뚫렸다 — --tol 을 내려라`);
}
console.log(`\n-> ${destDir}`);
console.log('제거율이 너무 낮으면 --tol 을 올려라(그림자가 남은 것). 캐릭터가 뚫리면 내려라.');
