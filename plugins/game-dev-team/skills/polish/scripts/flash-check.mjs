#!/usr/bin/env node
// flash-check.mjs - 이펙트 시퀀스가 광과민성 발작 위험을 넘는지 판정한다. **안전 게이트.**
//
//   node flash-check.mjs <manifest.json>                     # fx-gen 산출물 전체
//   node flash-check.mjs <프레임폴더> --fps 30 [--loop]
//   node flash-check.mjs <시트.png> --frames 8 --fps 30
//   [--bg "#101010"] [--blend additive|normal] [--out dir]
//
// **이건 취향 문제가 아니라 안전·심의 문제다.** WCAG 2.3.1(Three Flashes or Below Threshold)은
// 1초 안에 3회를 넘는 플래시를 금지하고, 콘솔 플랫폼 심의도 같은 종류를 본다. 광과민성 발작은
// 실제로 사람을 해치므로, 이 판정의 미달은 "느낌이 아쉽다"가 아니라 **출하 차단 사유**다.
//
// 판정 기준 (WCAG 2.3.1 general flash):
//   - **대립 변화(opposing change)**: 상대휘도가 올랐다 내리거나 내렸다 오르는 쌍
//   - 그 변화폭이 **최대 상대휘도의 10% 이상**(= 상대휘도 0.10 이상)
//   - 그리고 **어두운 쪽 상대휘도가 0.80 미만**일 때만 해당(둘 다 밝으면 면제)
//   - 그런 플래시가 **1초 창 안에 3회를 넘으면 미달**
//   - 면제: 플래시 영역이 시야 10도 안에서 25% 이하일 때
//     -> 화면상 크기를 도구가 알 수 없으므로 **영역 비율만 계산해 사람에게 넘긴다**
//   - **적색 플래시**는 더 위험하다(사람이 적색에 더 민감하다). 포화 적색이 관여하면 별도로 경고한다
//
// 이펙트는 보통 **가산 합성(additive)** 이라 배경 위에 얹힌 결과가 실제로 보이는 것이다.
// 그래서 배경을 가정해 합성한 뒤 잰다. 기본값은 어두운 배경(가산 합성에서 가장 대비가 큰 최악 조건).
//
// 한계: 이건 **에셋 단위** 검사다. 실제 화면에서는 여러 이펙트가 겹치고 카메라 흔들림이 더해져
// 더 나빠질 수 있다. 최종 확인은 실기기 녹화 + PEAT 같은 전용 도구로 한다.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { relativeLuminance, parseHex } from '../../../scripts/lib-color.mjs';
import { textTable, pct } from '../../../scripts/lib-stats.mjs';

const args = process.argv.slice(2);
const src = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!src || src.startsWith('--')) {
  console.error('usage: node flash-check.mjs <manifest.json|프레임폴더|시트.png> [옵션]');
  console.error('  --fps 30        프레임 폴더·시트를 줄 때 필수 (manifest 는 자동)');
  console.error('  --frames N      시트를 줄 때 프레임 수');
  console.error('  --loop          반복 재생 (감싸는 전환도 세고, 플래시율이 지속된다)');
  console.error('  --bg "#101010"  합성할 배경색 (기본: 어두운 배경 = 가산 합성 최악 조건)');
  console.error('  --blend         additive | normal (manifest 에 있으면 자동)');
  process.exit(2);
}

// ── WCAG 2.3.1 상수 ──────────────────────────────────────────────────────────
const FLASH_LUM_DELTA = 0.10;   // 최대 상대휘도의 10%
const DARK_CEILING = 0.80;      // 어두운 쪽이 이보다 밝으면 면제
const MAX_FLASHES_PER_SEC = 3;  // 1초 창 안 상한
const AREA_EXEMPT = 0.25;       // 시야 10도 안 25% 이하면 면제 (사람이 화면 크기로 판단)

const BG = parseHex(opt('--bg', '#101010'));
const BG_LUM = relativeLuminance(BG);
const OUT = opt('--out', null);
const notes = [];

