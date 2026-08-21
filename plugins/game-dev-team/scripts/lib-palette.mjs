// lib-palette.mjs - 스펙 안의 팔레트 토큰(@group.key)을 실제 색으로 치환한다.
//
// 왜 필요한가: UI 스펙과 FX 스펙이 각자 hex 를 박아두면 톤이 조용히 갈라진다.
// 팔레트를 한 곳(VISUAL_DESIGN.md 의 기계용 짝인 palette.json)에 두고 스펙은 토큰만
// 참조하게 하면, 색 하나 바꿔 전량 재생성할 수 있다.
//
// 사용:  { "fill": { "from": "@primary.light", "to": "@primary.base" } }

import fs from 'node:fs';

/** palette.json 로드. { "primary": { "light": "#7DD8FF", ... }, ... } */
export function loadPalette(file) {
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resolveOne(token, palette, seen = 0) {
  if (seen > 8) throw new Error(`팔레트 토큰이 순환 참조한다: ${token}`);
  const key = token.slice(1); // '@' 제거
  const parts = key.split('.');
  let v = palette;
  for (const p of parts) {
    if (v == null || typeof v !== 'object' || !(p in v)) {
      throw new Error(`팔레트에 없는 토큰: ${token} (palette.json 을 확인해라)`);
    }
    v = v[p];
  }
  if (typeof v !== 'string') throw new Error(`팔레트 토큰이 색 문자열이 아니다: ${token}`);
  // 팔레트 안에서 다른 토큰을 가리키는 별칭(alias)도 허용한다
  return v.startsWith('@') ? resolveOne(v, palette, seen + 1) : v;
}

/** 객체/배열을 재귀 순회하며 "@..." 문자열을 팔레트 색으로 바꾼 새 값을 돌려준다. */
export function resolveTokens(node, palette) {
  if (!palette) return node;
  if (typeof node === 'string') return node.startsWith('@') ? resolveOne(node, palette) : node;
  if (Array.isArray(node)) return node.map((v) => resolveTokens(v, palette));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = resolveTokens(v, palette);
    return out;
  }
  return node;
}

/**
 * 스펙 파일에서 팔레트를 찾아 적용한다.
 * 우선순위: --palette 인자 > 스펙의 "palette" 경로 > 스펙 옆의 palette.json
 */
export function applyPalette(spec, specPath, argv) {
  const i = argv.indexOf('--palette');
  const explicit = i >= 0 ? argv[i + 1] : null;
  const fromSpec = spec.palette && typeof spec.palette === 'string' ? spec.palette : null;
  const sibling = specPath.replace(/[^\\/]+$/, 'palette.json');
  const file = explicit || fromSpec || sibling;
  const palette = loadPalette(file);
  if (palette) console.log(`  팔레트: ${file}`);
  return { spec: resolveTokens(spec, palette), palette, paletteFile: palette ? file : null };
}

// ── 색 이름 붙이기 ────────────────────────────────────────────────────────────
// 생성 모델 프롬프트에 hex 를 넣어봐야 거의 안 먹는다. 색은 말로 줘야 한다.
// 팔레트에서 뽑은 색을 "soft sky blue" 같은 어구로 바꿔 프롬프트에 넣는다.
const HUE_NAMES = [
  [15, 'red'], [40, 'orange'], [65, 'yellow'], [85, 'olive'], [150, 'green'],
  [185, 'teal'], [200, 'cyan'], [235, 'blue'], [260, 'indigo'], [290, 'violet'],
  [330, 'magenta'], [352, 'pink'], [360, 'red'],
];

/** {h,s,v} 또는 "#RRGGBB" 를 "bright sky blue" 같은 어구로. */
export function colorName(c) {
  let h, s, v;
  if (typeof c === 'string') {
    const n = c.replace('#', '');
    const r = parseInt(n.slice(0, 2), 16) / 255, g = parseInt(n.slice(2, 4), 16) / 255, b = parseInt(n.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    v = mx; s = mx === 0 ? 0 : d / mx;
    h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
  } else ({ h, s, v } = c);

  if (s < 0.10) return v > 0.9 ? 'off-white' : v > 0.65 ? 'light grey' : v > 0.3 ? 'grey' : 'near-black';
  const base = HUE_NAMES.find(([lim]) => h <= lim)?.[1] || 'red';
  // 갈색은 색상만으로는 안 잡힌다 — 주황 계열의 낮은 명도가 갈색이다
  if ((base === 'orange' || base === 'red') && v < 0.5) return v < 0.32 ? 'dark brown' : 'brown';
  const light = v > 0.88 ? 'pale ' : v > 0.7 ? 'bright ' : v > 0.45 ? '' : 'deep ';
  const sat = s > 0.75 ? 'vivid ' : s < 0.3 ? 'muted ' : '';
  return (light + sat + base).trim();
}
