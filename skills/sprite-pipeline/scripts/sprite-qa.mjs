#!/usr/bin/env node
// sprite-qa.mjs - 프레임 시퀀스의 정합성을 판정한다.
//
//   node sprite-qa.mjs <프레임폴더> [--atlas atlas.json] [--aerial] [--out dir]
//   node sprite-qa.mjs <시트.png> --frames 8 [옵션]
//
// 왜 이게 필요한가: 이 스킬에는 **만드는 도구는 있고 판정하는 도구가 없었다.**
// `sprite-normalize` 는 규격을 통일하고 `atlas-pack` 은 점유율을 출력하지만, 둘 다
// "이게 괜찮은가"를 판정하지 않는다. SKILL.md 의 QA 체크리스트 5줄이 산문으로만 있었다.
// 그 체크리스트 중 기계가 판정할 수 있는 4개를 여기서 판정한다(타이밍은 `polish` 소관).
//
// 판정하는 것:
//   1) 캔버스 정합    — 프레임마다 크기가 다르면 엔진에서 정렬이 깨진다
//   2) 떨림(jitter)   — **2차 차분으로 "의도된 이동"과 "떨림"을 구분한다**
//   3) 정체성 드리프트 — 프레임 간 색 분포가 달라지면 캐릭터가 바뀐 것이다(이 스킬의 1번 위험)
//   4) 알파 품질      — 고아 섬(떠 있는 점) · 구멍 · 프린지
//   5) 축소 판독성    — 50% 축소에서 실루엣 대비가 남는가
//   6) 아틀라스 점유율 — (--atlas 를 주면) 낭비되는 텍스처 메모리
//
// 판정하지 않는 것: **애니메이션 타이밍·타격 프레임**(`polish` 의 `feel-audit`),
// 그림이 좋은지(사람), 화면에서의 겹침(`visual-qa`).

import fs from 'node:fs';
import path from 'node:path';
import { readPNG, rgb2hsv } from '../../../scripts/lib-png-read.mjs';
import { toLab } from '../../../scripts/lib-color.mjs';
import { textTable, pct, mean, quantile } from '../../../scripts/lib-stats.mjs';

const args = process.argv.slice(2);
const src = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!src || src.startsWith('--')) {
  console.error('usage: node sprite-qa.mjs <프레임폴더|시트.png> [옵션]');
  console.error('  --frames N     시트를 줄 때 프레임 수');
  console.error('  --atlas a.json atlas-pack 이 낸 json — 점유율을 함께 판정한다');
  console.error('  --aerial       점프·공중 동작. baseline 이동을 정상으로 본다');
  console.error('  --out dir      리포트 저장');
  process.exit(2);
}
const OUT = opt('--out', null);
const AERIAL = args.includes('--aerial');

// ── 기준값 ───────────────────────────────────────────────────────────────────
const T = {
  // 떨림 판정은 **두 가지를 같이 본다.** 하나만으로는 못 가른다(실측으로 확인했다):
  //
  //   (1) 절대 격렬함 — 2차 차분 / 스프라이트 최소변. 스케일 무관하게 "얼마나 튀나".
  //       절대 px 로 재면 안 된다: 진폭 3px 걷기 사이클도 2차 차분이 1.9px 나온다(정상).
  //       48px 스프라이트에서 17.7px 는 37% — 이건 격렬한 것이고, 4% 는 부드러운 것이다.
  //   (2) 이상치 배수 — 최대/중위. 전체는 부드러운데 **한 프레임만** 튀는 경우를 잡는다.
  //
  // (1)만 보면 전체가 빠르게 움직이는 동작을 오탐하고, (2)만 보면 결함이 2개 이상일 때
  // 중위값이 올라가 서로를 가린다(실측: 결함 2개 시 배수 2.19 로 임계 미달).
  jitterViolentRatio: Number(opt('--jitter', 0.08)),  // 2차 차분 / 최소변 상한
  jitterOutlier: 2.5,                                 // 최대/중위 배수 상한
  jitterFloorPx: 1.0,                                 // 이 미만은 정지 스프라이트의 잡음
  baselineSpreadRatio: 0.04,                     // baseline 산포 / 높이. 지상 동작 기준
  driftMax: Number(opt('--drift', 0.18)),        // 색 분포 비유사도 상한 (0=동일)
  shapeMin: Number(opt('--shape', 0.5)),         // 실루엣 IoU 하한 (1=동일). 동작하면 당연히 내려가므로 느슨하게 둔다
  strayRatio: 0.05,                              // 최대 덩어리 대비 이 미만은 고아 섬 후보
  holeRatio: 0.002,                              // 피사체 내부 구멍 허용 비율
  fringeRatio: Number(opt('--fringe', 0.22)),    // 반투명 픽셀 / 경계 픽셀 상한
  smallContrastMin: Number(opt('--small', 0.045)), // 50% 축소 실루엣 대비 하한
  atlasFillMin: Number(opt('--atlas-fill', 0.55)), // 아틀라스 점유율 하한
};