// ── 입력 정규화: [{ name, frames:[경로], fps, loop, blend }] ─────────────────
function fromManifest(mfPath) {
  const dir = path.dirname(mfPath);
  const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
  const items = mf.effects || mf.sprites || [];
  const out = [];
  for (const e of items) {
    if (!e.name) continue;
    // fx-gen 은 이펙트별 폴더에 프레임을 낸다
    const frameDir = path.join(dir, e.name);
    let frames = [];
    if (fs.existsSync(frameDir) && fs.statSync(frameDir).isDirectory()) {
      frames = fs.readdirSync(frameDir).filter((f) => /\.png$/i.test(f)).sort()
        .map((f) => path.join(frameDir, f));
    }
    if (!frames.length) { notes.push(`\`${e.name}\`: 프레임 폴더를 못 찾아 건너뛴다 (${path.relative(dir, frameDir)})`); continue; }
    out.push({
      name: e.name,
      frames,
      fps: Number(e.fps) || Number(opt('--fps', 30)),
      loop: e.loop === true || args.includes('--loop'),
      blend: opt('--blend', null) || e.blend || 'normal',
    });
  }
  return out;
}

function fromDir(dir) {
  const frames = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.join(dir, f));
  if (!frames.length) { console.error(`PNG 프레임이 없다: ${dir}`); process.exit(3); }
  const fps = Number(opt('--fps', 0));
  if (!fps) { console.error('프레임 폴더에는 --fps 가 필요하다 (fps 없이는 플래시율을 계산할 수 없다).'); process.exit(3); }
  return [{ name: path.basename(dir), frames, fps, loop: args.includes('--loop'), blend: opt('--blend', 'normal') }];
}

let seqs;
if (/\.json$/i.test(src)) seqs = fromManifest(src);
else if (fs.existsSync(src) && fs.statSync(src).isDirectory()) seqs = fromDir(src);
else if (/\.png$/i.test(src)) {
  const n = Number(opt('--frames', 0));
  const fps = Number(opt('--fps', 0));
  if (!n || !fps) { console.error('시트에는 --frames 와 --fps 가 필요하다.'); process.exit(3); }
  seqs = [{ name: path.basename(src, '.png'), sheet: src, sheetFrames: n, fps, loop: args.includes('--loop'), blend: opt('--blend', 'normal') }];
} else { console.error(`입력을 못 읽었다: ${src}`); process.exit(3); }

if (!seqs.length) { console.error('검사할 시퀀스가 없다.'); process.exit(3); }

// ── 프레임을 배경에 합성해 픽셀 휘도 배열을 만든다 ──────────────────────────
/**
 * 이펙트는 배경 위에 얹혀야 실제로 보이는 것이 된다.
 *   additive: 배경 + 이펙트*alpha (클램프)
 *   normal:   이펙트*alpha + 배경*(1-alpha)
 * 가산 합성은 어두운 배경에서 대비가 가장 커지므로 기본 배경을 어둡게 둔다(최악 조건).
 */
function frameLuminance(img, blend) {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const lum = new Float32Array(n);
  let sum = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const a = data[i + 3] / 255;
    let r, g, b;
    if (blend === 'additive') {
      r = Math.min(1, BG.r + (data[i] / 255) * a);
      g = Math.min(1, BG.g + (data[i + 1] / 255) * a);
      b = Math.min(1, BG.b + (data[i + 2] / 255) * a);
    } else {
      r = (data[i] / 255) * a + BG.r * (1 - a);
      g = (data[i + 1] / 255) * a + BG.g * (1 - a);
      b = (data[i + 2] / 255) * a + BG.b * (1 - a);
    }
    const L = relativeLuminance({ r, g, b });
    lum[p] = L;
    sum += L;
  }
  return { lum, mean: sum / n, w, h };
}

