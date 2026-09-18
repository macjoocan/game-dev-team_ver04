#!/usr/bin/env node
// palette-force.mjs - 캐스트 전체에 **하나의 팔레트**를 강제한다 (화풍 통일).
//   node palette-force.mjs <폴더|파일...> --out <dir> [--colors 24] [--palette <pal.json>]
//
// 왜 필요한가: `pixel-quantize` 는 **이미지마다** k-means 로 자기 색을 뽑는다. 팔레트 입력이
// 아예 없다. 그래서 주인공 24색, 적 24색, 보스 24색이 전부 **다른 24색**이 되고 —
// 나란히 놓으면 결이 다르다. 이게 "화풍이 갈린다"의 기계적 원인이다(2026-09-18 확인).
//
// 이 도구는 순서를 뒤집는다: **캐스트 전체를 한 번에 보고 팔레트 하나를 뽑은 뒤**, 그걸 전원에게 먹인다.
//
// 실행은 두 단계다. 이 스크립트는 팔레트를 정하고 **Aseprite Lua 를 생성**하며,
// 실제 색 매핑은 Aseprite 가 한다(`run_lua_script` MCP 로 실행).
// 왜 Aseprite 인가: `ChangePixelFormat{format="indexed"}` 가 **최근접 색 매칭**을 해준다.
// 우리가 직접 짜도 되지만, 디더링·인덱스 처리까지 검증된 구현을 다시 만들 이유가 없다.
//
// ── Aseprite MCP 함정 2개 (2026-09-18 실측, 반드시 읽어라) ──────────────────────
// 1. `apply_palette_preset` + `quantize_to_palette` 를 **따로 호출하면 안 먹는다.**
//    RGB PNG 는 팔레트를 저장하지 못한다. 첫 호출이 저장하는 순간 프리셋이 버려지고,
//    두 번째 호출은 이미지에서 다시 만들어진 250색 팔레트로 "양자화"한다 = 무효.
//    -> 반드시 **한 Lua 세션 안에서** 설정+변환+저장까지 끝낸다.
// 2. `apply_palette_preset` 을 **indexed 이미지에 걸면 그림이 파괴된다.**
//    색 매칭 없이 인덱스만 갈아끼워서, 캐릭터가 통째로 사라졌다(실측).
//    그런데 결과는 "31색 · 반투명 0%" 로 **계약을 통과할 뻔했다.** 그래서 이 도구는
//    변환 뒤 자기 검사를 한다(아래 verify).

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { toLab, deltaE76, toHex } from '../../../scripts/lib-color.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node palette-force.mjs <폴더|파일...> --out <dir> [--colors 24] [--palette <pal.json>]');
  console.error('  --colors   뽑을 공용 색 수 (기본 24 — 상용 도트 300장 중앙값 22, 대역 16~32)');
  console.error('  --palette  직접 정한 팔레트를 쓴다. {"colors":["#rrggbb",...]} 또는 ["#rrggbb",...]');
  console.error('  --verify-only  Lua 를 만들지 않고, --out 에 이미 있는 결과만 검사한다');
  process.exit(2);
}
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('--out', 'palette-out');
const K = Number(opt('--colors', 24));
const PAL_IN = opt('--palette', null);
const VERIFY_ONLY = args.includes('--verify-only');

// ── 입력 모으기 ───────────────────────────────────────────────────────────────
const inputs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) { if (['--out', '--colors', '--palette'].includes(a)) i++; continue; }
  if (!fs.existsSync(a)) continue;
  if (fs.statSync(a).isDirectory()) {
    for (const f of fs.readdirSync(a)) if (f.toLowerCase().endsWith('.png')) inputs.push(path.join(a, f));
  } else if (a.toLowerCase().endsWith('.png')) inputs.push(a);
}
if (!inputs.length) { console.error('입력 PNG 가 없다.'); process.exit(2); }

