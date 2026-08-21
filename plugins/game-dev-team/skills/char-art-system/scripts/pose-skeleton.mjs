#!/usr/bin/env node
// pose-skeleton.mjs - OpenPose 스켈레톤 이미지를 코드로 그린다.
//   node pose-skeleton.mjs <포즈이름|all> --out <dir> [--w 1024] [--h 1536]
//
// 왜: ControlNet 으로 포즈를 지정하려면 스켈레톤 이미지가 필요한데, 보통은 사진에서 뽑는
// 전처리 노드(comfyui_controlnet_aux)를 깐다. 게임 캐릭터는 **우리가 원하는 포즈가 정해져 있으므로**
// 좌표를 직접 찍는 게 더 정확하고, 커스텀 노드 설치도 필요 없다.
//
// 좌표계는 COCO-18 키포인트, 색은 OpenPose 표준 팔레트를 따른다. 색이 틀리면 ControlNet 이
// 부위를 오인한다 — 임의로 바꾸지 마라.

import fs from 'node:fs';
import path from 'node:path';
import { writePNG } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
const which = args[0] || 'all';
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('--out', 'poses');
const W = Number(opt('--w', 1024));
const H = Number(opt('--h', 1536));

// COCO-18: 0코 1목 2오른어깨 3오른팔꿈 4오른손 5왼어깨 6왼팔꿈 7왼손
//          8오른골반 9오른무릎 10오른발 11왼골반 12왼무릎 13왼발 14오른눈 15왼눈 16오른귀 17왼귀
const LIMBS = [
  [1, 2, [255, 0, 0]], [1, 5, [255, 85, 0]], [2, 3, [255, 170, 0]], [3, 4, [255, 255, 0]],
  [5, 6, [170, 255, 0]], [6, 7, [85, 255, 0]], [1, 8, [0, 255, 0]], [8, 9, [0, 255, 85]],
  [9, 10, [0, 255, 170]], [1, 11, [0, 255, 255]], [11, 12, [0, 170, 255]], [12, 13, [0, 85, 255]],
  [1, 0, [0, 0, 255]], [0, 14, [85, 0, 255]], [14, 16, [170, 0, 255]], [0, 15, [255, 0, 255]],
  [15, 17, [255, 0, 170]],
];
const PT = [[255,0,0],[255,85,0],[255,170,0],[255,255,0],[170,255,0],[85,255,0],[0,255,0],[0,255,85],
  [0,255,170],[0,255,255],[0,170,255],[0,85,255],[0,0,255],[85,0,255],[170,0,255],[255,0,255],[255,0,170],[255,0,85]];

// 정규화 좌표(0~1). 3등신 치비 비율에 맞춰 머리를 크게 잡았다.
const POSES = {
  idle: {
    0:[.50,.20], 1:[.50,.34], 2:[.42,.35], 3:[.39,.47], 4:[.38,.58],
    5:[.58,.35], 6:[.61,.47], 7:[.62,.58], 8:[.45,.58], 9:[.44,.73], 10:[.43,.88],
    11:[.55,.58], 12:[.56,.73], 13:[.57,.88], 14:[.47,.18], 15:[.53,.18], 16:[.43,.20], 17:[.57,.20],
  },
  walk: {
    0:[.50,.20], 1:[.50,.34], 2:[.42,.35], 3:[.36,.45], 4:[.33,.55],
    5:[.58,.35], 6:[.64,.46], 7:[.68,.55], 8:[.45,.58], 9:[.38,.71], 10:[.33,.85],
    11:[.55,.58], 12:[.62,.72], 13:[.66,.86], 14:[.47,.18], 15:[.53,.18], 16:[.43,.20], 17:[.57,.20],
  },
  attack: {
    0:[.48,.20], 1:[.48,.34], 2:[.40,.35], 3:[.30,.31], 4:[.20,.28],
    5:[.56,.35], 6:[.62,.44], 7:[.60,.55], 8:[.44,.58], 9:[.40,.73], 10:[.36,.88],
    11:[.54,.58], 12:[.60,.72], 13:[.64,.87], 14:[.45,.18], 15:[.51,.18], 16:[.41,.20], 17:[.55,.20],
  },
  cheer: {
    0:[.50,.20], 1:[.50,.34], 2:[.42,.35], 3:[.36,.26], 4:[.33,.16],
    5:[.58,.35], 6:[.64,.26], 7:[.67,.16], 8:[.45,.58], 9:[.43,.73], 10:[.42,.88],
    11:[.55,.58], 12:[.57,.73], 13:[.58,.88], 14:[.47,.18], 15:[.53,.18], 16:[.43,.20], 17:[.57,.20],
  },
};

function draw(pose, name) {
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) buf[i * 4 + 3] = 255; // 배경 검정 — OpenPose 규약
  const px = (k) => [pose[k][0] * W, pose[k][1] * H];
  const limbW = Math.max(3, Math.round(Math.min(W, H) * 0.012));
  const dotR = Math.max(4, Math.round(Math.min(W, H) * 0.008));

  const line = (a, b, c) => {
    const [x0, y0] = px(a), [x1, y1] = px(b);
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let t = 0; t <= n; t++) {
      const x = x0 + (x1 - x0) * t / n, y = y0 + (y1 - y0) * t / n;
      for (let dy = -limbW; dy <= limbW; dy++) for (let dx = -limbW; dx <= limbW; dx++) {
        if (dx * dx + dy * dy > limbW * limbW) continue;
        const ix = Math.round(x + dx), iy = Math.round(y + dy);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        const i = (iy * W + ix) * 4;
        buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
      }
    }
  };
  for (const [a, b, c] of LIMBS) if (pose[a] && pose[b]) line(a, b, c);
  for (const k of Object.keys(pose)) {
    const [x, y] = px(k), c = PT[k] || [255, 255, 255];
    for (let dy = -dotR; dy <= dotR; dy++) for (let dx = -dotR; dx <= dotR; dx++) {
      if (dx * dx + dy * dy > dotR * dotR) continue;
      const ix = Math.round(x + dx), iy = Math.round(y + dy);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = (iy * W + ix) * 4;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const dest = path.join(OUT, `pose_${name}.png`);
  writePNG(dest, W, H, buf);
  return dest;
}

const names = which === 'all' ? Object.keys(POSES) : [which];
for (const n of names) {
  if (!POSES[n]) { console.error(`모르는 포즈: ${n} (있는 것: ${Object.keys(POSES).join(', ')})`); process.exit(1); }
  console.log('  ' + draw(POSES[n], n));
}
console.log(`\n${names.length}개 · ${W}x${H} · ControlNet(OpenPose) 입력용`);
console.log('색은 OpenPose 표준이다. 바꾸면 ControlNet 이 부위를 오인한다.');