// ── 프레임 로드 ──────────────────────────────────────────────────────────────
function loadFrames() {
  if (/\.png$/i.test(src) && fs.existsSync(src) && fs.statSync(src).isFile()) {
    const n = Number(opt('--frames', 0));
    if (!n) { console.error('시트에는 --frames 가 필요하다.'); process.exit(3); }
    const img = readPNG(src);
    const fw = Math.floor(img.width / n);
    const out = [];
    for (let k = 0; k < n; k++) {
      const buf = Buffer.alloc(fw * img.height * 4);
      for (let y = 0; y < img.height; y++) for (let x = 0; x < fw; x++) {
        const s = (y * img.width + (k * fw + x)) * 4, d = (y * fw + x) * 4;
        buf[d] = img.data[s]; buf[d + 1] = img.data[s + 1];
        buf[d + 2] = img.data[s + 2]; buf[d + 3] = img.data[s + 3];
      }
      out.push({ name: `f${k}`, width: fw, height: img.height, data: buf });
    }
    return out;
  }
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    console.error(`읽을 수 없다: ${src}`); process.exit(3);
  }
  const files = fs.readdirSync(src).filter((f) => /\.png$/i.test(f)).sort();
  if (!files.length) { console.error(`PNG 프레임이 없다: ${src}`); process.exit(3); }
  return files.map((f) => {
    const im = readPNG(path.join(src, f));
    return { name: f, width: im.width, height: im.height, data: im.data };
  });
}

const frames = loadFrames();
if (frames.length < 2) { console.error('프레임이 2장 미만이라 정합성을 판정할 수 없다.'); process.exit(3); }

// ── 프레임별 측정 ────────────────────────────────────────────────────────────
const HIST_BINS = 6;   // Lab 각 축 6분할 = 216빈. 의상·색 변화를 잡기엔 충분하다

