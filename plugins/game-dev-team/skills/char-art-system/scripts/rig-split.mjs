#!/usr/bin/env node
// rig-split.mjs - 캐릭터 한 장을 뼈대에 물릴 부위로 분해한다.
//   node rig-split.mjs <알파있는캐릭터.png> --out <dir> [--head 0.42] [--pad 6]
//
// 왜: 레퍼런스 게임(Royal Match·Royal Kingdom·Zen Match)은 캐릭터를 프레임 스프라이트가 아니라
// **스켈레탈 애니메이션**(Spine)으로 굴린다 — assets zip 에서 .skel/.atlas 가 73~134건 나왔다.
// 생성 모델로는 프레임 간 일관성을 못 맞추므로(실측: img2img IoU 0.84, ControlNet 0.50~0.67),
// **한 장을 잘 뽑아 부위로 나눠 뼈대에 물리는 쪽**이 현실적이다.
//
// 이 스크립트는 그 앞단만 한다: 비율 기준으로 부위를 자르고, 피벗과 뼈 계층 제안을 낸다.
// **자동 분해는 초안이다.** 팔이 몸통에 겹친 부분 같은 건 사람이 다듬어야 한다.
// 출력물은 Spine·DragonBones·Unity 2D Animation 어디에나 넣을 수 있는 PNG + JSON 이다.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
const input = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!input || input.startsWith('--')) { console.error('usage: node rig-split.mjs <캐릭터.png> --out <dir> [--head 0.42] [--pad 6]'); process.exit(2); }
const OUT = opt('--out', 'rig');
const HEAD = Number(opt('--head', 0.42));   // 머리가 차지하는 세로 비율. 3등신이면 0.4 안팎
const PAD = Number(opt('--pad', 6));        // 부위별 여유 픽셀. 관절이 끊겨 보이지 않게

const img = readPNG(input);
const { width: w, height: h, data } = img;
const hasAlpha = (() => { for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true; return false; })();
if (!hasAlpha) {
  console.error('알파가 없다. cutout.mjs 로 배경을 먼저 지워라 — 알파 없이 자르면 배경째 잘린다.');
  process.exit(1);
}

// 피사체 bbox
let minX = w, minY = h, maxX = -1, maxY = -1;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 16) {
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const bw = maxX - minX + 1, bh = maxY - minY + 1;

// 세로 구간을 비율로 나눈다. 3등신 치비 기준값이고, --head 로 조정한다.
const yHead = minY + Math.round(bh * HEAD);
const yHip  = minY + Math.round(bh * (HEAD + (1 - HEAD) * 0.42));
// 가로: 가운데를 몸통, 바깥을 팔로 본다
const xL = minX + Math.round(bw * 0.26);
const xR = minX + Math.round(bw * 0.74);
const xMid = minX + Math.round(bw * 0.5);

const PARTS = [
  { name: 'head',      x0: minX, y0: minY,  x1: maxX, y1: yHead, bone: 'root/torso/head' },
  { name: 'torso',     x0: xL,   y0: yHead, x1: xR,   y1: yHip,  bone: 'root/torso' },
  { name: 'arm_left',  x0: minX, y0: yHead, x1: xL,   y1: yHip,  bone: 'root/torso/arm_left' },
  { name: 'arm_right', x0: xR,   y0: yHead, x1: maxX, y1: yHip,  bone: 'root/torso/arm_right' },
  { name: 'leg_left',  x0: minX, y0: yHip,  x1: xMid, y1: maxY,  bone: 'root/hip/leg_left' },
  { name: 'leg_right', x0: xMid, y0: yHip,  x1: maxX, y1: maxY,  bone: 'root/hip/leg_right' },
];

fs.mkdirSync(OUT, { recursive: true });
const manifest = { source: path.basename(input), canvas: { w, h }, bbox: { x: minX, y: minY, w: bw, h: bh }, parts: [] };

for (const p of PARTS) {
  const x0 = Math.max(0, p.x0 - PAD), y0 = Math.max(0, p.y0 - PAD);
  const x1 = Math.min(w - 1, p.x1 + PAD), y1 = Math.min(h - 1, p.y1 + PAD);
  const pw = x1 - x0 + 1, ph = y1 - y0 + 1;
  const buf = Buffer.alloc(pw * ph * 4);
  let solid = 0;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const si = ((y0 + y) * w + (x0 + x)) * 4, di = (y * pw + x) * 4;
    buf[di] = data[si]; buf[di + 1] = data[si + 1]; buf[di + 2] = data[si + 2]; buf[di + 3] = data[si + 3];
    if (data[si + 3] > 16) solid++;
  }
  if (solid === 0) { console.log(`  ${p.name}: 비어 있음 — 건너뜀`); continue; }
  const dest = path.join(OUT, `${p.name}.png`);
  writePNG(dest, pw, ph, buf);
  // 피벗 = 관절 위치. 뼈가 붙는 자리라 이 값이 틀리면 회전이 어긋난다.
  const pivot = p.name === 'head' ? { x: 0.5, y: 0.05 }        // 목
    : p.name.startsWith('arm') ? { x: p.name.endsWith('left') ? 0.9 : 0.1, y: 0.1 }  // 어깨
    : p.name.startsWith('leg') ? { x: 0.5, y: 0.05 }           // 골반
    : { x: 0.5, y: 0.5 };
  manifest.parts.push({ name: p.name, file: `${p.name}.png`, rect: { x: x0, y: y0, w: pw, h: ph }, pivot, bone: p.bone, opaquePx: solid });
  console.log(`  ${p.name.padEnd(10)} ${String(pw).padStart(4)}x${String(ph).padStart(4)}  불투명 ${solid}px  피벗 ${pivot.x},${pivot.y}`);
}

manifest.boneHierarchy = {
  root: { hip: { leg_left: {}, leg_right: {} }, torso: { head: {}, arm_left: {}, arm_right: {} } },
};
manifest.note = '자동 분해 초안이다. 겹친 부위(팔↔몸통)와 피벗은 사람이 다듬어야 한다.';
fs.writeFileSync(path.join(OUT, 'rig.json'), JSON.stringify(manifest, null, 2));

console.log(`\n부위 ${manifest.parts.length}개 -> ${OUT}`);
console.log('rig.json 에 조각 위치·피벗·뼈 계층이 있다. Spine/DragonBones/Unity 2D Animation 에 그대로 넣는다.');
console.log('겹친 부위는 사람이 다듬어라 — 이건 초안이지 완성이 아니다.');
