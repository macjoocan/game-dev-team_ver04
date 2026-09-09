#!/usr/bin/env node
// cutout.mjs - 생성 이미지의 배경을 지워 알파(투명)를 만든다.
//   node cutout.mjs <입력.png|폴더> [--out <dir>] [--tol 26] [--feather 1.5] [--trim] [--binary-alpha]
//
// 왜 필요한가: 생성 모델은 알파를 못 만든다. 나오는 건 항상 RGB 라서, 게임에 넣으려면
// 배경을 잘라내야 한다.
//
// **단순 색 제거를 쓰면 안 된다.** "흰색을 지워라"로 하면 캐릭터가 입은 흰 옷·눈 흰자까지
// 사라진다(실제로 흰 튜닉 캐릭터에서 확인). 그래서 **테두리에서만 번져 들어가는**
// flood fill 을 쓴다 — 바깥과 이어진 배경만 지우고, 안쪽에 갇힌 흰색은 남는다.
//
// **마젠타 배경(`--chroma "#FF00FF"`)은 배경을 진짜로 통제할 수 있을 때만 쓴다.**
// 마젠타는 자연스러운 아트에 거의 안 나오는 색이라 배경 판정이 애매해질 여지가 없고, 알파를
// 못 만드는 생성기에서 투명을 얻는 표준 수법이다(선행 사례: agent-sprite-forge). 배경을 후처리로
// 깔거나 3D 렌더처럼 배경을 직접 지정하는 경우가 여기 해당한다.
//
// **그런데 SD 계열에 프롬프트로 시키는 건 이 경우가 아니다.** 실측(2026-09-08, SDXL hires, hex-danmaku):
//   - 배경 지시를 프롬프트 끝에 두면 24/24 장이 **무시**했다(색 그라디언트 배경이 나왔다).
//   - 문장 맨 앞으로 올려 반복하면 배경은 나오는데 **피사체까지 그 색으로 물든다** —
//     "magenta background" 로 청록 드래곤을 뽑으니 드래곤이 분홍이 됐고, "green screen" 은 초록이 됐다.
//     확산 모델에서 색 단어는 화면 전체에 걸린다. 크로마키의 전제(배경색 ∉ 피사체색)가 깨진다.
//   - **`plain white background, isolated on white, product photo style cutout` 만 색을 안 옮겼다.**
//     흰 배경 + 아래의 테두리 flood fill 조합이 SD 생성물에서는 가장 안전하다(흰 옷은 안쪽에 갇혀 살아남는다).
// 배경을 통제할 수 없으면(레퍼런스 이미지 등) `--chroma` 없이 모서리 자동 검출로 돈다.
//
// 마젠타를 쓸 때는 경계에 자주색이 번지므로 **디스필**이 필요하다 — 알파가 부분인 픽셀에서
// 배경색 성분을 빼서 없앤다(`--despill`, 크로마 모드에서 기본 켜짐).
//
// 출력: RGBA PNG + 잘라낸 비율·경계 품질 리포트

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

// 피사체가 통째로 반투명해지는(= 먹히는) 사고를 잡는 임계. 구멍 검사로는 안 잡힌다 —
// 구멍은 "불투명에 둘러싸인 투명"이라, 전체가 반투명해지면 구멍이 0으로 나온다.
// 실측(2026-09-08, hex 보스 4장): tol 90 에서 불투명 48~64% -> 0.1~3.3% 인데 "구멍 0 · 제거 93%" 로 보고됐다.
// 절대 비율로는 못 가른다 — 정상 컷아웃도 큰 피사체면 반투명 경계가 30% 가까이 나온다(실측).
// 판별식은 **불투명 대비 반투명**이다. 정상은 반투명이 불투명의 0.1~0.7배, 녹으면 3배 이상으로 뒤집힌다.
const OPAQUE_MIN = 0.08;   // 불투명이 캔버스의 8% 미만 = 피사체가 남지 않았다
const SEMI_RATIO_MAX = 1.2; // 반투명 / 불투명. 1 을 넘으면 경계보다 녹은 살이 많다는 뜻