function measure(fr) {
  const { width: w, height: h, data } = fr;
  const n = w * h;
  const opaque = new Uint8Array(n);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let sx = 0, sy = 0, sa = 0, opq = 0, semi = 0;
  const hist = new Float64Array(HIST_BINS ** 3);
  let histTotal = 0;

  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const a = data[i + 3];
    if (a >= 128) { opaque[p] = 1; opq++; } else if (a > 0) semi++;
    if (a === 0) continue;
    const x = p % w, y = (p - x) / w;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    sx += x * a; sy += y * a; sa += a;
    if (a >= 200) {
      // 색 분포는 **불투명 픽셀만** 센다. 반투명 경계는 배경색이 섞여 드리프트를 왜곡한다.
      const lab = toLab({ r: data[i] / 255, g: data[i + 1] / 255, b: data[i + 2] / 255 });
      const bl = Math.min(HIST_BINS - 1, Math.floor((lab.L / 100) * HIST_BINS));
      const ba = Math.min(HIST_BINS - 1, Math.floor(((lab.a + 128) / 256) * HIST_BINS));
      const bb = Math.min(HIST_BINS - 1, Math.floor(((lab.b + 128) / 256) * HIST_BINS));
      hist[(bl * HIST_BINS + ba) * HIST_BINS + bb]++;
      histTotal++;
    }
  }
  if (histTotal) for (let i = 0; i < hist.length; i++) hist[i] /= histTotal;

  // 연결 성분 — 고아 섬(떠 있는 점) 탐지
  const seen = new Uint8Array(n);
  const st = new Int32Array(n);
  const blobs = [];
  for (let p0 = 0; p0 < n; p0++) {
    if (!opaque[p0] || seen[p0]) continue;
    let sp = 0, area = 0;
    st[sp++] = p0; seen[p0] = 1;
    while (sp > 0) {
      const p = st[--sp]; area++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && opaque[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; st[sp++] = p - 1; }
      if (x < w - 1 && opaque[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; st[sp++] = p + 1; }
      if (y > 0 && opaque[p - w] && !seen[p - w]) { seen[p - w] = 1; st[sp++] = p - w; }
      if (y < h - 1 && opaque[p + w] && !seen[p + w]) { seen[p + w] = 1; st[sp++] = p + w; }
    }
    blobs.push(area);
  }
  blobs.sort((a, b) => b - a);
  const stray = blobs.slice(1).filter((b) => b >= 2 && b < (blobs[0] || 1) * T.strayRatio).length;

  // 구멍 — 테두리에서 닿지 않는 완전 투명 픽셀
  const reach = new Uint8Array(n);
  let sp2 = 0;
  const push = (p) => { if (!reach[p] && !opaque[p]) { reach[p] = 1; st[sp2++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp2 > 0) {
    const p = st[--sp2];
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }
  let holes = 0;
  for (let p = 0; p < n; p++) if (!opaque[p] && !reach[p] && data[p * 4 + 3] < 128) holes++;

  // 경계 픽셀 대비 반투명 비율 — 프린지(경계 번짐) 지표
  let edge = 0;
  for (let p = 0; p < n; p++) {
    if (!opaque[p]) continue;
    const x = p % w, y = (p - x) / w;
    if ((x > 0 && !opaque[p - 1]) || (x < w - 1 && !opaque[p + 1]) ||
        (y > 0 && !opaque[p - w]) || (y < h - 1 && !opaque[p + w])) edge++;
  }

  // 50% 축소 실루엣 대비 — 박스 필터로 줄인 뒤 알파 격자의 표준편차
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
  const small = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    let s = 0, c = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const yy = y * 2 + dy, xx = x * 2 + dx;
      if (yy >= h || xx >= w) continue;
      s += data[(yy * w + xx) * 4 + 3] / 255; c++;
    }
    small[y * hw + x] = c ? s / c : 0;
  }
  // 실루엣 마스크 — 형태 비교용. 64x64 로 줄여 보관한다(IoU 계산은 정렬된 저해상도로 충분하다).
  // bbox 기준으로 정규화해 담는다 — 캐릭터 위치가 달라도 형태만 비교하려면 그래야 한다.
  const silW = 64, silH = 64;
  const sil = new Uint8Array(silW * silH);
  if (maxX >= 0) {
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    for (let y = 0; y < silH; y++) for (let x = 0; x < silW; x++) {
      const sxp = minX + Math.floor((x + 0.5) * bw / silW);
      const syp = minY + Math.floor((y + 0.5) * bh / silH);
      if (sxp < w && syp < h && data[(syp * w + sxp) * 4 + 3] >= 128) sil[y * silW + x] = 1;
    }
  }

  const sm = mean([...small]);
  let v = 0;
  for (const s of small) v += (s - sm) ** 2;
  const smallContrast = Math.sqrt(v / small.length);

  return {
    name: fr.name, w, h,
    bbox: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, bottom: maxY },
    cx: sa ? sx / sa : 0, cy: sa ? sy / sa : 0,
    opq, semi, edge, holes, stray, blobs: blobs.length,
    fringe: edge ? semi / edge : 0,
    holeRatio: opq ? holes / opq : 0,
    hist, smallContrast, sil, silW, silH,
  };
}

const M = frames.map(measure);
const empty = M.filter((m) => !m.bbox).map((m) => m.name);

const fails = [];
const warns = [];

