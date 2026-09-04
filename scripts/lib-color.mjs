// lib-color.mjs - 색을 판정 가능한 수치로 바꾼다. 의존성 0.
//
// 두 가지를 한다:
//   1) 색각이상(CVD) 시뮬레이션 - 그 사람이 보는 색으로 변환
//   2) 구분 가능성 측정 - WCAG 명암비 + CIE Lab 색차(dE)
//
// **중요한 전제**: WCAG 명암비는 3색형 관찰자 기준으로 정의된 값이라 CVD 로 그대로 변환되지
// 않는다. 원본 팔레트에 WCAG 만 재는 건 부족하다 - 올바른 순서는 **시뮬레이션한 뒤 재는 것**이다.
// 그리고 명암비만으로는 "빨강 vs 초록"처럼 밝기는 같고 색만 다른 쌍의 붕괴를 못 잡는다.
// 그래서 dE 를 함께 본다.

// ── sRGB <-> 선형 RGB ────────────────────────────────────────────────────────
// 변환 행렬은 **선형** RGB 에서 적용해야 한다. sRGB 값에 바로 곱하면 결과가 틀린다.

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** '#RRGGBB' 또는 '#RGB' -> { r, g, b } (0~1 sRGB) */
export function parseHex(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`색 형식이 아니다: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

export function toHex({ r, g, b }) {
  const h = (x) => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

// ── CVD 시뮬레이션 ───────────────────────────────────────────────────────────
// Machado et al. (2009) 의 심각도 1.0 행렬. 선형 RGB 에 적용한다.
// 완전 이색형(dichromacy) 근사이며, 실제 개인차는 이보다 넓다 - 이건 **하한 점검**이다.

const CVD_MATRIX = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

export const CVD_TYPES = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

export const CVD_LABEL = {
  protanopia: '적색맹(P)',
  deuteranopia: '녹색맹(D)',
  tritanopia: '청색맹(T)',
  achromatopsia: '전색맹(A)',
  normal: '정상',
};

/** 유병률 참고 - 어디에 예산을 쓸지 판단용. 녹색맹이 압도적으로 흔하다. */
export const CVD_PREVALENCE = {
  deuteranopia: '남성 약 6%',
  protanopia: '남성 약 2%',
  tritanopia: '매우 드묾(<0.01%)',
  achromatopsia: '매우 드묾',
};

/**
 * 한 색을 특정 CVD 유형이 보는 색으로 변환한다.
 * @param {{r,g,b}} rgb 0~1 sRGB
 * @param {string} type CVD_TYPES 중 하나. 'normal' 이면 그대로 반환
 */
export function simulateCvd(rgb, type) {
  if (!type || type === 'normal') return { ...rgb };

  const lr = srgbToLinear(rgb.r);
  const lg = srgbToLinear(rgb.g);
  const lb = srgbToLinear(rgb.b);

  if (type === 'achromatopsia') {
    // 휘도만 남긴다 (Rec.709)
    const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    const s = linearToSrgb(clamp01(y));
    return { r: s, g: s, b: s };
  }

  const m = CVD_MATRIX[type];
  if (!m) throw new Error(`알 수 없는 CVD 유형: ${type}`);
  return {
    r: linearToSrgb(clamp01(m[0][0] * lr + m[0][1] * lg + m[0][2] * lb)),
    g: linearToSrgb(clamp01(m[1][0] * lr + m[1][1] * lg + m[1][2] * lb)),
    b: linearToSrgb(clamp01(m[2][0] * lr + m[2][1] * lg + m[2][2] * lb)),
  };
}

// ── WCAG 명암비 ──────────────────────────────────────────────────────────────

/** WCAG 상대 휘도 (0~1) */
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG 명암비 (1~21). 4.5 = 본문 텍스트 기준, 3.0 = 큰 텍스트·UI 컴포넌트 기준 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_TEXT = 4.5;      // 본문 텍스트
export const WCAG_LARGE = 3.0;     // 큰 텍스트 · UI 컴포넌트 · 그래픽 요소

// ── CIE Lab 색차 ─────────────────────────────────────────────────────────────
// 명암비는 밝기 차이만 본다. "밝기는 같고 색만 다른" 쌍(빨강 vs 초록)의 붕괴는 못 잡는다.
// dE 가 그걸 잡는다.

const D65 = { X: 0.95047, Y: 1.0, Z: 1.08883 };

function toXyz({ r, g, b }) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  return {
    X: lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375,
    Y: lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750,
    Z: lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041,
  };
}

/** sRGB -> CIE L*a*b* (D65) */
export function toLab(rgb) {
  const { X, Y, Z } = toXyz(rgb);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / D65.X), fy = f(Y / D65.Y), fz = f(Z / D65.Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * CIE76 색차. 대략적인 해석:
 *   < 1   구분 불가 (같은 색)
 *   1~2   훈련된 눈만 구분
 *   2~10  한눈에 다른 색
 *   > 10  확실히 다른 색
 * UI 에서 **의미가 다른 두 색**은 최소 10 이상이어야 실사용에서 안전하다.
 */
export function deltaE76(a, b) {
  const la = toLab(a), lb = toLab(b);
  return Math.hypot(la.L - lb.L, la.a - lb.a, la.b - lb.b);
}

/** 의미가 다른 색쌍의 최소 권장 dE. 이 밑으로 떨어지면 색만으로는 구분이 안 된다. */
export const DELTA_E_MIN = 10;

/**
 * 두 색이 모든 CVD 유형에서 구분되는지 판정한다.
 *
 * @param {string} hexA
 * @param {string} hexB
 * @param {object} [opt]
 * @param {number} [opt.minDeltaE=10]
 * @param {number} [opt.minContrast=0] 0 이면 명암비는 판정하지 않는다(색 구분만 볼 때)
 * @returns {{worst:{type:string,deltaE:number,contrast:number}, rows:Array, ok:boolean}}
 */
export function checkPair(hexA, hexB, opt = {}) {
  const minDeltaE = opt.minDeltaE ?? DELTA_E_MIN;
  const minContrast = opt.minContrast ?? 0;
  const A = parseHex(hexA);
  const B = parseHex(hexB);

  const rows = [];
  for (const type of ['normal', ...CVD_TYPES]) {
    const sa = simulateCvd(A, type);
    const sb = simulateCvd(B, type);
    const dE = deltaE76(sa, sb);
    const cr = contrastRatio(sa, sb);
    rows.push({
      type,
      deltaE: dE,
      contrast: cr,
      simA: toHex(sa),
      simB: toHex(sb),
      ok: dE >= minDeltaE && cr >= minContrast,
    });
  }
  const worst = rows.reduce((w, r) => (r.deltaE < w.deltaE ? r : w), rows[0]);
  return { worst, rows, ok: rows.every((r) => r.ok) };
}

/** 팔레트 객체(중첩 허용)를 { 'group.key': '#hex' } 로 평탄화한다. `_` 로 시작하는 키는 메모다. */
export function flattenPalette(palette, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(palette || {})) {
    if (k.startsWith('_')) continue;
    const key = prefix ? prefix + '.' + k : k;
    if (typeof v === 'string') {
      if (v.startsWith('@')) continue; // 별칭은 원본에서 이미 잡힌다
      if (/^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(v.replace(/^#/, '')) || v.startsWith('#')) out[key] = v;
    } else if (v && typeof v === 'object') {
      Object.assign(out, flattenPalette(v, key));
    }
  }
  return out;
}
