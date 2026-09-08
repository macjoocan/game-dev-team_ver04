#!/usr/bin/env node
// walk-composite.mjs - 정지 스프라이트 한 장에서 걷기 프레임을 **코드로** 만든다.
//   node walk-composite.mjs <알파있는캐릭터.png> --out <dir> [--frames 8]
//                           [--lift 0.30] [--bob 0.018] [--box lx,rx] [--mid x]
//                           [--hip 0.72] [--strip <out.png>]
//
// 왜 이게 필요한가 — 생성 모델 경로가 **양쪽 다** 막혔기 때문이다(hex-danmaku 실측 2026-09-08):
//
//   | 방법 | 의상 흔들림 | 다리 움직임 | 결과 |
//   |---|---|---|---|
//   | WAN 2.2 5B (img2video) | - | 없음 또는 형태 붕괴 | 쓸 구간 없음(8회) |
//   | LoRA + ControlNet txt2img | 11~16 | 8~12 | 걷기보다 **깜빡임**으로 보인다 |
//   | LoRA + ControlNet img2img | 0.9 | 0.6 | 의상은 잡혔는데 **다리도 멈췄다** |
//   | 이 스크립트 | **0.0** | 11 | 걷기로 보인다 |
//
// (숫자는 게임 렌더 크기 41x44 에서 인접 프레임의 평균 픽셀차. 알파 프리멀티플 후 측정)
//
// 생성 모델은 프레임마다 **독립 표본**이라 "의상은 그대로 두고 다리만" 이라는 요구를 구조적으로 못 지킨다.
// 반대로 이 스크립트는 한 장을 기하 변형만 하므로 의상 차이가 **정확히 0** 이다.
//
// 방법: 다리 영역을 좌/우로 나눠 각각 **위를 고정하고 세로로 압축**한다.
//   - 압축이면 부츠가 올라가면서 정강이가 짧아진다 = 정면에서 앞으로 내딛는 모습(전방 단축)
//   - 평행이동하면 부츠 위에 **빈 틈이 생긴다.** 압축은 틈이 없다 — 이게 압축을 쓰는 이유다
//   - 몸통 상하(bob)를 사이클당 2회 얹는다. 작은 화면에서 걷기를 파는 건 다리보다 이쪽이다
//
// 한계 (알고 쓴다):
//   - **옆모습 스트라이드는 못 만든다.** 앞뒤로 다리를 벌리는 건 없는 픽셀이 필요하다.
//     이건 정면/정면3/4 캐릭터의 제자리 걷기용이다
//   - 다리 상자 자동 검출은 초안이다. 창·망토처럼 아래까지 오는 소품이 있으면 `--box` 로 직접 준다
//   - 무릎이 접히지 않는다. 압축은 균일하다 — 관절이 필요하면 rig-split + 스켈레탈로 가라

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
const input = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!input || input.startsWith('--') || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node walk-composite.mjs <캐릭터.png> --out <dir> [--frames 8] [--lift 0.30]');
  console.error('       [--bob 0.018] [--box lx,rx] [--mid x] [--hip 0.72] [--strip out.png]');
  process.exit(2);
}
const OUT = opt('--out', 'walk');
const N = Number(opt('--frames', 8));
const LIFT = Number(opt('--lift', 0.30));     // 다리 길이 대비 최대 들림
const BOBR = Number(opt('--bob', 0.018));     // 피사체 높이 대비 상하 진폭
const HIPR = Number(opt('--hip', 0.72));      // 이 비율 아래를 다리로 본다
const BOX = opt('--box', null);
const MID = opt('--mid', null);
const STRIP = opt('--strip', null);
if (!(N >= 2 && N <= 64)) { console.error('--frames 는 2~64'); process.exit(2); }

const img = readPNG(input);
const { width: W, height: H, data } = img;
const A = (x, y) => data[(y * W + x) * 4 + 3];

let minX = W, minY = H, maxX = -1, maxY = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 16) {
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
}
if (maxY < 0) { console.error('알파가 전부 비었다. cutout/rembg 로 배경을 먼저 지워라.'); process.exit(1); }
const BW = maxX - minX + 1, BH = maxY - minY + 1;