// ── 1) 캔버스 정합 ──────────────────────────────────────────────────────────
const sizes = new Set(M.map((m) => `${m.w}x${m.h}`));
if (sizes.size > 1) {
  fails.push({ kind: '캔버스', where: '전체', msg: `프레임 캔버스가 ${sizes.size}종 섞여 있다 (${[...sizes].join(', ')}) — 엔진에서 정렬이 깨진다. \`sprite-normalize\` 로 통일해라` });
}
if (empty.length) {
  fails.push({ kind: '빈 프레임', where: empty.join(', '), msg: '알파가 전부 0이다 — 컷아웃이 피사체를 먹었거나 빈 프레임이 섞였다' });
}

// ── 2) 떨림 — 2차 차분으로 의도된 이동과 구분 ───────────────────────────────
// 1차 차분(속도)이 크다고 떨림이 아니다. 걷기·돌진은 원래 움직인다.
// **2차 차분(가속)이 프레임마다 부호를 바꾸며 크게 튀는 게 떨림**이다.
const valid = M.filter((m) => m.bbox);
const jitterRows = [];
if (valid.length >= 3) {
  for (let i = 1; i < valid.length - 1; i++) {
    const d2x = valid[i + 1].cx - 2 * valid[i].cx + valid[i - 1].cx;
    const d2y = valid[i + 1].cy - 2 * valid[i].cy + valid[i - 1].cy;
    const mag = Math.hypot(d2x, d2y);
    jitterRows.push({ name: valid[i].name, mag });
  }
  const worst = jitterRows.reduce((a, b) => (b.mag > a.mag ? b : a), jitterRows[0]);
  const medJit = quantile(jitterRows.map((r) => r.mag), 0.5);
  const minSide = Math.min(valid[0].w, valid[0].h) || 1;
  const violent = worst.mag / minSide;
  // 중위가 0에 가까운 정지 스프라이트에서 무한대가 되지 않게 바닥을 둔다.
  const outlier = worst.mag / Math.max(medJit, T.jitterFloorPx);

  if (worst.mag > T.jitterFloorPx && violent > T.jitterViolentRatio) {
    warns.push({
      kind: '떨림', where: worst.name,
      msg: `무게중심 2차 차분 ${worst.mag.toFixed(2)}px = 스프라이트 최소변(${minSide}px)의 ${pct(violent)} > 허용 ${pct(T.jitterViolentRatio)} — 프레임 간 움직임이 격렬하다. 정규화를 다시 하거나 그 프레임을 다시 뽑아라`,
    });
  } else if (worst.mag > T.jitterFloorPx && outlier > T.jitterOutlier) {
    warns.push({
      kind: '떨림', where: worst.name,
      msg: `무게중심 2차 차분 ${worst.mag.toFixed(2)}px = 중위(${medJit.toFixed(2)}px)의 ${outlier.toFixed(1)}배 > 허용 ${T.jitterOutlier}배 — 전체는 부드러운데 **이 프레임만** 튄다`,
    });
  }
}

// ── 3) baseline 정렬 ────────────────────────────────────────────────────────
if (valid.length >= 2) {
  const bottoms = valid.map((m) => m.bbox.bottom);
  const spread = Math.max(...bottoms) - Math.min(...bottoms);
  const ratio = spread / (valid[0].h || 1);
  if (ratio > T.baselineSpreadRatio) {
    if (AERIAL) {
      warns.push({ kind: 'baseline', where: '전체', msg: `발 위치 산포 ${spread}px(${pct(ratio)}) — 공중 동작(--aerial)이라 정상으로 본다. 지상 동작이면 이 플래그를 빼고 다시 돌려라` });
    } else {
      warns.push({ kind: 'baseline', where: '전체', msg: `발 위치 산포 ${spread}px(${pct(ratio)}) > 허용 ${pct(T.baselineSpreadRatio)} — 지상 동작이면 캐릭터가 위아래로 뜬다. 점프·공중 동작이면 \`--aerial\` 을 줘라` });
    }
  }
}

