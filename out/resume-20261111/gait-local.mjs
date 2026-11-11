// 일회용 측정 하네스 v2 — 버릴 코드다.
//
// v1 에서 배운 것 두 가지를 반영한다.
//  (1) 알파가 없는 원본(100% 불투명)을 넣으면 마스크가 캔버스 전체가 되고 **모든 지표가 0** 이 된다.
//      그 0 은 "결함 없음"이 아니라 "측정 불가"다. 이제 거부한다 — 조용히 0 을 보고하지 않는다.
//  (2) v9 와 v10 이 소수점 3자리까지 같은 값을 냈다. 파일은 서로 다르다(해시 확인).
//      사람이 적은 미달 사유가 "허벅지가 다리 위에 **겹쳐 보인다**" — 실루엣 안쪽 문제다.
//      실루엣만 보는 지표는 구조적으로 이걸 못 본다. 그래서 내부 지표를 추가한다.
//
// 발 지표도 바꿨다. v1 은 하단 띠에서 발 성분 2개를 쪼개 높이차를 쟀는데, 다리가 겹치는
// 프레임에서 성분이 1개로 붙으면 0 을 기록했다 — 가장 정보가 많은 프레임에서 0 을 넣은 것이다.
// v2 는 성분을 안 쪼갠다. **바닥 윤곽선**(열마다 가장 아래 불투명 픽셀)을 쓴다.

import fs from 'node:fs';
import path from 'node:path';
const { readPNG } = await import('file:///C:/00.SVN/game-dev-team_ver04/scripts/lib-png-read.mjs');

const GOGO = 'D:/00.project/GameGogo/out_sanabi_final/sanabi_sprites/기타';
const GDT = 'C:/00.SVN/game-dev-team_ver04';

const SET = [
  { name: 'ref-snb-run',   subject: 'sanabi', label: 'ref', dir: GOGO,
    match: /^기타_Spr_SNB_Running \(lp\) \((\d+)\)\.png$/,            note: '주인공 달리기 루프' },
  { name: 'ref-kangseon',  subject: 'sanabi', label: 'ref', dir: GOGO,
    match: /^기타_Spr_Kangseon_WalkingWithSmoke.*?\((\d+)\)\.png$/,   note: '강선 걷기' },
  { name: 'ref-mari-walk', subject: 'sanabi', label: 'ref', dir: GOGO,
    match: /^기타_Spr_EpilogueMari_WalkingAtHome.*?\((\d+)\)\.png$/,  note: '마리 걷기' },
  { name: 'ref-mecha',     subject: 'sanabi', label: 'ref', dir: GOGO,
    match: /^기타_Spr_MechaMufin_Walking.*?\((\d+)\)\.png$/,          note: '메카 걷기' },

  { name: 'pos-c-alpha', subject: 'silver', label: 'pos',
    dir: `${GDT}/out/experiments/local-motion-20261106/c-alpha`, match: /^frame_(\d+)\.png$/,
    note: '"이정도면 잘나오는듯"' },
  { name: 'pos-ludo26',  subject: 'silver', label: 'pos',
    dir: `${GDT}/out/experiments/gpt-walk-20261106/ludo-silver/cycle26`, match: /(\d+)\.png$/,
    note: '"은발 Ludo 26장 이게 젤 깔끔한데"' },
  { name: 'pos-gpt-b',   subject: 'silver', label: 'pos',
    dir: `${GDT}/out/experiments/gpt-walk-20261106/home-compare/gpt-b`, match: /(\d+)\.png$/,
    note: '"B가 젤 나은데?"' },

  { name: 'neg-rig',   subject: 'silver', label: 'neg',
    dir: `${GDT}/out/experiments/gpt-walk-20261106/rig/frames`, match: /(\d+)\.png$/,
    note: '자동리깅 — "칼과 하체 그림이 휘었다"' },
  { name: 'neg-rigid', subject: 'silver', label: 'neg',
    dir: `${GDT}/out/experiments/gpt-walk-20261106/rigid/frames`, match: /(\d+)\.png$/,
    note: '강체분리 — "파츠 틈과 겹침"' },
  { name: 'neg-v9',    subject: 'fantasy', label: 'neg',
    dir: `${GDT}/out/fantasy-sprite-pilot-v9/frames`, match: /^walk_(\d+)\.png$/,
    note: 'revise — "허벅지가 다리 위에 겹쳐 보인다"' },
  { name: 'neg-v10',   subject: 'fantasy', label: 'neg',
    dir: `${GDT}/out/fantasy-sprite-pilot-v10/frames`, match: /^walk_(\d+)\.png$/,
    note: 'revise — "파츠 방식에서도 겹침"' },
  { name: 'neg-v15',   subject: 'fantasy', label: 'neg',
    dir: `${GDT}/out/fantasy-sprite-pilot-v15/rig-preview/frames`, match: /^walk_(\d+)\.png$/,
    note: 'rejected — "걷기 동작 전체가 성립하지 않는다"' },

  // ── 2차 추가 ────────────────────────────────────────────────────────────
  // 판타지 쪽 **긍정** 걷기. motion-court@1(09:03) 의 "걷기/피격 : 너무 좋음" 이 가리키는 것은
  // 그 직전 버전인 sword-v2@2(08:02) 다. 대상도 파이프라인도 다른 긍정이라 교란을 깬다.
  { name: 'pos-scail2-walk', subject: 'fantasy', label: 'pos',
    dir: `${GDT}/out/sprite-lab/scail2-sword-v2-color-v3`, match: /_(\d+)_\.png$/,
    note: '"걷기/피격 : 너무 좋음"' },

  // 레퍼런스 확장. StumbleWalk 은 **일부러 비틀거리는** 상용 모션이라 역방향 스트레스 테스트다.
  { name: 'ref-stumble',  subject: 'sanabi', label: 'ref', dir: GOGO,
    match: /^기타_Spr_VictimWorker_StumbleWalk.*?\((\d+)\)\.png$/,  note: '비틀거리는 걷기(의도된 것)' },
  { name: 'ref-warrior',  subject: 'sanabi', label: 'ref', dir: GOGO,
    match: /^기타_Spr_EventWarrior_Walk2Mufin.*?\((\d+)\)\.png$/,   note: '전사 걷기' },
  { name: 'ref-walkstart', subject: 'sanabi', label: 'ref', dir: GOGO,
    match: /^기타_Spr_MechaMufin_WalkStart.*?\((\d+)\)\.png$/,      note: '메카 걷기 시작' },
  { name: 'ref-ragewalk', subject: 'sanabi', label: 'ref', dir: GOGO,
    match: /^기타_Spr_Mari_HugDeadMufin2RageWalk.*?\((\d+)\)\.png$/, note: '마리 분노 걷기' },

  // ── held-out: 사람 판정이 아직 없는 것. 분리선에 안 쓰고 분포만 본다. ──────
  { name: 'held-scail2-early', subject: 'fantasy', label: 'held',
    dir: `${GDT}/out/sprite-lab/scail2-fast-alpha`, match: /_(\d+)_\.png$/, note: 'scail2 초기 걷기' },
  { name: 'held-scail2-run',   subject: 'fantasy', label: 'held',
    dir: `${GDT}/out/sprite-lab/action-run-v2-color`, match: /_(\d+)_\.png$/, note: 'scail2 달리기' },
  { name: 'held-rife-walk',    subject: 'silver', label: 'held',
    dir: `${GDT}/out/silver-motion-interpolation/frames`, match: /^frame_(\d+)\.png$/, note: 'RIFE 보간 걷기' },
  { name: 'held-walk-keys',    subject: 'silver', label: 'held',
    dir: `${GDT}/out/silver-walk-keys/frames`, match: /^frame_(\d+)\.png$/, note: '교대 키포즈 걷기' },
];

