#!/usr/bin/env node
// pixel-contract.mjs - "이게 진짜 도트인가"를 판정한다.
//   node pixel-contract.mjs <스프라이트.png|폴더> [--cell 48] [--out dir]
//                           [--colors 16,32] [--lonely 0.04,0.15] [--flat 0.08] [--semi 0.005]
//
// 종료 코드: 0 충족 · 1 미달 · 3 측정 불가
//
// 왜 색 수만 세면 안 되나 — **축소한 일러스트도 색 수는 맞출 수 있다.**
// 실측(2026-09-09): 큰 일러스트를 48px 로 줄이고 24색으로 양자화했더니 색·알파는 계약을 지켰는데
// 외톨이 픽셀이 36.5% 였다(레퍼런스 9.1%). 눈으로 보면 도트가 아니라 노이즈 덩어리였다.
// 그래서 **공간 구조**를 같이 잰다.
//
// 기준선은 상용 픽셀아트 300장 실측이다(캐릭터 크기 14~64px, 알파 있는 것만):
//   불투명 색 수   중앙 22   (16~32 이 52%)
//   반투명 픽셀    91% 가 0%
//   외톨이 픽셀    중앙 9.1%  IQR 6.3~10.8
//   평평한 픽셀    중앙 14.3% IQR 11.1~18.4
//
// **하드 게이트와 화풍 지표를 섞지 마라 — 한 번 틀렸다.**
//   하드 게이트(어기면 미달): 색 수 · 반투명 비율. 이건 도트냐 아니냐의 문제다
//   화풍 지표(보고만): 외톨이 · 평평. **품질 게이트가 아니다**
//
// 처음엔 외톨이 상한을 15% 로 박았다가 멀쩡한 결과를 반려했다. 실측:
//   축소한 일러스트(정리 전)  외톨이 36.5% · 평평 2.9%  -> 눈으로도 노이즈. 미달이 맞다
//   도트 전용 모델 4방향 출력  외톨이 21~26% · 평평 2.6~3.3%  -> **게임 크기에서 멀쩡하다**
// 둘의 외톨이·평평이 비슷한데 하나는 좋고 하나는 나쁘다. 이 두 지표만으로는 못 가른다.
// 그래서 극단(35% 초과)만 미달로 두고 나머지는 **수치를 보여주고 사람이 본다.**
//
// 안 재는 것: 예쁜가, 캐릭터를 알아볼 수 있는가, 화풍이 맞는가. 그건 사람이 본다.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';

const args = process.argv.slice(2);
const input = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!input || input.startsWith('--') || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node pixel-contract.mjs <스프라이트.png|폴더> [--cell 48] [--out dir]');
  console.error('       [--colors 16,32] [--lonely 0.04,0.15] [--flat 0.08] [--semi 0.005]');
  process.exit(2);
}
const CELL = Number(opt('--cell', 0));            // >0 이면 가로 스트립을 이 크기로 쪼개 프레임별로 잰다
const OUT  = opt('--out', null);
const [CMIN, CMAX] = opt('--colors', '16,32').split(',').map(Number);
const [LMIN, LMAX] = opt('--lonely', '0,0.35').split(',').map(Number);  // 극단만 막는다. 화풍 대역이 아니다
const FLATMIN = Number(opt('--flat', 0));   // 기본은 안 막는다(--flat 0.08 로 켤 수 있다)
const SEMIMAX = Number(opt('--semi', 0.005));

// ── 입력 없음은 미달이 아니라 측정 불가다 (종료 코드 계약) ──────────────────
function collect(p) {
  if (!fs.existsSync(p)) return null;
  if (fs.statSync(p).isDirectory()) {
    const fs2 = fs.readdirSync(p).filter((f) => f.toLowerCase().endsWith('.png')).sort();
    return fs2.length ? fs2.map((f) => path.join(p, f)) : null;
  }
  return [p];
}
const files = collect(input);
if (!files) {
  console.log('## [주장]\n판정: **측정 불가** — 입력 PNG 이 없다.\n');
  console.log('## [공백]\n- 경로를 확인해라. 폴더면 안에 .png 가 있어야 한다.');
  process.exit(3);
}