// ── 4) 정체성 드리프트 ──────────────────────────────────────────────────────
// 색 분포(Lab 히스토그램)를 프레임 간 비교한다. 중위 프레임을 기준으로 삼아
// 한 프레임만 이상한 경우와 전체가 서서히 변하는 경우를 둘 다 잡는다.
function cosSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
/** 두 실루엣 마스크의 IoU. bbox 정규화된 같은 크기 마스크를 전제로 한다. */
function iou(a, b) {
  if (!a || !b) return 1;
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x && y) inter++; if (x || y) uni++; }
  return uni ? inter / uni : 1;
}
const driftRows = [];
if (valid.length >= 2) {
  // 기준 = 모든 프레임과의 평균 유사도가 가장 높은 프레임(대표 프레임)
  const simMat = valid.map((a) => valid.map((b) => cosSim(a.hist, b.hist)));
  const avgSim = simMat.map((row) => mean(row));
  const refIdx = avgSim.indexOf(Math.max(...avgSim));
  for (let i = 0; i < valid.length; i++) {
    driftRows.push({ name: valid[i].name, drift: 1 - simMat[refIdx][i], ref: i === refIdx });
  }
  const bad = driftRows.filter((r) => r.drift > T.driftMax);
  if (bad.length) {
    fails.push({
      kind: '정체성(색)', where: bad.map((r) => r.name).join(', '),
      msg: `색 분포가 대표 프레임(${valid[refIdx].name})에서 ${bad.map((r) => r.drift.toFixed(2)).join(', ')} 벗어났다 (상한 ${T.driftMax}) — 프레임마다 캐릭터가 달라 보인다. seed 프레임에서 시트로 다시 뽑아라`,
    });
  }

  // ── 형태 드리프트 — 색 분포로는 **못 잡는** 붕괴가 있다.
  // 실측(2026-09-08): 영상 모델 시퀀스에서 캐릭터가 파편으로 흩어졌는데 색 구성이 그대로라
  // 색 드리프트가 통과했다. 실루엣 IoU 로 형태를 따로 본다.
  //
  // 주의: 동작하는 스프라이트는 실루엣이 **당연히** 바뀐다(팔다리가 움직인다). 그래서 임계가 느슨하다 —
  // 정상 걷기에서 IoU 0.75~0.90, 붕괴에서 0.5 밑으로 떨어진다(실측). 여기서 잡는 건 "알아볼 수 없게 된 것"이다.
  for (let i = 0; i < valid.length; i++) {
    driftRows[i].shape = iou(valid[refIdx].sil, valid[i].sil);
  }
  const badShape = driftRows.filter((r) => r.shape < T.shapeMin);
  if (badShape.length) {
    fails.push({
      kind: '정체성(형태)', where: badShape.map((r) => r.name).join(', '),
      msg: `실루엣이 대표 프레임(${valid[refIdx].name})과 겹치는 비율(IoU)이 ${badShape.map((r) => r.shape.toFixed(2)).join(', ')} 뿐이다 (하한 ${T.shapeMin}) — 형태가 무너져 같은 캐릭터로 안 보인다. 색은 같아도 실루엣이 깨진 경우다(생성 시퀀스에서 흔하다)`,
    });
  }
}

// ── 5) 알파 품질 ────────────────────────────────────────────────────────────
// 고아 섬은 **경고다.** 떨어진 덩어리가 의도적일 수 있다 — 던진 무기, 떠 있는 장식,
// 잔상 이펙트. 미달로 잡으면 그런 스프라이트가 전부 반려되고, 게이트에서 오탐은
// 없는 것보다 나쁘다(한 번 틀리면 아무도 안 믿는다).
const strayFrames = valid.filter((m) => m.stray > 0);
if (strayFrames.length) {
  warns.push({
    kind: '고아 섬', where: strayFrames.map((m) => `${m.name}(${m.stray})`).join(', '),
    msg: '피사체와 떨어진 작은 덩어리가 있다 — 컷아웃 잔여물이면 아틀라스 여백을 먹고 화면에 티가 난다(`cutout` 재실행). **의도한 분리 파츠**(던진 무기·떠 있는 장식)면 정상이다',
  });
}
const holed = valid.filter((m) => m.holeRatio > T.holeRatio);
if (holed.length) {
  warns.push({ kind: '구멍', where: holed.map((m) => `${m.name}(${pct(m.holeRatio)})`).join(', '), msg: `피사체 내부가 뚫렸다 (허용 ${pct(T.holeRatio)}) — 컷아웃 tol 을 내려라` });
}
const fringed = valid.filter((m) => m.fringe > T.fringeRatio);
if (fringed.length) {
  warns.push({ kind: '프린지', where: fringed.map((m) => `${m.name}(${pct(m.fringe)})`).join(', '), msg: `경계 대비 반투명 비율이 높다 (허용 ${pct(T.fringeRatio)}) — 배경색이 번져 있을 수 있다. 크로마키 배경이면 \`cutout --chroma\` 를 써라` });
}