/** 포화 적색 관여 여부 — 적색 플래시는 별도로 더 위험하다. */
function redPresence(img) {
  const { data } = img;
  let red = 0, lit = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 32) continue;
    lit++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // 포화 적색: R 이 우세하고 채도가 높다
    if (r > 120 && r - Math.max(g, b) > 60) red++;
  }
  return lit ? red / lit : 0;
}

function loadFrames(seq) {
  if (seq.sheet) {
    // 가로 스트립을 균등 분할한다
    const img = readPNG(seq.sheet);
    const n = seq.sheetFrames;
    const fw = Math.floor(img.width / n);
    const out = [];
    for (let k = 0; k < n; k++) {
      const buf = Buffer.alloc(fw * img.height * 4);
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < fw; x++) {
          const s = (y * img.width + (k * fw + x)) * 4;
          const d = (y * fw + x) * 4;
          buf[d] = img.data[s]; buf[d + 1] = img.data[s + 1];
          buf[d + 2] = img.data[s + 2]; buf[d + 3] = img.data[s + 3];
        }
      }
      out.push({ width: fw, height: img.height, data: buf });
    }
    return out;
  }
  return seq.frames.map((f) => readPNG(f));
}

// ── 플래시 판정 ──────────────────────────────────────────────────────────────
function analyze(seq) {
  const imgs = loadFrames(seq);
  const per = imgs.map((im) => frameLuminance(im, seq.blend));
  const means = per.map((p) => p.mean);
  const reds = imgs.map(redPresence);
  const N = means.length;

  // 극점 찾기 — 대립 변화의 경계다. 루프면 감싸서 본다.
  const idx = (k) => (seq.loop ? (k + N) % N : Math.max(0, Math.min(N - 1, k)));
  const extrema = [];
  const span = seq.loop ? N : N - 1;
  for (let k = 0; k < (seq.loop ? N : N); k++) {
    if (!seq.loop && (k === 0 || k === N - 1)) { extrema.push(k); continue; }
    const prev = means[idx(k - 1)], cur = means[k], next = means[idx(k + 1)];
    if ((cur >= prev && cur >= next) || (cur <= prev && cur <= next)) extrema.push(k);
  }

  // 연속 극점 쌍이 임계를 넘으면 플래시 1회 (WCAG: 대립 변화 쌍)
  //
  // **판정은 프레임 평균이 아니라 "깜빡이는 영역"으로 한다.** 평균으로 하면 작지만 강한
  // 플래시가 희석돼 안 잡힌다 — 실측: 면적 5% 짜리 28회/초 스트로브가 평균 변화 0.05 로
  // 임계(0.10) 아래라 "충족"으로 나왔다. 그건 틀린 답이다.
  // WCAG 는 면적을 **별도 면제 조항**(시야 10도 안 25% 이하)으로 다루므로,
  // 여기서는 (1) 어느 영역이든 임계를 넘게 깜빡이면 플래시로 세고
  //          (2) 면적은 면제 판단용으로 따로 보고한다.
  const AREA_NOISE_FLOOR = 0.01;   // 1% 미만은 노이즈로 본다(안티에일리어싱 등)
  const flashes = [];
  for (let e = 0; e < extrema.length - 1; e++) {
    const a = extrema[e], b = extrema[e + 1];
    const A = per[a].lum, B = per[b].lum;
    // 이 전환에서 "플래시 조건을 만족하는" 픽셀 비율 —
    // 휘도 변화폭 >= 0.10 이고 어두운 쪽 < 0.80
    let changed = 0;
    for (let p = 0; p < A.length; p++) {
      if (Math.abs(B[p] - A[p]) >= FLASH_LUM_DELTA && Math.min(A[p], B[p]) < DARK_CEILING) changed++;
    }
    const area = changed / A.length;
    if (area >= AREA_NOISE_FLOOR) {
      flashes.push({
        from: a, to: b,
        delta: Math.abs(means[b] - means[a]),
        darker: Math.min(means[a], means[b]),
        area,
        red: Math.max(reds[a], reds[b]),
        t: b / seq.fps,
      });
    }
  }

  // 1초 슬라이딩 창에서 최대 플래시 수 (WCAG: "any one-second period")
  let maxPerSec = 0;
  let worstWindow = null;
  const duration = N / seq.fps;
  for (const f of flashes) {
    const t0 = f.t;
    const inWin = flashes.filter((g) => g.t >= t0 && g.t < t0 + 1);
    if (inWin.length > maxPerSec) { maxPerSec = inWin.length; worstWindow = t0; }
  }
  // 루프면 1초보다 짧은 시퀀스가 반복되므로 실효 플래시율이 올라간다
  let effectivePerSec = maxPerSec;
  if (seq.loop && duration > 0 && duration < 1) {
    effectivePerSec = Math.round(flashes.length / duration);
    notes.push(`\`${seq.name}\`: 루프이고 길이가 ${duration.toFixed(2)}초라 **반복으로 플래시율이 올라간다** — 실효 ${effectivePerSec}회/초로 계산했다`);
  }

  const maxArea = flashes.reduce((m, f) => Math.max(m, f.area), 0);
  const maxRed = flashes.reduce((m, f) => Math.max(m, f.red), 0);

  const overRate = effectivePerSec > MAX_FLASHES_PER_SEC;
  const areaExempt = maxArea <= AREA_EXEMPT;
  const status = !overRate ? '충족'
    : areaExempt ? '조건부'   // 초과했지만 영역이 작다 — 화면 크기에 따라 면제될 수 있다
      : '미달';

  return {
    name: seq.name, frames: N, fps: seq.fps, loop: seq.loop, blend: seq.blend,
    duration, means, flashes, perSec: effectivePerSec, worstWindow,
    maxArea, maxRed, status, overRate, areaExempt,
  };
}