function measure(img, x0, y0, w, h) {
  const { width: W, data } = img;
  const at = (x, y) => ((y0 + y) * W + (x0 + x)) * 4;
  const key = new Int32Array(w * h).fill(-1);
  let opaque = 0, semi = 0, anyAlpha = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = at(x, y), a = data[o + 3];
    if (a > 0) anyAlpha++;
    if (a > 0 && a < 250) semi++;
    if (a >= 128) { key[y * w + x] = data[o] * 65536 + data[o + 1] * 256 + data[o + 2]; opaque++; }
  }
  if (opaque < 30) return null;
  const colors = new Set();
  let lonely = 0, flat = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = key[y * w + x];
    if (k < 0) continue;
    colors.add(k);
    let same = 0, valid = 0;
    for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const ny = y + dy, nx = x + dx;
      if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
      const nk = key[ny * w + nx];
      if (nk < 0) continue;
      valid++;
      if (nk === k) same++;
    }
    if (valid > 0 && same === 0) lonely++;
    if (same === 4) flat++;
  }
  return { colors: colors.size, colorSet: colors, opaque, lonely: lonely / opaque, flat: flat / opaque,
           semi: anyAlpha ? semi / anyAlpha : 0 };
}

const rows = [];
const sheetPalette = new Map();   // 파일 -> 색 합집합
for (const f of files) {
  let img;
  try { img = readPNG(f); } catch { continue; }
  // 시트는 가로 스트립일 수도 격자일 수도 있다. **행을 안 세면 위 한 줄만 재고 통과시킨다**
  // (실측: 192x192 4x4 시트를 4칸만 재고 나머지 12칸을 놓쳤다).
  const cols = CELL > 0 ? Math.max(1, Math.floor(img.width / CELL)) : 1;
  const rowsN = CELL > 0 ? Math.max(1, Math.floor(img.height / CELL)) : 1;
  for (let ry = 0; ry < rowsN; ry++) for (let cx = 0; cx < cols; cx++) {
    const m = CELL > 0 ? measure(img, cx * CELL, ry * CELL, CELL, CELL)
                       : measure(img, 0, 0, img.width, img.height);
    if (!m) continue;
    if (!sheetPalette.has(f)) sheetPalette.set(f, new Set());
    for (const c of m.colorSet) sheetPalette.get(f).add(c);
    rows.push({ file: f, name: path.basename(f) + (CELL > 0 ? (rowsN > 1 ? `#${ry},${cx}` : `#${cx}`) : ''), ...m });
  }
}
if (!rows.length) {
  console.log('## [주장]\n판정: **측정 불가** — 불투명 픽셀이 30개 미만이라 잴 것이 없다.\n');
  process.exit(3);
}

const fails = [];
for (const r of rows) {
  const bad = [];
  // 색 수는 **시트 속성**이다. 후면처럼 단순한 프레임은 색이 적은 게 정상이라
  // 프레임마다 하한을 걸면 멀쩡한 프레임을 반려한다(실측: 망토+머리뿐인 후면이 14색).
  if (r.semi > SEMIMAX) bad.push(`반투명 ${(r.semi*100).toFixed(1)}%(${(SEMIMAX*100).toFixed(1)}% 초과) — 알파가 이진이 아니다`);
  if (LMAX > 0 && r.lonely > LMAX) bad.push(`외톨이 ${(r.lonely*100).toFixed(1)}%(상한 ${(LMAX*100).toFixed(0)}%) — 이 정도면 축소 노이즈다`);
  if (LMIN > 0 && r.lonely < LMIN) bad.push(`외톨이 ${(r.lonely*100).toFixed(1)}%(하한 ${(LMIN*100).toFixed(0)}%) — 과하게 뭉갰다`);
  if (FLATMIN > 0 && r.flat < FLATMIN) bad.push(`평평 ${(r.flat*100).toFixed(1)}%(하한 ${(FLATMIN*100).toFixed(0)}%)`);
  r.bad = bad;
  if (bad.length) fails.push(r);
}