// ── 6) 축소 판독성 ──────────────────────────────────────────────────────────
const dim = valid.filter((m) => m.smallContrast < T.smallContrastMin);
if (dim.length) {
  warns.push({ kind: '축소 판독성', where: dim.map((m) => `${m.name}(${m.smallContrast.toFixed(3)})`).join(', '), msg: `50% 축소 실루엣 대비가 ${T.smallContrastMin} 미만 — 게임 크기에서 형태가 안 읽힌다. 실루엣을 단순화하거나 외곽선을 넣어라` });
}

// ── 7) 아틀라스 점유율 ─────────────────────────────────────────────────────
let atlas = null;
const atlasPath = opt('--atlas', null);
if (atlasPath) {
  try {
    const a = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
    const W = a.width || a.size?.w, H = a.height || a.size?.h;
    const sprites = a.sprites || a.frames || [];
    if (W && H && sprites.length) {
      const used = sprites.reduce((s, x) => s + (x.w || x.width || 0) * (x.h || x.height || 0), 0);
      const fill = used / (W * H);
      atlas = { W, H, count: sprites.length, fill };
      if (fill < T.atlasFillMin) {
        fails.push({ kind: '아틀라스', where: path.basename(atlasPath), msg: `점유율 ${pct(fill)} < 하한 ${pct(T.atlasFillMin)} — ${W}x${H} 중 ${pct(1 - fill)} 가 낭비된다. \`atlas-pack --trim\` 을 쓰거나 --max 를 줄여라` });
      }
    }
  } catch (e) { warns.push({ kind: '아틀라스', where: atlasPath, msg: `읽기 실패: ${e.message}` }); }
}

// ── 판정 ────────────────────────────────────────────────────────────────────
const verdict = fails.length ? '미달' : '충족';

const L = [];
L.push('', '# 스프라이트 정합성 판정', '');
L.push(`\`${src}\` · 프레임 ${frames.length}장` + (AERIAL ? ' · 공중 동작' : '') + (atlas ? ` · 아틀라스 ${atlas.W}x${atlas.H}` : ''));
L.push('');
L.push('## [주장]');
L.push(`판정: **${verdict}**` + (fails.length ? ` — 미달 ${fails.length}건` : '') + (warns.length ? ` · 경고 ${warns.length}건` : ''));
L.push('');

if (fails.length) {
  L.push('## [미달] 엔진·화면에서 실제로 깨지는 것', '');
  L.push('| 종류 | 위치 | 내용 |', '|---|---|---|');
  for (const f of fails) L.push(`| **${f.kind}** | \`${f.where}\` | ${f.msg} |`);
  L.push('');
}
if (warns.length) {
  L.push('## [경고] 확인이 필요한 것', '');
  L.push('| 종류 | 위치 | 내용 |', '|---|---|---|');
  for (const w of warns) L.push(`| ${w.kind} | \`${w.where}\` | ${w.msg} |`);
  L.push('');
  L.push('> 경고는 게이트를 막지 않는다. 동작 종류에 따라 정상일 수 있다 —');
  L.push('> 점프는 baseline 이 움직이고, 연기·잔상 이펙트는 반투명 비율이 원래 높다.');
  L.push('');
}