const A_ON = 128, BINS = 64;

function loadSeq(spec) {
  if (!fs.existsSync(spec.dir)) return { error: '폴더 없음' };
  const files = fs.readdirSync(spec.dir)
    .map((f) => { const m = spec.match.exec(f); return m ? { f, n: Number(m[1]) } : null; })
    .filter(Boolean).sort((a, b) => a.n - b.n).map((o) => path.join(spec.dir, o.f));
  return files.length < 4 ? { error: `프레임 ${files.length}장` } : { files };
}

function analyse(img) {
  const { width: W, height: H, data } = img;
  const m = new Uint8Array(W * H);
  let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0, transparent = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = data[(y * W + x) * 4 + 3];
    if (a < 20) transparent++;
    if (a > A_ON) { m[y * W + x] = 1; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { m, W, H, x0, x1, y0, y1, n, transparentPct: transparent / (W * H) };
}

function components(m, W, H, minPx) {
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H);
  let count = 0;
  for (let p = 0; p < W * H; p++) {
    if (!m[p] || seen[p]) continue;
    let sp = 0; stack[sp++] = p; seen[p] = 1; let n = 0;
    while (sp) { const c = stack[--sp], cx = c % W, cy = (c / W) | 0; n++;
      if (cx > 0 && m[c-1] && !seen[c-1]) { seen[c-1] = 1; stack[sp++] = c-1; }
      if (cx < W-1 && m[c+1] && !seen[c+1]) { seen[c+1] = 1; stack[sp++] = c+1; }
      if (cy > 0 && m[c-W] && !seen[c-W]) { seen[c-W] = 1; stack[sp++] = c-W; }
      if (cy < H-1 && m[c+W] && !seen[c+W]) { seen[c+W] = 1; stack[sp++] = c+W; } }
    if (n >= minPx) count++;
  }
  return count;
}

function erode(m, W, H, k) {
  let cur = m;
  for (let i = 0; i < k; i++) {
    const nx = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (cur[p] && cur[p-1] && cur[p+1] && cur[p-W] && cur[p+W]) nx[p] = 1;
    }
    cur = nx;
  }
  return cur;
}