// 팔레트는 **시트 속성**이다 — 프레임마다 거는 게 아니라 파일 전체 합집합으로 본다.
const sheetBad = [];
for (const [f, set] of sheetPalette) {
  if (set.size < CMIN || set.size > CMAX)
    sheetBad.push(`${path.basename(f)}: 시트 팔레트 ${set.size}색 (${CMIN}~${CMAX} 밖)`);
}
const bad = fails.length + sheetBad.length;

const L = [];
L.push('# 도트 계약 판정\n');
L.push(`\`${input}\` · 프레임 ${rows.length}개\n`);
L.push('## [주장]');
L.push(bad ? `판정: **미달** — ${sheetBad.length ? `시트 팔레트 ${sheetBad.length}건 · ` : ''}프레임 ${fails.length}/${rows.length}\n`
           : `판정: **충족** — ${rows.length}개 프레임 · 시트 팔레트 ${[...sheetPalette.values()].map((s2) => s2.size).join('/')}색\n`);
L.push('## [증거]\n```');
L.push('프레임'.padEnd(30) + '색'.padStart(5) + '외톨이'.padStart(9) + '평평'.padStart(8) + '반투명'.padStart(9) + '  판정');
for (const r of rows) {
  L.push(r.name.slice(0, 29).padEnd(30) + String(r.colors).padStart(5)
    + `${(r.lonely*100).toFixed(1)}%`.padStart(9) + `${(r.flat*100).toFixed(1)}%`.padStart(8)
    + `${(r.semi*100).toFixed(1)}%`.padStart(9) + '  ' + (r.bad.length ? '미달' : 'OK'));
}
L.push('```\n');
if (sheetBad.length) { L.push('### 시트 팔레트'); for (const b of sheetBad) L.push(`- ${b}`); L.push(''); }
if (fails.length) {
  L.push('### 어긴 것');
  for (const r of fails) L.push(`- **${r.name}**: ${r.bad.join(' · ')}`);
  L.push('');
}
L.push('## [기준]');
L.push(`**하드 게이트** — 시트 팔레트 ${CMIN}~${CMAX}색 · 반투명 ≤${(SEMIMAX*100).toFixed(1)}% · 외톨이 ≤${(LMAX*100).toFixed(0)}%(극단만)`);
L.push('**참고 대역**(막지 않는다) — 외톨이 6~11% · 평평 11~18%. 상용 픽셀아트 300장의 사분위다.');
L.push('외톨이·평평은 **화풍 지표이지 품질 게이트가 아니다.** 21~26% 인데 게임 크기에서 멀쩡한 실측이 있다 —');
L.push('상한 15% 로 박았다가 멀쩡한 결과를 반려한 적이 있어 극단(35%)만 막는다. **35.8% 대 26% 는 종이 한 장 차이다.**\n');
L.push('## [공백]');
L.push('- **예쁜가는 안 잰다.** 계약을 지켜도 형편없을 수 있다 — 눈으로 봐야 한다.');
L.push('- **캐릭터를 알아볼 수 있는가**는 이 판정 밖이다. `cast-distinct` 가 그 축이다.');
L.push('- 화풍(절제된 면 구성·디테일 밀도)은 수치로 안 잡힌다. 레퍼런스와 나란히 놓고 사람이 본다.');
L.push('- **게임 렌더 크기로 줄여서 봐라.** 원본 배율에서 시끄러워 보여도 실제 크기에서는 멀쩡한 경우가 있다.');
L.push('- 프레임 간 팔레트 공유 여부는 안 본다 — 시트라면 전체 고유색을 따로 확인해라.\n');
L.push('## [잔여 위험]');
L.push(bad ? '- 미달 항목을 고치기 전에는 게임에 넣지 마라.'
                    : '- 계약은 지켰다. 화풍이 나머지 캐스트와 맞는지는 별개 문제다.');

const text = L.join('\n');
console.log(text);
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'pixel-contract.md'), text + '\n');
  fs.writeFileSync(path.join(OUT, 'pixel-contract.json'), JSON.stringify({ rows, fails: fails.length }, null, 2));
  console.log(`\n-> ${OUT}/pixel-contract.md · pixel-contract.json`);
}
process.exit(bad ? 1 : 0);