const results = seqs.map(analyze);
const fails = results.filter((r) => r.status === '미달');
const conds = results.filter((r) => r.status === '조건부');
const verdict = fails.length ? '미달' : conds.length ? '조건부' : '충족';

// ── 리포트 ───────────────────────────────────────────────────────────────────
const L = [];
L.push('', '# 광과민성 플래시 안전 판정 (WCAG 2.3.1)', '');
L.push(`시퀀스 ${results.length}개 · 배경 \`${opt('--bg', '#101010')}\`(휘도 ${BG_LUM.toFixed(3)}) · 상한 ${MAX_FLASHES_PER_SEC}회/초`);
L.push('');
L.push('## [주장]');
L.push(`판정: **${verdict}**` +
  (fails.length ? ` — 상한 초과 ${fails.length}건` : '') +
  (conds.length ? `${fails.length ? ' · ' : ' — '}조건부 ${conds.length}건(영역이 작아 화면 크기에 따라 면제 가능)` : ''));
L.push('');
if (fails.length) {
  L.push('> **이건 취향이 아니라 안전 문제다.** 광과민성 발작은 실제로 사람을 해치고,');
  L.push('> 콘솔 플랫폼 심의도 같은 종류를 본다. 미달은 출하 차단 사유로 다뤄라.');
  L.push('> 고치는 방법: 플래시 횟수를 줄이거나 · 휘도 변화폭을 0.10 미만으로 낮추거나 ·');
  L.push('> 영역을 줄이거나 · **모션 감소 설정에서 이 이펙트를 끈다.**');
  L.push('');
}

L.push('## [증거]', '```');
L.push(textTable(
  ['이펙트', '프레임', 'fps', '길이(초)', '루프', '합성', '플래시', '회/초', '최대영역', '적색', '판정'],
  results.map((r) => [
    r.name, r.frames, r.fps, r.duration.toFixed(2), r.loop ? 'O' : '', r.blend,
    r.flashes.length, r.perSec, pct(r.maxArea), pct(r.maxRed), r.status,
  ]),
));
L.push('```');
L.push(`> 플래시 = 상대휘도 대립 변화 ${FLASH_LUM_DELTA} 이상 + 어두운 쪽 ${DARK_CEILING} 미만 (WCAG general flash)`);
L.push(`> 최대영역 = 그 전환에서 휘도가 임계 이상 바뀐 픽셀 비율. **${pct(AREA_EXEMPT)} 이하면 면제 가능**하지만`);
L.push('> 그 판단은 시야 10도 기준이라 **화면상 크기를 아는 사람이 해야 한다.**');
L.push('');