const args = process.argv.slice(2);
const input = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!input || input.startsWith('--')) {
  console.error('usage: node cutout.mjs <입력.png|폴더> [--out dir] [--tol 26] [--feather 1.5] [--trim] [--chroma <hex>]');
  console.error('  --tol      확실한 배경으로 볼 색 거리 (기본 26)');
  console.error('  --soft     부분 배경 상한 (기본 tol*2.6). 접지 그림자를 반투명으로 녹인다');
  console.error('  --feather  경계 부드럽게 (기본 1.5px). 0 이면 계단이 남는다');
  console.error('  --binary-alpha  알파를 0/255 로만 낸다. **도트(픽셀아트) 전용** — 반투명이 있으면 도트가 아니다');
  console.error('  --trim     투명 여백을 잘라 캔버스를 줄인다');
  console.error('  --enclosed 다리 사이처럼 **피사체가 둘러싼** 배경도 지운다 (흰 옷이 있으면 켜지 마라)');
  console.error('  --deshadow 발밑 접지 그림자를 지운다 (게임이 그림자를 코드로 그릴 때). --shadow-tol/--shadow-band 로 조절');
  console.error('  --chroma   배경색을 명시한다 (예: --chroma "#FF00FF"). 프롬프트로 배경을 통제할 때');
  console.error('  --no-despill  크로마 모드의 디스필을 끈다 (기본 켜짐)');
  process.exit(2);
}
const OUT = opt('--out', null);
const CHROMA = (() => {
  const v = opt('--chroma', null);
  if (!v) return null;
  const h = String(v).replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    console.error(`--chroma 형식이 아니다: ${v} (예: "#FF00FF")`);
    process.exit(2);
  }
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
})();
const DESPILL = CHROMA && !args.includes('--no-despill');
const TOL = Number(opt('--tol', 26));            // 확실한 배경
const SOFT = Number(opt('--soft', 0)) || TOL * 2.6; // 여기까지는 "부분 배경"(접지 그림자 등)
const FEATHER = Number(opt('--feather', 1.5));
// 도트는 안티에일리어싱이 없다(실측: 상용 픽셀아트 300장 중 91% 가 반투명 0%).
// feather 0 만으로는 부족하다 — 톨러런스 경계에서 여전히 1.1% 가 반투명으로 남는다.
const BINARY_ALPHA = args.includes('--binary-alpha');
const ALPHA_CUT = Number(opt('--alpha-cut', 0.5));
const TRIM = args.includes('--trim');
// 갇힌 배경(다리 사이 등)까지 지운다. 기본은 꺼 둔다 — 흰 옷·눈 흰자를 색만으로는 구분 못 한다.
const ENCLOSED = args.includes('--enclosed');
// 접지 그림자를 지운다. 게임이 발밑 그림자를 코드로 그리는 경우 구운 그림자는 이중이 되고,
// 캐릭터가 움직여도 안 따라간다. 색만으로는 은색 갑옷과 못 가르므로 **배경과 이어진 경로**로만 번진다.
const DESHADOW = args.includes('--deshadow');
// 판별은 **배경색과의 거리**로 한다 — 주 flood fill 과 같은 기준이고, 하단 밴드에서만 허용치를 키운다.
// 명도·채도 규칙을 먼저 써 봤는데 푸른 기가 도는 잔광을 못 잡았다(채도가 올라간다). 실측 2026-09-08.
const SHADOW_TOL = Number(opt('--shadow-tol', 0));     // 0 이면 TOL * 3.5
const SHADOW_BAND = Number(opt('--shadow-band', 0.62)); // 피사체 bbox 의 이 지점 아래만 대상

