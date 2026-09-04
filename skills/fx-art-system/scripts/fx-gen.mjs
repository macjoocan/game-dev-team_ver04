#!/usr/bin/env node
// fx-gen.mjs - 이펙트 텍스처/시퀀스를 스펙에서 생성한다.
//   node fx-gen.mjs <spec.json> [--out <dir>]
//
// 외부 API 없이 돈다. 게임 FX 텍스처의 대부분은 글로우·링·스트릭·스파크의 조합이라
// 절차적으로 그리는 편이 생성 모델보다 정확하고 싸다 — 프레임 간 밝기 곡선이 매끄럽고,
// 중심이 정확히 맞고, 가산 블렌딩용 배경이 완전히 검다(생성 모델은 이 셋을 매번 놓친다).
//
// 출력: 프레임 PNG + 가로 스트립 시트 + manifest(프레임 수·권장 fps·블렌드·피벗)
// 알파 = 밝기라서 Additive / Alpha-blend 어느 셰이더에도 그대로 쓸 수 있다.

import fs from 'node:fs';
import path from 'node:path';
import { writePNG, hex, clamp01, lerp, packStrip } from '../../../scripts/lib-png.mjs';
import { applyPalette } from '../../../scripts/lib-palette.mjs';

const SS = 3; // 슈퍼샘플링

// ── 밝기 필드 프리미티브 (전부 0..1 강도를 더한다) ────────────────────────────
const TAU = Math.PI * 2;

/** 중심에서 부드럽게 감쇠하는 글로우 */
function glow(d, r, falloff = 2.2) {
  if (r <= 0) return 0;
  const t = clamp01(1 - d / r);
  return Math.pow(t, falloff);
}
/** 반지름 r 의 링. thickness 가 두께(가우시안 폭) */
function ring(d, r, thickness) {
  if (thickness <= 0) return 0;
  const x = (d - r) / thickness;
  return Math.exp(-x * x);
}
/** 중심에서 뻗는 N 갈래 스트릭(별빛). ang 은 회전 */
function spikes(px, py, d, count, len, width, ang) {
  if (d > len) return 0;
  const a = Math.atan2(py, px) + ang;
  // 각 방향과의 각도 차 -> 좁은 각도만 밝게
  const k = Math.abs(Math.cos(a * count / 2));
  const angular = Math.pow(k, 1 / Math.max(width, 1e-3));
  const radial = Math.pow(clamp01(1 - d / len), 1.6);
  return angular * radial;
}

// ── 이펙트 타입별 프레임 강도 필드 ───────────────────────────────────────────
// t: 0..1 (프레임 진행). 반환: (px,py)->강도 를 계산하는 함수용 파라미터 묶음
function fieldFor(type, t, S) {
  const R = S / 2;
  switch (type) {
    // 타격 임팩트: 흰 코어 플래시 + 퍼지는 충격파 링 + 방사 스파이크
    case 'impact': {
      const core = { r: lerp(0.34, 0.10, t) * R, i: Math.pow(1 - t, 1.4) * 1.5 };
      const shock = { r: lerp(0.18, 0.94, Math.pow(t, 0.55)) * R, th: lerp(0.10, 0.03, t) * R, i: Math.pow(1 - t, 1.1) };
      const sp = { count: 6, len: lerp(0.35, 0.98, Math.pow(t, 0.5)) * R, w: 0.12, i: Math.pow(1 - t, 1.8) * 0.9, ang: 0.35 };
      return { core, shock, sp };
    }
    // 매치 소멸: 코어가 빠르게 꺼지고 파편이 바깥으로 튄다
    case 'pop': {
      const core = { r: lerp(0.40, 0.02, Math.pow(t, 0.6)) * R, i: Math.pow(1 - t, 0.9) * 1.3 };
      const shock = { r: lerp(0.10, 0.70, t) * R, th: 0.05 * R, i: Math.pow(1 - t, 2.2) * 0.6 };
      const bits = { n: 10, dist: lerp(0.10, 0.86, Math.pow(t, 0.7)) * R, r: lerp(0.09, 0.02, t) * R, i: Math.pow(1 - t, 1.3) };
      return { core, shock, bits };
    }
    // 콤보 글로우: 루프 가능한 맥동
    case 'pulse': {
      const s = (Math.sin(t * TAU - Math.PI / 2) + 1) / 2; // 0..1..0
      const core = { r: lerp(0.42, 0.62, s) * R, i: lerp(0.55, 1.05, s) };
      const shock = { r: lerp(0.62, 0.80, s) * R, th: 0.09 * R, i: lerp(0.18, 0.45, s) };
      return { core, shock };
    }
    // 코인 획득: 4갈래 별 반짝임 + 위로 오르는 스파크
    case 'sparkle': {
      const bell = Math.sin(clamp01(t) * Math.PI); // 0 -> 1 -> 0
      const core = { r: lerp(0.10, 0.26, bell) * R, i: bell * 1.4 };
      const sp = { count: 4, len: lerp(0.20, 0.95, bell) * R, w: 0.07, i: bell * 1.2, ang: t * 0.5 };
      const bits = { n: 5, dist: lerp(0.15, 0.75, t) * R, r: 0.035 * R, i: Math.pow(1 - t, 1.6) * 0.9, up: true };
      return { core, sp, bits };
    }
    default:
      throw new Error(`알 수 없는 이펙트 타입: ${type}`);
  }
}