// ── 캐스트 전체에서 불투명 픽셀 수집 ──────────────────────────────────────────
// 프레임별이 아니라 **전량 합쳐서** 본다. 그게 이 도구의 존재 이유다.
// lib-color 는 **0~1 정규화 RGB** 를 쓴다(`parseHex` 가 /255 한다). 0~255 를 넣으면
// toLab 이 L=3596 같은 값을 내고 toHex 는 전부 #ffffff 가 된다 — 에러 없이 조용히 틀린다.
// 또 `deltaE76(a,b)` 는 **RGB 를 받아 내부에서 Lab 변환**한다. Lab 을 넣으면 NaN 이다.
// 둘 다 2026-09-18 에 실제로 밟았다. 그래서 Lab 거리는 여기서 따로 잰다(재변환도 피한다).
const labDist = (a, b) => Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);

function opaquePixels(file) {
  const img = readPNG(file);
  const out = [];
  for (let p = 0; p < img.width * img.height; p++) {
    const o = p * 4;
    if (img.data[o + 3] > 127) out.push({ r: img.data[o] / 255, g: img.data[o + 1] / 255, b: img.data[o + 2] / 255 });
  }
  return out;
}

function kmeansLab(pixels, k, iters = 24) {
  const labs = pixels.map((p) => ({ ...p, lab: toLab(p) }));
  // k-means++ 초기화 — 무작위 초기화는 같은 입력에 다른 팔레트를 준다(재현성이 깨진다)
  const cent = [labs[Math.floor(labs.length / 2)].lab];
  while (cent.length < k) {
    let best = null, bestD = -1;
    // 전량 훑으면 느리다. 균등 표본으로 충분하다 — 색 분포는 표본에서도 유지된다.
    const step = Math.max(1, Math.floor(labs.length / 4000));
    for (let i = 0; i < labs.length; i += step) {
      let d = Infinity;
      for (const c of cent) d = Math.min(d, labDist(labs[i].lab, c));
      if (d > bestD) { bestD = d; best = labs[i].lab; }
    }
    if (!best || bestD <= 0) break;
    cent.push(best);
  }
  let assign = new Array(labs.length).fill(0);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let i = 0; i < labs.length; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < cent.length; c++) { const d = labDist(labs[i].lab, cent[c]); if (d < bd) { bd = d; bi = c; } }
      if (assign[i] !== bi) { assign[i] = bi; moved++; }
    }
    // 대표색은 **RGB 평균**으로 낸다. Lab 평균을 다시 RGB 로 돌리면 색이 탁해진다(기존 교훈).
    const sum = cent.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let i = 0; i < labs.length; i++) { const s = sum[assign[i]]; s.r += labs[i].r; s.g += labs[i].g; s.b += labs[i].b; s.n++; }
    for (let c = 0; c < cent.length; c++) {
      if (!sum[c].n) continue;
      const rgb = { r: sum[c].r / sum[c].n, g: sum[c].g / sum[c].n, b: sum[c].b / sum[c].n };
      cent[c] = toLab(rgb); cent[c].rgb = rgb;
    }
    if (!moved) break;
  }
  return cent.filter((c) => c.rgb).map((c) => c.rgb);
}

fs.mkdirSync(OUT, { recursive: true });

// ── 검사: 강제 후에도 그림이 남아 있나 ────────────────────────────────────────
// test04 사고(캐릭터가 사라졌는데 "31색 · 반투명 0%" 로 계약 통과 직전)를 막는다.
// 계약은 **색과 알파만** 본다. 내용이 남았는지는 안 본다.
function verify(srcFile, dstFile) {
  const a = readPNG(srcFile), b = readPNG(dstFile);
  if (a.width !== b.width || a.height !== b.height) return { ok: false, why: `크기가 바뀌었다 ${a.width}x${a.height} -> ${b.width}x${b.height}` };
  let oa = 0, ob = 0, both = 0, sumDe = 0;
  for (let p = 0; p < a.width * a.height; p++) {
    const o = p * 4, aA = a.data[o + 3] > 127, aB = b.data[o + 3] > 127;
    if (aA) oa++; if (aB) ob++;
    if (aA && aB) {
      both++;
      sumDe += deltaE76({ r: a.data[o] / 255, g: a.data[o + 1] / 255, b: a.data[o + 2] / 255 },
                        { r: b.data[o] / 255, g: b.data[o + 1] / 255, b: b.data[o + 2] / 255 });
    }
  }
  const kept = oa ? ob / oa : 0;
  const meanDe = both ? sumDe / both : 999;
  // 실루엣이 90% 미만 남으면 파괴다(test04 는 2% 였다). dE 평균 20 초과면 색이 딴 데로 갔다.
  const ok = kept >= 0.9 && meanDe <= 20;
  return { ok, kept, meanDe, why: ok ? '' : (kept < 0.9 ? `실루엣 ${(kept * 100).toFixed(1)}% 만 남았다` : `색이 평균 dE ${meanDe.toFixed(1)} 만큼 이동했다`) };
}