function cutout(file, destDir) {
  const img = readPNG(file);
  const { width: w, height: h, data } = img;

  // 배경색 = 네 모서리 최빈색. 균일한 배경을 전제로 한다(생성 프롬프트에서 순백을 강제한 이유)
  const cnt = new Map();
  const cs = Math.max(2, Math.floor(Math.min(w, h) * 0.03));
  for (const [ox, oy] of [[0, 0], [w - cs, 0], [0, h - cs], [w - cs, h - cs]]) {
    for (let y = oy; y < oy + cs; y++) for (let x = ox; x < ox + cs; x++) {
      const i = (y * w + x) * 4;
      const k = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
  }
  // --chroma 가 있으면 모서리 검출을 건너뛴다 — 프롬프트로 통제한 값이 정본이다.
  const bg = CHROMA
    || [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map((v) => (Number(v) << 3) + 4);
  const dist = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);

  // 테두리에서 flood fill. 안쪽에 갇힌 같은 색(흰 옷)은 건드리지 않는다.
  // 히스테리시스: SOFT 까지 번지되, TOL 을 넘는 픽셀은 "부분 배경"으로 반투명 처리한다.
  // 순백 배경에 깔린 옅은 접지 그림자가 딱 이 구간에 들어온다 — 이분법으로 자르면
  // tol 을 올려야 하고, 그러면 캐릭터의 밝은 부분이 뚫린다.
  const isBg = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (p) => { if (!isBg[p] && dist(p * 4) <= SOFT) { isBg[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }

  // ── 갇힌 배경 — 다리 사이·팔 아래처럼 **피사체가 둘러싼** 배경은 위 flood fill 이 못 들어간다.
  // 테두리에서만 번지는 설계의 대가다(그 덕에 흰 옷이 안 먹힌다). 실측(2026-09-08, hex 고블린 창병):
  // 다리 사이·겨드랑이의 흰 배경 2.18% 가 불투명으로 남았는데 구멍·녹음 검사 어느 쪽에도 안 걸렸다.
  // 여기서는 **찾아서 보고만** 한다. 지우는 건 `--enclosed` 로 사람이 켠다 — 흰 옷·눈 흰자와
  // 구분할 방법이 색 하나뿐이라 자동으로 지우면 그게 다시 "흰 옷을 먹는" 사고가 된다.
  const enclosed = new Uint8Array(w * h);
  let enclosedCount = 0, enclosedBlobs = 0, biggestBlob = 0;
  {
    const st2 = new Int32Array(w * h);
    const seen = new Uint8Array(w * h);
    for (let p0 = 0; p0 < w * h; p0++) {
      if (seen[p0] || isBg[p0] || dist(p0 * 4) > TOL) continue;
      // 배경색인데 테두리와 안 이어진 픽셀 → 갇힌 배경 덩어리
      let sp2 = 0, size = 0;
      seen[p0] = 1; st2[sp2++] = p0;
      const blob = [];
      while (sp2 > 0) {
        const p = st2[--sp2];
        blob.push(p); size++;
        const x = p % w, y = (p - x) / w;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of nb) {
          if (q < 0 || seen[q] || isBg[q] || dist(q * 4) > TOL) continue;
          seen[q] = 1; st2[sp2++] = q;
        }
      }
      // 1~2px 덩어리는 안티에일리어싱 잡티다. 눈에 보이는 구멍만 센다(캔버스의 0.01% 이상).
      if (size < Math.max(24, w * h * 0.0001)) continue;
      enclosedBlobs++; enclosedCount += size;
      if (size > biggestBlob) biggestBlob = size;
      for (const p of blob) enclosed[p] = 1;
    }
  }

  // ── 접지 그림자 — 배경보다 조금 어두워 주 flood fill 의 SOFT 를 못 넘은 잔광·타원.
  // **하단 밴드에서만** 허용치를 키워 같은 flood fill 을 한 번 더 돌린다. 위쪽 은색 뿔·흰 하이라이트는
  // 밴드 밖이라 안전하다. 전역으로 SOFT 를 올리면 그것들이 뚫린다(실측: soft 150 에서 구멍 0.7% -> 7.6%).
  const shadow = new Uint8Array(w * h);
  let shadowCount = 0;
  if (DESHADOW) {
    let minY = h, maxY = -1;
    for (let p = 0; p < w * h; p++) {
      if (isBg[p] || enclosed[p]) continue;
      const y = (p - (p % w)) / w;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const bandTop = maxY < 0 ? h : Math.round(minY + (maxY - minY) * SHADOW_BAND);
    const sTol = SHADOW_TOL > 0 ? SHADOW_TOL : TOL * 3.5;
    const st3 = new Int32Array(w * h);
    let sp3 = 0;
    const seed = (p) => {
      if (shadow[p] || isBg[p]) return;
      const y = (p - (p % w)) / w;
      if (y < bandTop || dist(p * 4) > sTol) return;
      shadow[p] = 1; st3[sp3++] = p;
    };
    // 이미 배경(또는 지운 갇힌 배경)인 픽셀의 이웃에서 출발한다
    for (let p = 0; p < w * h; p++) {
      if (!isBg[p] && !(ENCLOSED && enclosed[p])) continue;
      const x = p % w, y = (p - x) / w;
      if (x > 0) seed(p - 1);
      if (x < w - 1) seed(p + 1);
      if (y > 0) seed(p - w);
      if (y < h - 1) seed(p + w);
    }
    while (sp3 > 0) {
      const p = st3[--sp3];
      shadowCount++;
      const x = p % w, y = (p - x) / w;
      if (x > 0) seed(p - 1);
      if (x < w - 1) seed(p + 1);
      if (y > 0) seed(p - w);
      if (y < h - 1) seed(p + w);
    }
  }

  // 알파 산출. 경계에서는 배경색과의 거리로 부분 알파를 준다(계단 방지).
  const out = Buffer.alloc(w * h * 4);
  // 페더 밴드 — 반투명으로 녹일 색거리 폭.
  //
  // 배경↔전경 색거리에 자동 비례시켜 봤는데 번짐 지표가 안 줄었다(반투명 픽셀만 늘었다).
  // 남는 번짐은 **거의 불투명한** AA 픽셀의 옅은 색조라, 그걸 건드리면 진짜 자주색 아트를
  // 망칠 위험이 생긴다. 그래서 고정 밴드를 유지하고 사람이 `--feather` 로 조절하게 둔다.
  // 마젠타 배경에서는 8 정도가 맞다 — 실측: feather 1.5 에서 번짐 112px, 8 에서 16px.
  const featherBand = TOL * FEATHER;

  let opaque = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    let a;
    if (isBg[p]) {
      const d = dist(i);
      // TOL 이하 = 완전 투명, TOL~SOFT = 거리에 비례한 반투명(그림자가 녹는다)
      a = d <= TOL ? 0 : Math.min(1, (d - TOL) / Math.max(1e-6, SOFT - TOL)) * 0.85;
    } else if (FEATHER > 0) {
      // 배경과 가까운 색일수록 반투명 — 배경에 인접한 픽셀에만 적용한다.
      //
      // 크로마 모드에서는 반경을 넓힌다. 생성물의 안티에일리어싱 경계는 1~2px 램프라
      // 4-이웃만 보면 램프의 바깥 한 줄만 잡히고, 나머지가 **불투명한 자주색 테두리로 남는다**
      // (실측: 4-이웃만 볼 때 번짐 120px 중 8px 만 처리됨).
      const x = p % w, y = (p - x) / w;
      const R = CHROMA ? 2 : 1;
      let nearBg = false;
      for (let dy = -R; dy <= R && !nearBg; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (isBg[ny * w + nx]) { nearBg = true; break; }
        }
      }
      a = nearBg ? Math.max(0, Math.min(1, (dist(i) - TOL) / featherBand)) : 1;
    } else a = 1;
    // 갇힌 배경은 --enclosed 일 때만 지운다. 경계는 바깥 배경과 같은 방식으로 부드럽게.
    if (ENCLOSED && enclosed[p]) a = 0;
    if (DESHADOW && shadow[p]) a = 0;
    if (BINARY_ALPHA) a = a >= ALPHA_CUT ? 1 : 0;
    out[i] = data[i]; out[i + 1] = data[i + 1]; out[i + 2] = data[i + 2];

    // 디스필: 부분 투명 픽셀에는 배경색이 섞여 있다. 마젠타 배경이면 그게 자주색 테두리로
    // 남아 눈에 띈다. 관측색 = a*전경 + (1-a)*배경 을 전경으로 되돌린다(언프리멀티플라이).
    if (DESPILL && a > 0.02 && a < 0.98) {
      for (let c = 0; c < 3; c++) {
        out[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - (1 - a) * bg[c]) / a)));
      }
    }

    out[i + 3] = Math.round(a * 255);
    if (a > 0.5) opaque++;
  }

  let W = w, H = h, buf = out, ox = 0, oy = 0;
  if (TRIM) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (out[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX >= 0) {
      W = maxX - minX + 1; H = maxY - minY + 1; ox = minX; oy = minY;
      buf = Buffer.alloc(W * H * 4);
      for (let y = 0; y < H; y++) out.copy(buf, y * W * 4, ((oy + y) * w + ox) * 4, ((oy + y) * w + ox + W) * 4);
    }
  }

  // 구멍 검사 — 바깥과 안 이어졌는데 투명해진 픽셀이 있으면 캐릭터가 뚫린 것이다.
  // isBg 는 테두리 연결 성분만 표시하므로, 그 밖에서 알파 0 이 나오면 결함이다.
  // --enclosed 로 **일부러 지운** 갇힌 배경은 구멍이 아니다. 안 빼면 도구가 자기 작업을 결함으로 보고한다.
  let holes = 0;
  for (let p = 0; p < w * h; p++) {
    if (isBg[p] || out[p * 4 + 3] !== 0) continue;
    if (ENCLOSED && enclosed[p]) continue;
    if (DESHADOW && shadow[p]) continue;
    holes++;
  }

  // 몸통이 통째로 녹았는지 — 구멍 검사가 못 잡는 사고다. 알파 분포로 직접 본다.
  let fullyOpaque = 0, semi = 0;
  for (let p = 0; p < w * h; p++) { const a = out[p * 4 + 3]; if (a >= 250) fullyOpaque++; else if (a > 0) semi++; }
  const opaqueRatio = fullyOpaque / (w * h);
  const semiRatio = semi / (w * h);

  const dest = path.join(destDir, path.basename(file).replace(/\.png$/i, '_cut.png'));
  writePNG(dest, W, H, buf);
  return {
    file: path.basename(file), bg: `#${bg.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
    removedPct: +((1 - opaque / (w * h)) * 100).toFixed(1), holes,
    opaquePct: +(opaqueRatio * 100).toFixed(1), semiPct: +(semiRatio * 100).toFixed(1),
    ghosted: opaqueRatio < OPAQUE_MIN || semi > fullyOpaque * SEMI_RATIO_MAX,
    enclosedPct: +(enclosedCount * 100 / (w * h)).toFixed(2), enclosedBlobs,
    shadowPct: +(shadowCount * 100 / (w * h)).toFixed(2),
    biggestEnclosedPct: +(biggestBlob * 100 / (w * h)).toFixed(2),
    size: `${w}x${h}${TRIM ? ` -> ${W}x${H}` : ''}`, dest,
  };
}

const files = fs.statSync(input).isDirectory()
  ? fs.readdirSync(input).filter((f) => /\.png$/i.test(f) && !/_cut\.png$/i.test(f)).map((f) => path.join(input, f))
  : [input];
const destDir = OUT || (fs.statSync(input).isDirectory() ? path.join(input, 'cut') : path.dirname(input));
fs.mkdirSync(destDir, { recursive: true });

console.log(`\n배경 제거 — ${files.length}장 · tol ${TOL} · feather ${FEATHER}${TRIM ? ' · trim' : ''}`);
let ghostedCount = 0;
for (const f of files) {
  const r = cutout(f, destDir);
  console.log(`  ${r.file}  배경 ${r.bg} · 제거 ${r.removedPct}% · 불투명 ${r.opaquePct}% · 반투명 ${r.semiPct}% · 구멍 ${r.holes} · ${r.size}`);
  if (DESHADOW && r.shadowPct > 0) console.log(`      ·  접지 그림자 ${r.shadowPct}% 제거`);
  if (!ENCLOSED && r.enclosedBlobs > 0) {
    console.log(`      ?  갇힌 배경 ${r.enclosedBlobs}곳 · 합계 ${r.enclosedPct}% (최대 ${r.biggestEnclosedPct}%) — 다리 사이·팔 아래처럼 피사체가 둘러싼 배경이다.`);
    console.log(`         테두리 flood fill 은 여기 못 들어간다. 지우려면 --enclosed. 흰 옷·눈 흰자가 있으면 켜지 마라.`);
  }
  if (r.holes > 0) console.log(`      !! 캐릭터가 뚫렸다 — --tol 을 내려라`);
  if (r.ghosted) {
    ghostedCount++;
    const why = r.opaquePct < OPAQUE_MIN * 100
      ? `불투명이 ${r.opaquePct}% 뿐이다 (기준 ${OPAQUE_MIN * 100}% 이상)`
      : `반투명(${r.semiPct}%)이 불투명(${r.opaquePct}%)의 ${(r.semiPct / Math.max(0.01, r.opaquePct)).toFixed(1)}배다 (기준 ${SEMI_RATIO_MAX}배 이하)`;
    console.log(`      !! **피사체가 녹았다** — ${why}.`);
    console.log(`         제거율이 높아도 실패다. 배경이 그라디언트라 캐릭터 색과 겹친 것 — --tol 을 내리고,`);
    console.log(`         근본 해결은 생성 단계에서 단색 배경을 얻는 것이다(--chroma). references/comfyui-setup.md`);
  }
}
console.log(`\n-> ${destDir}`);
console.log('제거율이 너무 낮으면 --tol 을 올려라(그림자가 남은 것). 캐릭터가 뚫리거나 녹으면 내려라.');
// 녹은 산출물을 파이프라인 뒤로 넘기면 아틀라스까지 가서야 눈에 띈다. 여기서 미달로 끊는다.
if (ghostedCount) { console.error(`\n판정: **미달** — ${ghostedCount}장에서 피사체가 녹았다.`); process.exit(1); }