function renderFrame(spec, t) {
  const S = spec.size, W = S * SS, H = S * SS;
  const f = fieldFor(spec.type, t, W);
  const inten = new Float64Array(W * H);

  // 파편/스파크 위치는 프레임마다 같은 배치를 써야 튀지 않는다 — 결정론적으로 배치
  let bitAngles = null;
  if (f.bits) {
    bitAngles = [];
    for (let i = 0; i < f.bits.n; i++) {
      const base = (i / f.bits.n) * TAU + (spec.seedAngle || 0.7);
      // 살짝 흔들되 시드 고정(재현성) — Math.random 안 쓴다
      bitAngles.push(base + Math.sin(base * 3.7) * 0.18);
    }
  }

  for (let y = 0; y < H; y++) {
    const py = y - H / 2 + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x - W / 2 + 0.5;
      const d = Math.hypot(px, py);
      let v = 0;
      if (f.core) v += glow(d, f.core.r, 2.4) * f.core.i;
      if (f.shock) v += ring(d, f.shock.r, f.shock.th) * f.shock.i;
      if (f.sp) v += spikes(px, py, d, f.sp.count, f.sp.len, f.sp.w, f.sp.ang) * f.sp.i;
      if (f.bits) {
        for (let i = 0; i < bitAngles.length; i++) {
          const a = bitAngles[i];
          const bx = Math.cos(a) * f.bits.dist;
          const by = Math.sin(a) * f.bits.dist - (f.bits.up ? f.bits.dist * 0.35 : 0);
          v += glow(Math.hypot(px - bx, py - by), f.bits.r, 2.0) * f.bits.i;
        }
      }
      inten[y * W + x] = v;
    }
  }

  // 다운샘플 + 색 입히기. 밝을수록 흰색으로 타오르게(hot core) 한다.
  const tint = hex(spec.color || '#FFFFFF');
  const out = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let acc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) acc += inten[(y * SS + sy) * W + (x * SS + sx)];
      }
      const v = acc / (SS * SS);
      const hot = clamp01(v * 1.7 - 0.75);
      const o = (y * S + x) * 4;
      out[o]     = Math.round(lerp(tint[0], 255, hot));
      out[o + 1] = Math.round(lerp(tint[1], 255, hot));
      out[o + 2] = Math.round(lerp(tint[2], 255, hot));
      out[o + 3] = Math.round(clamp01(v) * 255);
    }
  }
  return out;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
const specPath = process.argv[2];
if (!specPath || specPath.startsWith('--')) { console.error('usage: node fx-gen.mjs <spec.json> [--out <dir>]'); process.exit(2); }
let spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
// 팔레트 토큰(@primary.base 등)을 실제 색으로 치환 — 톤 정본은 palette.json 한 곳
spec = applyPalette(spec, specPath, process.argv).spec;
const oi = process.argv.indexOf('--out');
const outDir = oi >= 0 ? process.argv[oi + 1] : (spec.out || 'fx-out');
const pi = process.argv.indexOf('--preview-bg');
const previewBg = pi >= 0 ? process.argv[pi + 1] : (spec.previewBg || '#101C2E');
fs.mkdirSync(outDir, { recursive: true });

const manifest = { generatedFrom: path.basename(specPath), effects: [] };
for (const e of spec.effects) {
  const dir = path.join(outDir, e.name);
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  for (let i = 0; i < e.frames; i++) {
    // loop 이펙트는 마지막 프레임이 첫 프레임과 이어져야 하므로 t 를 frames 로 나눈다
    const t = e.loop ? i / e.frames : i / (e.frames - 1 || 1);
    const buf = renderFrame(e, t);
    frames.push(buf);
    writePNG(path.join(dir, `${e.name}_${String(i).padStart(2, '0')}.png`), e.size, e.size, buf);
  }
  const strip = packStrip(frames, e.size, e.size);
  writePNG(path.join(outDir, `${e.name}_sheet.png`), strip.w, strip.h, strip.buf);

  // 검수용 프리뷰: 가산 이펙트는 흰 배경에서 보면 흰 코어가 사라져 판정이 안 된다.
  // 실제 인게임처럼 어두운 배경에 얹어 한 장 더 낸다(엔진에 넣는 건 위 sheet 쪽).
  if (previewBg) {
    const bg = hex(previewBg);
    const pv = Buffer.alloc(strip.buf.length);
    for (let i = 0; i < strip.buf.length; i += 4) {
      const a = strip.buf[i + 3] / 255;
      // 가산 합성 — 인게임 셰이더와 같은 방식으로 미리 본다
      pv[i]     = Math.min(255, Math.round(bg[0] + strip.buf[i] * a));
      pv[i + 1] = Math.min(255, Math.round(bg[1] + strip.buf[i + 1] * a));
      pv[i + 2] = Math.min(255, Math.round(bg[2] + strip.buf[i + 2] * a));
      pv[i + 3] = 255;
    }
    writePNG(path.join(outDir, `${e.name}_preview.png`), strip.w, strip.h, pv);
  }

  manifest.effects.push({
    name: e.name, type: e.type, frames: e.frames, size: e.size,
    sheet: `${e.name}_sheet.png`, layout: 'horizontal-strip',
    fps: e.fps || (e.loop ? 12 : 24),
    loop: !!e.loop,
    blend: 'additive',           // 알파=밝기라 alpha-blend 로도 동작한다
    pivot: { x: 0.5, y: 0.5 },
    color: e.color || '#FFFFFF',
  });
  console.log(`  ${e.name}  ${e.frames}프레임 x ${e.size}px  -> ${e.name}_sheet.png (${strip.w}x${strip.h})`);
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n이펙트 ${manifest.effects.length}종 -> ${outDir}`);
console.log('manifest.json 에 프레임 수·fps·블렌드·피벗이 있다 (Unity 임포트/파티클 설정에 그대로 쓴다).');
