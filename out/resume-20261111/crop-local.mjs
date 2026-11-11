// crop-probe.mjs — 테두리 잘림 규칙을 "변별"로 재측정한다.
// 접촉 정의를 명시한다: alpha>=128(sprite-qa 와 동일), 해당 변 경계줄의 최장 연속 런이 MINRUN 이상.
import fs from 'node:fs';
import path from 'node:path';
const { readPNG } = await import('file:///C:/00.SVN/game-dev-team_ver04/scripts/lib-png-read.mjs');

const SIDES = ['top', 'bottom', 'left', 'right'];

function sideRuns(fr, minRun) {
  const { width: w, height: h, data } = fr;
  const op = (x, y) => data[(y * w + x) * 4 + 3] >= 128;
  const line = {
    top: Array.from({ length: w }, (_, x) => op(x, 0)),
    bottom: Array.from({ length: w }, (_, x) => op(x, h - 1)),
    left: Array.from({ length: h }, (_, y) => op(0, y)),
    right: Array.from({ length: h }, (_, y) => op(w - 1, y)),
  };
  const out = {};
  for (const s of SIDES) {
    let best = 0, cur = 0;
    for (const v of line[s]) { cur = v ? cur + 1 : 0; if (cur > best) best = cur; }
    out[s] = { run: best, touch: best >= minRun };
  }
  // 여백: 네 변 각각 가장 바깥 불투명 픽셀까지의 거리
  let minX = w, minY = h, maxX = -1, maxY = -1, any = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (op(x, y)) {
    any = true;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  out.margin = any ? { top: minY, bottom: h - 1 - maxY, left: minX, right: w - 1 - maxX } : null;
  // 알파 전제: 전면 불투명이면 측정 불가
  let clear = 0; const n = w * h;
  for (let p = 0; p < n; p++) if (data[p * 4 + 3] === 0) clear++;
  out.transparentPct = clear / n;
  return out;
}

function frames(dir) {
  return fs.readdirSync(dir).filter((f) => /\.png$/i.test(f))
    .map((f) => ({ f, n: Number((f.match(/(\d+)/g) || ['0']).pop()) }))
    .sort((a, b) => a.n - b.n)
    .map(({ f }) => { const im = readPNG(path.join(dir, f)); return { name: f, ...im }; });
}

function classify(dir, minRun) {
  let fr;
  try { fr = frames(dir); } catch (e) { return { error: String(e.message || e) }; }
  if (fr.length < 2) return { error: '프레임 2장 미만' };
  const per = fr.map((f) => sideRuns(f, minRun));
  const noAlpha = per.filter((p) => p.transparentPct < 0.02).length;
  if (noAlpha > per.length / 2) return { n: fr.length, unmeasurable: `알파 없음 ${noAlpha}/${per.length}` };
  const res = { n: fr.length, sides: {} };
  for (const s of SIDES) {
    const t = per.filter((p) => p[s].touch).length;
    const margins = per.map((p) => (p.margin ? p.margin[s] : null)).filter((v) => v !== null);
    res.sides[s] = {
      touch: t,
      state: t === 0 ? '전무' : t === per.length ? '전수' : '혼재',
      minMargin: margins.length ? Math.min(...margins) : null,
    };
  }
  res.verdict = Object.values(res.sides).some((v) => v.state === '혼재') ? '미달'
    : Object.values(res.sides).some((v) => v.state === '전수') ? '측정불가(전수)' : '충족';
  return res;
}


export {classify,sideRuns};