L.push('## [증거]', '```');
L.push(textTable(
  ['프레임', '캔버스', 'bbox', '바닥Y', '무게중심', '불투명', '반투명', '프린지', '고아섬', '구멍', '축소대비', '드리프트'],
  M.map((m, i) => {
    const d = driftRows.find((r) => r.name === m.name);
    return [
      m.name, `${m.w}x${m.h}`,
      m.bbox ? `${m.bbox.w}x${m.bbox.h}` : '(빈)',
      m.bbox ? m.bbox.bottom : '-',
      m.bbox ? `${m.cx.toFixed(1)},${m.cy.toFixed(1)}` : '-',
      m.opq, m.semi, pct(m.fringe), m.stray || '', m.holes || '',
      m.smallContrast.toFixed(3),
      d ? (d.ref ? '기준' : d.drift.toFixed(3)) : '-',
    ];
  }),
));
L.push('```');
if (jitterRows.length) {
  L.push('');
  L.push('### 떨림 (무게중심 2차 차분)', '```');
  L.push(textTable(['프레임', '2차차분(px)'], jitterRows.map((r) => [r.name, r.mag.toFixed(2)])));
  L.push('```');
  L.push('> **1차 차분(속도)이 아니라 2차 차분(가속)을 본다.** 걷기·돌진은 원래 움직이므로');
  L.push('> 속도가 크다고 떨림이 아니다. 프레임마다 가속이 크게 튀는 게 떨림이다.');
}
if (atlas) {
  L.push('');
  L.push(`### 아틀라스`, `${atlas.W}x${atlas.H} · 스프라이트 ${atlas.count}장 · **점유율 ${pct(atlas.fill)}** (하한 ${pct(T.atlasFillMin)})`);
}
L.push('');

L.push('## [기준]');
L.push(`떨림 격렬함 ≤ ${pct(T.jitterViolentRatio)}(최소변 대비) 또는 이상치 ≤ ${T.jitterOutlier}배(중위 대비) · baseline 산포 ≤ ${pct(T.baselineSpreadRatio)} · 색 드리프트 ≤ ${T.driftMax} · 실루엣 IoU ≥ ${T.shapeMin} ·`);
L.push(`프린지 ≤ ${pct(T.fringeRatio)} · 구멍 ≤ ${pct(T.holeRatio)} · 축소대비 ≥ ${T.smallContrastMin} · 아틀라스 ≥ ${pct(T.atlasFillMin)}`);
L.push('전부 인자로 덮어쓸 수 있다(`--jitter`·`--drift`·`--fringe`·`--small`·`--atlas-fill`).');
L.push('');

L.push('## [공백]');
L.push('- **애니메이션 타이밍·타격 프레임은 판정하지 않았다** — `polish` 의 `feel-audit` 소관이다.');
L.push('- **그림이 좋은지는 판정하지 않는다.** 정합성만 본다(`visual-qa` 가 보이는 것을 본다).');
L.push('- 정체성은 **색 분포 + 실루엣 IoU** 두 축으로 본다. 그래도 세부(문양·장식)가 바뀌는 드리프트는 못 잡는다.');
L.push('- 축소 판독성은 알파 격자 대비의 근사다. 실제 게임 배경 위 가독성은 `visual-qa` 로 본다.');
if (!atlasPath) L.push('- `--atlas` 를 안 줘서 **아틀라스 낭비를 판정하지 못했다.**');
L.push('');
L.push('## [잔여 위험]');
L.push('- (통과했지만 남는 위험을 여기 적는다.)');
L.push('');

const report = L.join('\n');
console.log(report);

if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'sprite-qa.md'), report);
  fs.writeFileSync(path.join(OUT, 'sprite-qa.json'), JSON.stringify({
    verdict, thresholds: T, aerial: AERIAL, atlas, fails, warns,
    frames: M.map(({ hist, ...m }) => m), jitter: jitterRows, drift: driftRows,
  }, null, 2));
  console.log(`-> ${OUT}/sprite-qa.md · sprite-qa.json`);
}

if (verdict === '미달') process.exit(1);
