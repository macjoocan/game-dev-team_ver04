#!/usr/bin/env node
// pose-skeleton.mjs - OpenPose 스켈레톤 이미지를 코드로 그린다.
//   node pose-skeleton.mjs <포즈이름|all|walk-cycle[:N]> --out <dir> [--w 1024] [--h 1536]
//   walk-cycle:8  걷기 한 사이클을 8프레임으로 낸다 — 루프가 맞는 포즈 시퀀스
//   --view front|side       정면(기본)은 다리가 교차하지 않게 스윙을 세로로 옮긴다
//   --proportion chibi|hero  체형. 캐릭터와 안 맞으면 ControlNet 이 캐릭터를 그 비율로 늘린다
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
const VIEW = opt('--view', 'front');
const PROP = opt('--proportion', 'chibi');   // chibi | hero. 캐릭터 체형에 맞춰라 - 틀리면 ControlNet 이 캐릭터를 늘린다.   // front | side. 정면이 기본 - 모바일 캐주얼 적이 대개 정면이다.

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

// ── 체형 비율 ────────────────────────────────────────────────────────────────
// OpenPose 에는 "머리 크기"라는 입력이 없다. 코·눈·귀 키포인트가 목에서 얼마나 멀리,
// 얼마나 넓게 떨어져 있는지가 곧 머리 크기다. 그래서 비율을 틀리면 ControlNet 이
// 캐릭터를 그 비율로 **늘린다** — 실측: 2.5등신 고블린에 7등신 스켈레톤을 물렸더니
// 팔다리가 막대처럼 늘어나고 갑옷·창이 통째로 사라졌다.
//
// 캐릭터를 보고 고른다. 모바일 캐주얼 적/아군은 대개 chibi 다.
const PROPORTIONS = {
  chibi: { head: 0.36, eye: 0.34, ear: 0.32, earX: 0.20, neck: 0.46, sh: 0.47, shX: 0.14,
           hip: 0.66, hipX: 0.07, thigh: 0.13, shin: 0.13, upperArm: 0.09, foreArm: 0.09 },
  hero:  { head: 0.20, eye: 0.18, ear: 0.20, earX: 0.07, neck: 0.34, sh: 0.35, shX: 0.08,
           hip: 0.58, hipX: 0.05, thigh: 0.15, shin: 0.15, upperArm: 0.12, foreArm: 0.11 },
};