for (const r of results.filter((x) => x.flashes.length)) {
  L.push(`### ${r.name} — ${r.status}`);
  L.push('```');
  L.push(textTable(
    ['전환', '휘도', '변화폭', '어두운쪽', '영역', '적색', '시각(초)'],
    r.flashes.slice(0, 12).map((f) => [
      `f${f.from}->f${f.to}`,
      `${r.means[f.from].toFixed(3)}->${r.means[f.to].toFixed(3)}`,
      f.delta.toFixed(3), f.darker.toFixed(3), pct(f.area), pct(f.red), f.t.toFixed(2),
    ]),
  ));
  L.push('```');
  if (r.maxRed > 0.3) {
    L.push(`> **포화 적색이 ${pct(r.maxRed)} 관여한다.** 사람은 적색 플래시에 더 민감해서 WCAG 는`);
    L.push('> 적색 플래시를 별도 기준으로 다룬다. 이 도구의 적색 판정은 근사이므로,');
    L.push('> 이 이펙트는 **전용 도구(PEAT 등)나 실기기 녹화로 다시 확인해라.**');
  }
  L.push('');
}

L.push('## [기준]');
L.push('WCAG 2.3.1 Three Flashes or Below Threshold (Level A) — general flash 정의:');
L.push(`상대휘도 대립 변화가 최대치의 10% 이상이고 어두운 쪽이 0.80 미만일 때 플래시로 세며,`);
L.push('1초 안에 3회를 넘으면 위반. 영역이 시야 10도 안 25% 이하면 면제.');
L.push('');

L.push('## [공백]');
for (const n of notes) L.push(`- ${n}`);
L.push('- **에셋 단위 검사다.** 실제 화면에서는 여러 이펙트가 겹치고 카메라 흔들림·화면 전환이');
L.push('  더해져 더 나빠질 수 있다. 최종 확인은 **실기기 녹화 + 전용 도구(PEAT)**로 한다.');
L.push('- 배경을 가정해 합성했다. 실제 배경이 밝으면 가산 합성의 대비가 줄어 결과가 달라진다 —');
L.push(`  \`--bg\` 로 실제 배경을 넣어 다시 돌려라(현재 \`${opt('--bg', '#101010')}\`).`);
L.push('- **적색 플래시 판정은 근사다.** WCAG 의 정식 적색 측정은 별도 계산을 요구한다.');
L.push('- 시야 10도 대비 25% 면제는 **화면상 표시 크기를 알아야** 판단된다 — 영역 비율만 냈다.');
L.push('- 이펙트 밖의 플래시원(화면 전환, 피격 시 전체 화면 flash, 번개 배경)은 검사하지 않았다.');
L.push('');
L.push('## [잔여 위험]');
L.push('- (통과했어도 남는 위험을 여기 적는다. 특히 여러 이펙트 동시 재생.)');
L.push('');

const report = L.join('\n');
console.log(report);

if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'flash-report.md'), report);
  fs.writeFileSync(path.join(OUT, 'flash.json'), JSON.stringify({
    verdict, bg: opt('--bg', '#101010'), thresholds: { FLASH_LUM_DELTA, DARK_CEILING, MAX_FLASHES_PER_SEC, AREA_EXEMPT },
    results: results.map(({ means, ...r }) => r),
  }, null, 2));
  console.log(`-> ${OUT}/flash-report.md · flash.json`);
}

if (verdict === '미달') process.exit(1);