/** 바닥 윤곽선: 몸 폭을 BINS 칸으로 나눠, 칸마다 가장 아래 불투명 픽셀의 높이(체고 정규화). */
function bottomContour(fr) {
  const bw = fr.x1 - fr.x0 + 1, bh = fr.y1 - fr.y0 + 1;
  const c = new Float64Array(BINS).fill(NaN);
  for (let b = 0; b < BINS; b++) {
    const xa = fr.x0 + Math.floor((b * bw) / BINS), xb = fr.x0 + Math.floor(((b + 1) * bw) / BINS);
    let low = -1;
    for (let x = xa; x < Math.max(xa + 1, xb); x++)
      for (let y = fr.y1; y >= fr.y0; y--) if (fr.m[y * fr.W + x]) { if (y > low) low = y; break; }
    c[b] = low < 0 ? NaN : (fr.y1 - low) / bh;     // 0 = 바닥에 닿음, 클수록 들림
  }
  return c;
}

/** 내부 하드 엣지: 윤곽선을 제외한 안쪽에서 급격한 밝기 단차. 붙여넣은 파츠 경계가 여기 걸린다. */
function interior(fr, img) {
  const inner = erode(fr.m, fr.W, fr.H, 3);
  const { data, width: W } = img;
  const lum = (p) => 0.299 * data[p*4] + 0.587 * data[p*4+1] + 0.114 * data[p*4+2];
  let innerN = 0, hard = 0, bestRun = 0;
  for (let y = 1; y < fr.H - 1; y++) {
    let run = 0;
    for (let x = 1; x < fr.W - 1; x++) {
      const p = y * W + x;
      if (!inner[p]) { run = 0; continue; }
      innerN++;
      const g = Math.max(Math.abs(lum(p) - lum(p - 1)), Math.abs(lum(p) - lum(p - W)));
      if (g > 60) { hard++; run++; if (run > bestRun) bestRun = run; } else run = 0;
    }
  }
  const bh = fr.y1 - fr.y0 + 1;
  return { hardRatio: innerN ? hard / innerN : 0, seamRun: bestRun / bh };
}

const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };

function measure(spec) {
  const { files, error } = loadSeq(spec);
  if (error) return { ...spec, error };

  const raw = files.map((f) => { const im = readPNG(f); return { im, ...analyse(im) }; });

  // ── 가드: 알파가 없으면 측정 불가다. 0 을 보고하지 않는다. ──────────────
  const noAlpha = raw.filter((r) => r.transparentPct < 0.02).length;
  if (noAlpha > raw.length / 2)
    return { ...spec, error: `알파 없음 — ${noAlpha}/${raw.length} 프레임이 전면 불투명 (컷아웃 전 원본)` };

  const frames = raw.filter((r) => r.n > 0 && r.transparentPct >= 0.02);
  if (frames.length < 4) return { ...spec, error: '유효 프레임 부족' };

  const bodyH = med(frames.map((f) => f.y1 - f.y0 + 1));
  const minPx = Math.max(4, Math.round(frames[0].W * frames[0].H * 0.0004));
  const kEro = Math.max(1, Math.round(bodyH * 0.012));

  const contours = frames.map(bottomContour);
  // 칸별 변동폭 = 발이 올라갔다 내려오는 양. 미끄러지면 0 에 가깝다.
  let liftSum = 0, liftCnt = 0;
  for (let b = 0; b < BINS; b++) {
    const v = contours.map((c) => c[b]).filter((x) => !Number.isNaN(x));
    if (v.length >= frames.length * 0.5) { liftSum += Math.max(...v) - Math.min(...v); liftCnt++; }
  }
  const liftRange = liftCnt ? liftSum / liftCnt : NaN;

  let dSum = 0, dCnt = 0;
  for (let i = 1; i < contours.length; i++) {
    let s = 0, n = 0;
    for (let b = 0; b < BINS; b++) {
      const a = contours[i-1][b], c = contours[i][b];
      if (!Number.isNaN(a) && !Number.isNaN(c)) { s += Math.abs(a - c); n++; }
    }
    if (n) { dSum += s / n; dCnt++; }
  }
  const contourDelta = dCnt ? dSum / dCnt : NaN;

  const comps = [], frag = [], hardR = [], seam = [], tops = [], touch = [];
  for (const fr of frames) {
    const c = components(fr.m, fr.W, fr.H, minPx);
    comps.push(c);
    frag.push(Math.max(0, components(erode(fr.m, fr.W, fr.H, kEro), fr.W, fr.H, Math.max(2, minPx >> 2)) - c));
    const it = interior(fr, fr.im);
    hardR.push(it.hardRatio); seam.push(it.seamRun);
    tops.push(fr.y0);
    touch.push(fr.x0 === 0 || fr.y0 === 0 || fr.x1 === fr.W - 1 || fr.y1 === fr.H - 1 ? 1 : 0);
  }

  return { ...spec, frames: frames.length, bodyH,
    liftRange, contourDelta,
    compMax: Math.max(...comps), fragileMax: Math.max(...frag),
    hardRatio: med(hardR), seamMax: Math.max(...seam),
    bobRng: (Math.max(...tops) - Math.min(...tops)) / bodyH,
    touchPct: touch.reduce((a, b) => a + b, 0) / touch.length };
}


export {measure,analyse,SET};
