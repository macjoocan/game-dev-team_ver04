import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readPNG } from '../../../scripts/lib-png-read.mjs';

// Shared by sprite-qa and motion-qa. These are input/measurement settings,
// not thresholds for animation quality or human approval.
export const CONTRACT = Object.freeze({
  version: 'sprite-sequence-v1', foregroundAlphaMin: 128,
  backgroundAlphaMax: 19, minimumBackgroundFraction: 0.02,
  minimumBoundaryRun: 2, contourBins: 64,
});
export const SIDES = ['top', 'bottom', 'left', 'right'];
const hash = data => createHash('sha256').update(data).digest('hex');

export function loadSequence(source, frameCount) {
  if (!source || !fs.existsSync(source)) throw new Error(`읽을 수 없다: ${source}`);
  if (fs.statSync(source).isDirectory()) {
    if (frameCount !== undefined) throw new Error('--frames는 가로 시트에만 쓴다.');
    const names = fs.readdirSync(source).filter(n => /\.png$/i.test(n)).sort((a, b) =>
      a.localeCompare(b, 'en', { numeric: true }) || (a < b ? -1 : a > b ? 1 : 0));
    return names.map(name => {
      const file = path.join(source, name);
      return { name, ...readPNG(file), sourceSha256: hash(fs.readFileSync(file)) };
    });
  }
  if (!/\.png$/i.test(source)) throw new Error('PNG 폴더 또는 가로 PNG 시트가 필요하다.');
  const n = Number(frameCount), img = readPNG(source);
  if (!Number.isSafeInteger(n) || n < 1 || n > img.width || img.width % n !== 0) {
    throw new Error('--frames는 시트 폭을 나누어떨어지게 하는 양의 정수여야 한다.');
  }
  const width = img.width / n, sourceSha256 = hash(fs.readFileSync(source));
  return Array.from({ length: n }, (_, k) => {
    const data = Buffer.alloc(width * img.height * 4);
    for (let y = 0; y < img.height; y++) {
      const start = (y * img.width + k * width) * 4;
      img.data.copy(data, y * width * 4, start, start + width * 4);
    }
    return { name: `f${k}`, width, height: img.height, data, sourceSha256 };
  });
}