// ── 걷기 사이클 — 프레임 시퀀스 생성 ──────────────────────────────────────────
// 낱개 포즈로는 애니메이션을 못 만든다. 걷기는 **위상(phase)의 연속**이라 파라미터로 낳는 게 맞다.
// COCO-18 에서 다리는 8~13(골반·무릎·발목), 팔은 2~7(어깨·팔꿈치·손목)이다.
// 걸을 때 팔은 다리와 **반대로** 흔들리고(대각 균형), 몸통은 두 번 위아래로 흔들린다(사이클당 2회).
//
// 각 관절을 사인파로 돌리되 위상만 어긋나게 준다. 좌우 다리는 정확히 반대 위상(π)이다.
function walkCyclePose(t, view, P) {   // t: 0~1, view: 'front'|'side', P: PROPORTIONS 항목
  const TAU = Math.PI * 2;
  const s = (phase) => Math.sin(TAU * (t + phase));
  // 몸통 상하 - 사이클당 2회(양발이 지면을 밀 때마다)
  const bob = -0.008 * Math.cos(TAU * 2 * t);
  const hipY = P.hip + bob, shY = P.sh + bob, neckY = P.neck + bob, headY = P.head + bob;
  const kneeD = P.thigh, ankD = P.thigh + P.shin;
  const lifted = ankD * 0.18;   // 든 발이 올라가는 양은 다리 길이에 비례한다

  if (view === 'side') {
    const leg = (phase) => {
      const sw = s(phase);
      const lift = Math.max(0, sw) * lifted;
      return {
        hip: [0.50, hipY],
        knee: [0.50 + sw * ankD * 0.18, hipY + kneeD - lift],
        ankle: [0.50 + sw * ankD * 0.32, hipY + ankD - lift * 1.6],
      };
    };
    const R = leg(0), L = leg(0.5);
    const arm = (phase) => {
      const sw = s(phase);
      return {
        sh: [0.50, shY],
        elb: [0.50 - sw * 0.045, shY + P.upperArm],
        wri: [0.50 - sw * 0.080, shY + P.upperArm + P.foreArm],
      };
    };
    const RA = arm(0.5), LA = arm(0);
    return {
      0: [0.50 + P.earX * 0.15, headY], 1: [0.50, neckY],
      2: RA.sh, 3: RA.elb, 4: RA.wri,
      5: LA.sh, 6: LA.elb, 7: LA.wri,
      8: R.hip, 9: R.knee, 10: R.ankle,
      11: L.hip, 12: L.knee, 13: L.ankle,
      14: [0.50 + P.earX * 0.25, P.eye + bob], 16: [0.50 + P.earX * 0.05, P.ear + bob],
    };
  }

  // 정면: **앞뒤 스윙을 x 로 옮기면 다리가 좌우로 교차한다** - 걷기가 아니라 가위질로 보인다.
  // 정면에서 앞으로 내딛는 다리는 화면상 위로 들리고 짧아 보인다(전방 단축). 스윙을 y 로 옮긴다.
  // side 는 -1(오른다리, 화면 왼쪽) / +1(왼다리). 발목 x 가 중심선(0.5)을 넘지 않게 묶는다.
  const leg = (phase, hx, side) => {
    const sw = s(phase);
    const fwd = Math.max(0, sw), back = Math.max(0, -sw);
    const lift = fwd * lifted;
    return {
      hip: [hx, hipY],
      knee: [hx + side * 0.012 * fwd, hipY + kneeD - lift],
      ankle: [hx + side * 0.004 - side * 0.012 * fwd, hipY + ankD - lift * 1.9 + back * 0.010],
    };
  };
  const R = leg(0, 0.5 - P.hipX, -1), L = leg(0.5, 0.5 + P.hipX, 1);

  // 팔: 정면에서는 팔도 앞뒤로 흔들리므로 x 진폭을 작게 준다.
  // 무기를 든 캐릭터는 팔이 크게 흔들리면 무기가 흔들려 부서진다 - 여기서 아끼는 게 낫다.
  const arm = (phase, sx, side) => {
    const sw = s(phase);
    return {
      sh: [sx, shY],
      elb: [sx + side * 0.03 - side * 0.012 * sw, shY + P.upperArm],
      wri: [sx + side * 0.05 - side * 0.022 * sw, shY + P.upperArm + P.foreArm],
    };
  };
  const RA = arm(0.5, 0.5 - P.shX, -1), LA = arm(0, 0.5 + P.shX, 1);

  return {
    0: [0.50, headY], 1: [0.50, neckY],
    2: RA.sh, 3: RA.elb, 4: RA.wri,
    5: LA.sh, 6: LA.elb, 7: LA.wri,
    8: R.hip, 9: R.knee, 10: R.ankle,
    11: L.hip, 12: L.knee, 13: L.ankle,
    14: [0.50 - P.earX * 0.35, P.eye + bob], 15: [0.50 + P.earX * 0.35, P.eye + bob],
    16: [0.50 - P.earX, P.ear + bob],        17: [0.50 + P.earX, P.ear + bob],
  };
}

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

// walk-cycle:N — 걷기 한 사이클을 N 프레임으로. 애니메이션 시트의 포즈 정본이 된다.
const P = PROPORTIONS[PROP];
if (!P) { console.error(`모르는 체형: ${PROP} (있는 것: ${Object.keys(PROPORTIONS).join(', ')})`); process.exit(2); }
const cycleMatch = /^walk-cycle(?::([0-9]+))?$/.exec(which);
let names;
if (cycleMatch) {
  const cnt = Number(cycleMatch[1] || 8);
  if (cnt < 2 || cnt > 64) { console.error('프레임 수는 2~64'); process.exit(2); }
  names = [];
  for (let i = 0; i < cnt; i++) {
    const nm = `walk${String(i).padStart(2, '0')}`;
    console.log('  ' + draw(walkCyclePose(i / cnt, VIEW, P), nm));
    names.push(nm);
  }
} else {
  names = which === 'all' ? Object.keys(POSES) : [which];
  for (const nm of names) {
    if (!POSES[nm]) { console.error(`모르는 포즈: ${nm} (있는 것: ${Object.keys(POSES).join(', ')}, walk-cycle[:N])`); process.exit(1); }
    console.log('  ' + draw(POSES[nm], nm));
  }
}
console.log(`\n${names.length}개 · ${W}x${H} · ControlNet(OpenPose) 입력용`);
if (cycleMatch) console.log('걷기 사이클은 **루프가 맞는다** — 마지막 다음이 첫 프레임이다. 생성 모델 시퀀스와 다른 점이다.');
console.log('색은 OpenPose 표준이다. 바꾸면 ControlNet 이 부위를 오인한다.');