if (VERIFY_ONLY) {
  let bad = 0;
  for (const f of inputs) {
    const dst = path.join(OUT, path.basename(f));
    if (!fs.existsSync(dst)) { console.log(`  ? ${path.basename(f)} — 결과 없음`); bad++; continue; }
    const v = verify(f, dst);
    console.log(`  ${v.ok ? 'O' : 'X'} ${path.basename(f)}  실루엣 ${(v.kept * 100).toFixed(1)}% · dE ${v.meanDe.toFixed(1)}${v.ok ? '' : ' — ' + v.why}`);
    if (!v.ok) bad++;
  }
  console.log(bad ? `\n미달 ${bad}/${inputs.length} — 팔레트가 대상과 안 맞거나 변환이 깨졌다.` : `\n전부 통과 (${inputs.length}장).`);
  process.exit(bad ? 1 : 0);
}

// ── 팔레트 결정 ───────────────────────────────────────────────────────────────
let colors;
if (PAL_IN) {
  const raw = JSON.parse(fs.readFileSync(PAL_IN, 'utf8'));
  const list = Array.isArray(raw) ? raw : (raw.colors || Object.values(raw).flat());
  colors = list.filter((x) => typeof x === 'string' && /^#?[0-9a-f]{6}$/i.test(x)).map((x) => (x[0] === '#' ? x : '#' + x));
  console.log(`팔레트 ${colors.length}색 — ${PAL_IN} 에서 읽음`);
} else {
  const all = [];
  for (const f of inputs) all.push(...opaquePixels(f));
  console.log(`캐스트 ${inputs.length}장 · 불투명 픽셀 ${all.length}개에서 공용 ${K}색을 뽑는다`);
  colors = kmeansLab(all, K).map(toHex);
  console.log(`  -> ${colors.length}색`);
}
fs.writeFileSync(path.join(OUT, 'palette.json'), JSON.stringify({ colors }, null, 2));

// ── Aseprite Lua 생성 ─────────────────────────────────────────────────────────
// 한 세션에서 열기 -> 팔레트 설정 -> 최근접 매칭(indexed) -> 저장까지 끝낸다(함정 1).
const esc = (p) => path.resolve(p).replace(/\\/g, '\\\\');
const lua = `-- palette-force.mjs 가 생성했다. 손으로 고치지 마라 — 다시 생성된다.
local pal = Palette(${colors.length + 1})
pal:setColor(0, Color{ r=0, g=0, b=0, a=0 })  -- 0번은 투명 인덱스
${colors.map((h, i) => `pal:setColor(${i + 1}, Color{ r=0x${h.slice(1, 3)}, g=0x${h.slice(3, 5)}, b=0x${h.slice(5, 7)}, a=255 })`).join('\n')}
local files = {
${inputs.map((f) => `  { "${esc(f)}", "${esc(path.join(OUT, path.basename(f)))}" }`).join(',\n')}
}
for _, io in ipairs(files) do
  local spr = app.open(io[1])
  spr:setPalette(pal)
  app.command.ChangePixelFormat{ ui=false, format="indexed", dithering="none" }
  spr:saveAs(io[2])
  spr:close()
end
`;
const luaPath = path.join(OUT, 'force.lua');
fs.writeFileSync(luaPath, lua);

console.log(`\n${inputs.length}장 대상 · 팔레트 -> ${path.join(OUT, 'palette.json')}`);
console.log(`Lua -> ${luaPath}`);
console.log('\n다음: Aseprite MCP 의 run_lua_script 에 이 파일 내용을 넣어 실행한다.');
console.log(`끝나면 반드시: node palette-force.mjs ${inputs[0]} --out ${OUT} --verify-only`);
console.log('(계약은 색·알파만 본다. **그림이 남아 있는지는 안 본다** — 검사를 건너뛰지 마라.)');