export function inspectSequence(frames, minimumFrames = 2) {
  const issues = [];
  if (frames.length < minimumFrames) issues.push({ code: 'frame-count', message: `프레임이 ${minimumFrames}장 이상 필요하다.` });
  const sizes = [...new Set(frames.map(f => `${f.width}x${f.height}`))];
  if (sizes.length > 1) issues.push({ code: 'canvas-size', message: `캔버스 크기가 섞여 있다: ${sizes.join(', ')}` });
  const measurements = frames.map(f => {
    const { width: w, height: h, data } = f;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, foreground = 0, background = 0;
    const mask = new Uint8Array(w * h);
    for (let p = 0; p < mask.length; p++) {
      const a = data[p * 4 + 3];
      if (a <= CONTRACT.backgroundAlphaMax) background++;
      if (a < CONTRACT.foregroundAlphaMin) continue;
      mask[p] = 1; foreground++;
      const x = p % w, y = Math.floor(p / w);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const backgroundFraction = background / mask.length;
    if (!foreground) issues.push({ code: 'empty-foreground', frame: f.name, message: '알파 128 이상인 피사체가 없다.' });
    if (backgroundFraction < CONTRACT.minimumBackgroundFraction) issues.push({
      code: 'background-missing', frame: f.name, message: '알파 20 미만인 배경이 2% 미만이다. 컷아웃 입력인지 확인한다.',
    });
    return { name: f.name, width: w, height: h, foreground, backgroundFraction,
      bbox: foreground ? { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 } : null,
      sourceSha256: f.sourceSha256, rgbaSha256: hash(data), mask };
  });
  return { valid: issues.length === 0, issues, measurements };
}

export function inputRecord(inspected) {
  return { contract: CONTRACT, valid: inspected.valid, issues: inspected.issues,
    frames: inspected.measurements.map(({ mask, ...m }) => m) };
}

export function parseTightCrop(value) {
  if (value === undefined) return [];
  const sides = value.split(',');
  if (sides.some(s => !SIDES.includes(s))) throw new Error('--tight-crop는 top,bottom,left,right 중 쉼표로 구분한다.');
  return [...new Set(sides)];
}

export function measureCrop(measurements, tightCrop = []) {
  const perFrame = measurements.map(m => {
    const { width: w, height: h, mask, bbox: b } = m;
    const runs = {};
    for (const side of SIDES) {
      let run = 0, longest = 0;
      const horizontal = side === 'top' || side === 'bottom';
      for (let i = 0; i < (horizontal ? w : h); i++) {
        const x = horizontal ? i : side === 'left' ? 0 : w - 1;
        const y = horizontal ? side === 'top' ? 0 : h - 1 : i;
        run = mask[y * w + x] ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      runs[side] = longest;
    }
    return { name: m.name, runs, margins: { top: b.y0, bottom: h - 1 - b.y1, left: b.x0, right: w - 1 - b.x1 } };
  });
  const sides = Object.fromEntries(SIDES.map(side => {
    const touching = perFrame.filter(f => f.runs[side] >= CONTRACT.minimumBoundaryRun).map(f => f.name);
    const state = !touching.length ? 'none' : touching.length === perFrame.length ? 'all' : 'mixed';
    const declared = tightCrop.includes(side);
    return [side, { state, count: touching.length, frames: touching,
      minimumMarginPx: Math.min(...perFrame.map(f => f.margins[side])), declaredTightCrop: declared,
      exempted: declared && state === 'all', warning: state === 'mixed' || (state === 'all' && !declared) }];
  }));
  return { mode: 'warning-only', sides, perFrame };
}

export function measureMotion(measurements) {
  const bins = CONTRACT.contourBins;
  const perFrame = measurements.map(m => {
    const { bbox: b, mask, width: w } = m;
    const contour = Array(bins).fill(null);
    // Same bin boundaries as the archived probe. Below 64px, neighboring
    // bins intentionally sample the same column; no interpolated pixels.
    for (let bin = 0; bin < bins; bin++) {
      const start = b.x0 + Math.floor(bin * b.width / bins);
      const end = Math.max(start + 1, b.x0 + Math.floor((bin + 1) * b.width / bins));
      let bottom = -1;
      for (let x = start; x < end; x++) {
        for (let y = b.y1; y >= b.y0; y--) {
          if (mask[y * w + x]) { bottom = Math.max(bottom, y); break; }
        }
      }
      if (bottom >= 0) contour[bin] = (b.y1 - bottom) / b.height;
    }
    return { name: m.name, contour, bboxTop: b.y0, bboxHeight: b.height };
  });
  const ranges = [];
  for (let bin = 0; bin < bins; bin++) {
    const values = perFrame.map(f => f.contour[bin]).filter(v => v !== null);
    if (values.length >= Math.ceil(perFrame.length / 2)) ranges.push(Math.max(...values) - Math.min(...values));
  }
  const adjacentContourDelta = [];
  for (let i = 1; i < perFrame.length; i++) {
    const deltas = [];
    for (let bin = 0; bin < bins; bin++) {
      const a = perFrame[i - 1].contour[bin], b = perFrame[i].contour[bin];
      if (a !== null && b !== null) deltas.push(Math.abs(a - b));
    }
    adjacentContourDelta.push({ from: perFrame[i - 1].name, to: perFrame[i].name,
      value: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null });
  }
  const heights = perFrame.map(f => f.bboxHeight).sort((a, b) => a - b);
  const middle = Math.floor(heights.length / 2);
  const medianHeight = heights.length % 2 ? heights[middle] : (heights[middle - 1] + heights[middle]) / 2;
  const tops = perFrame.map(f => f.bboxTop);
  const deltas = adjacentContourDelta.map(d => d.value).filter(v => v !== null);
  return { mode: 'report-only', liftRangeMeaning: '하단 윤곽 변화량. 실제 발 들기나 보행 품질 점수가 아니다.',
    liftRange: ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : null,
    validBins: ranges.length, contourDelta: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null,
    bboxTopRangeRatio: (Math.max(...tops) - Math.min(...tops)) / medianHeight,
    adjacentContourDelta, perFrame };
}
