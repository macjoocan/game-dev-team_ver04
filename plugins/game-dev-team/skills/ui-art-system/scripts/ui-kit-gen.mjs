#!/usr/bin/env node
// ui-kit-gen.mjs - UI 스프라이트(버튼·패널·프레임·바)를 스펙에서 생성한다.
//   node ui-kit-gen.mjs <spec.json> [--out <dir>]
//
// 외부 API·패키지 없이 돈다(Node 내장 zlib 만 사용). 결과는 알파 있는 RGBA PNG +
// 9-slice 보더가 든 manifest.json.
//
// 왜 코드로 그리나: 버튼·프레임은 "예쁜 한 장"이 아니라 **규격**이 결과물이다.
// 상태 변형(normal/pressed/disabled)이 픽셀 단위로 정합해야 하고, 9-slice 보더가
// 정확해야 늘려도 안 깨진다. 생성 모델은 매번 다른 그림을 주므로 이 조건을 못 맞춘다.
// 톤·모티프는 사람이 정하고(art-direction), 그 값을 스펙에 넣어 여기서 양산한다.

import fs from 'node:fs';
import path from 'node:path';
import { writePNG, hex, clamp01, lerp, smoothstep } from '../../../scripts/lib-png.mjs';
import { applyPalette } from '../../../scripts/lib-palette.mjs';

const SS = 4; // 슈퍼샘플링 배수 (안티에일리어싱)

// ── 도형: 라운드 사각형 SDF (중심 기준, 음수 = 내부) ──────────────────────────
function sdfRoundRect(px, py, w, h, r) {
  const qx = Math.abs(px) - (w / 2 - r);
  const qy = Math.abs(py) - (h / 2 - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// dst 위에 (r,g,b,a) 를 알파 합성
function over(dst, i, r, g, b, a) {
  if (a <= 0) return;
  const da = dst[i + 3];
  const outA = a + da * (1 - a);
  if (outA <= 0) { dst[i] = dst[i + 1] = dst[i + 2] = dst[i + 3] = 0; return; }
  dst[i]     = (r * a + dst[i]     * da * (1 - a)) / outA;
  dst[i + 1] = (g * a + dst[i + 1] * da * (1 - a)) / outA;
  dst[i + 2] = (b * a + dst[i + 2] * da * (1 - a)) / outA;
  dst[i + 3] = outA;
}

// ── 스프라이트 1장 렌더 ───────────────────────────────────────────────────────
function render(spec) {
  const W = spec.w * SS, H = spec.h * SS;
  const buf = new Float64Array(W * H * 4); // 0..255 / alpha 0..1

  const bw = (spec.w - (spec.pad || 0) * 2) * SS;
  const bh = (spec.h - (spec.pad || 0) * 2) * SS;
  const rad = (spec.radius || 0) * SS;

  const sh = spec.shadow;
  const fillFrom = hex(spec.fill?.from || '#888888');
  const fillTo = hex(spec.fill?.to || spec.fill?.from || '#888888');
  const st = spec.stroke;
  const stC = st ? hex(st.color) : null;
  const stW = st ? st.width * SS : 0;
  const hl = spec.highlight;
  const hlC = hl ? hex(hl.color || '#FFFFFF') : null;

  for (let y = 0; y < H; y++) {
    const py = y - H / 2 + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x - W / 2 + 0.5;
      const i = (y * W + x) * 4;

      // 1) 그림자 — SDF 거리 기반 감쇠(블러 근사)
      if (sh) {
        const d = sdfRoundRect(px, py - (sh.dy || 0) * SS, bw, bh, rad);
        const a = (sh.alpha ?? 0.35) * (1 - smoothstep(0, (sh.blur || 6) * SS, d));
        const c = hex(sh.color || '#000000');
        over(buf, i, c[0], c[1], c[2], a);
      }

      const d = sdfRoundRect(px, py, bw, bh, rad);

      // 2) 본체 — 세로 그라디언트
      const inside = 1 - smoothstep(-0.7, 0.7, d); // 경계 AA
      if (inside > 0) {
        const t = clamp01((py + bh / 2) / bh);
        over(buf, i,
          lerp(fillFrom[0], fillTo[0], t),
          lerp(fillFrom[1], fillTo[1], t),
          lerp(fillFrom[2], fillTo[2], t),
          inside);
      }

      // 3) 상단 하이라이트 — 내부 위쪽에만
      if (hl && inside > 0) {
        const top = -bh / 2;
        const hh = (hl.height ?? 0.4) * bh;
        const f = 1 - clamp01((py - top) / hh);
        const a = (hl.alpha ?? 0.3) * f * f * inside;
        over(buf, i, hlC[0], hlC[1], hlC[2], a);
      }

      // 4) 테두리 — 안쪽으로 그린다(바깥으로 그리면 규격이 커진다)
      if (st) {
        const band = 1 - smoothstep(stW - 0.7, stW + 0.7, Math.abs(d - (-stW / 2)) * 2);
        const a = clamp01(band) * inside;
        if (a > 0) over(buf, i, stC[0], stC[1], stC[2], a * (st.alpha ?? 1));
      }
    }
  }

  // 다운샘플 (SS x SS 평균)
  const out = Buffer.alloc(spec.w * spec.h * 4);
  for (let y = 0; y < spec.h; y++) {
    for (let x = 0; x < spec.w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * spec.w * SS + (x * SS + sx)) * 4;
          const pa = buf[i + 3];
          r += buf[i] * pa; g += buf[i + 1] * pa; b += buf[i + 2] * pa; a += pa;
        }
      }
      const n = SS * SS;
      const o = (y * spec.w + x) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
const specPath = process.argv[2];
if (!specPath) { console.error('usage: node ui-kit-gen.mjs <spec.json> [--out <dir>]'); process.exit(2); }
let spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
// 팔레트 토큰(@primary.base 등)을 실제 색으로 치환 — 톤 정본은 palette.json 한 곳
spec = applyPalette(spec, specPath, process.argv).spec;
const oi = process.argv.indexOf('--out');
const outDir = oi >= 0 ? process.argv[oi + 1] : (spec.out || 'ui-out');
fs.mkdirSync(outDir, { recursive: true });

const manifest = { generatedFrom: path.basename(specPath), sprites: [] };
for (const s of spec.sprites) {
  const rgba = render(s);
  const file = path.join(outDir, s.name + '.png');
  writePNG(file, s.w, s.h, rgba);
  manifest.sprites.push({
    name: s.name, file: s.name + '.png', w: s.w, h: s.h,
    // Unity Sprite Border 는 (left, bottom, right, top) 순서다. 헷갈리기 쉬워 이름으로 적는다.
    nineSlice: s.nineSlice || null,
    pivot: s.pivot || { x: 0.5, y: 0.5 },
    pixelsPerUnit: s.pixelsPerUnit || 100,
  });
  console.log(`  ${s.name}.png  ${s.w}x${s.h}`);
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.sprites.length}장 생성 -> ${outDir}`);
console.log(`manifest.json 에 9-slice 보더·피벗이 들어 있다 (Unity 임포트 때 그대로 쓴다).`);