// ── 다리 상자 찾기 ───────────────────────────────────────────────────────────
// 맨 아랫줄 덩어리를 씨앗으로 위로 따라 올라간다. 행 전체 x 범위를 쓰면 **창끝처럼 떨어진
// 덩어리가 딸려온다**(실측: 상자가 두 배로 벌어졌다). 그래서 배제 창을 씨앗 기준으로 고정한다.
function segs(y) {
  const out = []; let s = -1;
  for (let x = 0; x <= W; x++) {
    const on = x < W && A(x, y) > 16;
    if (on && s < 0) s = x;
    else if (!on && s >= 0) {
      if (out.length && s - out[out.length - 1][1] <= 3) out[out.length - 1][1] = x - 1;
      else out.push([s, x - 1]);
      s = -1;
    }
  }
  return out;
}
const hipY = minY + Math.round(BH * HIPR);
let lx, rx;
if (BOX) {
  [lx, rx] = BOX.split(',').map(Number);
} else {
  const seed = segs(maxY);
  if (!seed.length) { console.error('맨 아랫줄이 비었다'); process.exit(1); }
  lx = seed[0][0]; rx = seed[seed.length - 1][1];
  const margin = Math.round(BW * 0.12);
  const winL = lx - margin, winR = rx + margin;
  for (let y = maxY - 1; y >= hipY; y--) for (const [s0, s1] of segs(y)) {
    if (s1 >= winL && s0 <= winR) { lx = Math.min(lx, s0); rx = Math.max(rx, s1); }
  }
  // 위로 갈수록 몸통이 한 덩어리라 상자가 몸 전체로 번진다. 창으로 자른다.
  lx = Math.max(lx, winL); rx = Math.min(rx, winR);
}
const midX = MID != null ? Number(MID) : ((lx + rx) >> 1);
const legH = maxY - hipY + 1;
// --bob 0 은 '상하 없음' 이어야 한다. 이미 CSS 로 흔드는 대상(예: 보스)에 또 얹으면
// 주기가 다른 두 진동이 겹쳐 걷기가 아니라 떨림으로 보인다.
const BOB = BOBR <= 0 ? 0 : Math.max(1, Math.round(BH * BOBR));
console.log(`다리 상자 x ${lx}-${rx} (분할 ${midX})  y ${hipY}-${maxY}  다리길이 ${legH}px  몸통상하 ${BOB}px`);
if (!BOX) console.log('상자는 자동 검출이다. 소품이 딸려왔으면 --box lx,rx 로 직접 줘라 — 눈으로 한 번 확인해라.');

// ── 프레임 만들기 ────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const frames = [];
for (let i = 0; i < N; i++) {
  const t = i / N;
  const buf = Buffer.from(data);   // 원본 복사 — 의상은 손대지 않는다

  for (const [x0, x1, phase] of [[lx, midX, 0], [midX + 1, rx, 0.5]]) {
    const sw = Math.sin(2 * Math.PI * (t + phase));
    const lift = Math.max(0, sw) * LIFT;
    if (lift < 0.004 || x1 < x0) continue;
    const newH = Math.max(2, Math.round(legH * (1 - lift)));
    // 원래 자리를 지우고, 위(hipY)를 고정해 세로로 압축해 다시 그린다
    const src = [];
    for (let y = 0; y < legH; y++) {
      const row = [];
      for (let x = x0; x <= x1; x++) { const o = ((hipY + y) * W + x) * 4; row.push([data[o], data[o+1], data[o+2], data[o+3]]); }
      src.push(row);
    }
    for (let y = 0; y < legH; y++) for (let x = x0; x <= x1; x++) buf.fill(0, ((hipY + y) * W + x) * 4, ((hipY + y) * W + x) * 4 + 4);
    for (let y = 0; y < newH; y++) {
      const fy = (y + 0.5) * legH / newH - 0.5;           // 선형 보간 — 계단이 덜 보인다
      const y0 = Math.max(0, Math.min(legH - 1, Math.floor(fy)));
      const y1i = Math.min(legH - 1, y0 + 1), f = fy - y0;
      for (let x = x0; x <= x1; x++) {
        const a = src[y0][x - x0], b = src[y1i][x - x0];
        const o = ((hipY + y) * W + x) * 4;
        for (let c = 0; c < 4; c++) buf[o + c] = Math.round(a[c] + (b[c] - a[c]) * f);
      }
    }
  }

  // 발이 지면을 밀 때 몸이 올라간다(사이클당 2회). 강체 이동이라 형태가 안 상한다.
  const dy = -Math.round(BOB * Math.cos(2 * Math.PI * 2 * t));
  let outBuf = buf;
  if (dy) {
    outBuf = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) {
      const sy = y - dy;
      if (sy < 0 || sy >= H) continue;
      buf.copy(outBuf, y * W * 4, sy * W * 4, (sy + 1) * W * 4);
    }
  }
  const dest = path.join(OUT, `walk${String(i).padStart(2, '0')}.png`);
  writePNG(dest, W, H, outBuf);
  frames.push(outBuf);
  console.log('  ' + dest);
}

if (STRIP) {
  const strip = Buffer.alloc(W * N * H * 4);
  for (let i = 0; i < N; i++) for (let y = 0; y < H; y++) {
    frames[i].copy(strip, (y * W * N + i * W) * 4, y * W * 4, (y + 1) * W * 4);
  }
  fs.mkdirSync(path.dirname(path.resolve(STRIP)), { recursive: true });
  writePNG(STRIP, W * N, H, strip);
  console.log(`\n가로 스트립 -> ${STRIP}  ${W * N}x${H}  칸 ${W}x${H}`);
}

console.log(`\n${N}프레임 · 의상 차이 0 (원본을 기하 변형만 했다)`);
console.log('사이클이 루프가 맞는다 — 왕복(pingPong) 이 필요 없다.');
console.log('눈으로 한 번 봐라. 소품이 다리 상자에 걸리면 그 부분만 같이 늘어난다.');
