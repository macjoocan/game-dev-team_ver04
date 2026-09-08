#!/usr/bin/env node
// cast-distinct.mjs - 캐릭터 여럿이 게임 크기에서 **서로 구분되는가**를 판정한다.
//   node cast-distinct.mjs <캐릭터폴더> [--size 48] [--out dir]
//                          [--sizes a.json]  캐릭터별 렌더 크기 { "boss": 53, "chaser": 39 }
//                          [--min-de 12] [--max-iou 0.72] [--cvd]
//
// `sprite-qa` 와 **반대 질문**이다. sprite-qa 는 한 캐릭터의 프레임이 서로 **같은가**를 보고,
// 이 도구는 서로 다른 캐릭터가 **다른가**를 본다. 둘 다 필요하다 — 실사용(hex-danmaku, 2026-09-08)에서
// 적 6종을 만들 때 "이 여섯이 39~56px 에서 구분되나"를 판정할 도구가 없어 사람 눈에만 의존했다.
//
// 왜 게임 크기로 재나: 원본 512px 에서는 다 달라 보인다. 화면에서 실제로 그려지는 크기(39~56px)로
// 줄여야 진짜 판별력이 나온다. 축소하면 세부가 사라지고 **색과 실루엣만** 남는다.
//
// 두 축으로 본다 (하나만 통과해도 구분된다 — 색이 같아도 실루엣이 다르면 알아본다):
//   1) 색   — 축소본 대표색의 CIE Lab dE. `--cvd` 를 주면 색각이상 4종에서도 잰다
//   2) 형태 — 실루엣 IoU. 낮을수록 다르다
//
// 의존성 없음.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { parseHex, toHex, simulateCvd, deltaE76, CVD_TYPES, CVD_LABEL } from '../../../scripts/lib-color.mjs';

const args = process.argv.slice(2);
const root = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!root || root.startsWith('--') || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node cast-distinct.mjs <캐릭터폴더> [--size 48] [--sizes sizes.json] [--out dir]');
  console.error('  --size    게임에서 그려지는 크기(px). 전부 같은 크기일 때');
  console.error('  --sizes   캐릭터별 크기 JSON: { "bossDefault": 53, "chaser": 39 }');
  console.error('  --min-de  색 구분 하한 (기본 12). 이 위면 색만으로 구분된다');
  console.error('  --max-iou 형태 구분 상한 (기본 0.72). 이 아래면 실루엣만으로 구분된다');
  console.error('  --cvd     색각이상 4종에서도 색 거리를 잰다 (가장 나쁜 값을 쓴다)');
  console.error('종료 코드: 0 = 전부 구분됨 · 1 = 구분 안 되는 쌍 있음 · 3 = 측정 불가');
  process.exit(2);
}
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`폴더가 없다: ${root}\n판정: 측정 불가 — 경로를 확인해라.`); process.exit(3);
}
const OUT = opt('--out', null);
const SIZE = Number(opt('--size', 48));
const MIN_DE = Number(opt('--min-de', 12));
const MAX_IOU = Number(opt('--max-iou', 0.72));
const CVD = args.includes('--cvd');
const SIZES = (() => {
  const p = opt('--sizes', null);
  if (!p) return null;
  if (!fs.existsSync(p)) { console.error(`--sizes 파일이 없다: ${p}\n판정: 측정 불가.`); process.exit(3); }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error(`--sizes 를 JSON 으로 못 읽었다 (${e.message})\n판정: 측정 불가.`); process.exit(3); }
})();

const files = fs.readdirSync(root).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.join(root, f));
if (files.length < 2) { console.error(`캐릭터가 ${files.length}종이다 — 2종 이상이어야 비교할 수 있다.\n판정: 측정 불가.`); process.exit(3); }

const SIL = 48;   // 실루엣 비교 해상도. 게임 크기와 비슷한 급으로 잡는다

/** 게임 크기로 줄인 뒤 대표색과 실루엣을 뽑는다. */
function measure(file) {
  const name = path.basename(file, '.png');
  const img = readPNG(file);
  const gs = (SIZES && SIZES[name]) || SIZE;

  // 알파 bbox — 캐릭터가 캔버스 어디에 있든 같은 기준으로 줄인다
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] > 16) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { name, empty: true };
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  // 게임 크기로 면적 평균 축소 — 최근접은 실제 렌더보다 나쁘게 보인다
  const dw = Math.max(1, Math.round(gs * bw / bh)), dh = gs;
  const px = [];
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    const y0 = minY + y * bh / dh, y1 = minY + (y + 1) * bh / dh;
    const x0 = minX + x * bw / dw, x1 = minX + (x + 1) * bw / dw;
    for (let yy = Math.floor(y0); yy < Math.min(maxY + 1, Math.ceil(y1)); yy++)
      for (let xx = Math.floor(x0); xx < Math.min(maxX + 1, Math.ceil(x1)); xx++) {
        const i = (yy * img.width + xx) * 4, al = img.data[i + 3] / 255;
        r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al; a += al; n++;
      }
    px.push(a > 0 ? { r: r / a, g: g / a, b: b / a, a: a / Math.max(1, n) } : { r: 0, g: 0, b: 0, a: 0 });
  }

  // 대표색 두 개를 뽑는다. 하나로는 부족하다 —
  //   평균색은 "멀리서 본 인상"이지만 **세부를 지운다.** 청록 갑옷과 황동 갑옷이 둘 다 금장식을
  //   많이 쓰면 평균이 비슷한 갈색으로 수렴한다(실측: dE 5.4).
  //   그래서 **가장 채도 높은 우세색**을 함께 본다 — 플레이어가 "청록 보스"로 기억하는 그 색이다.
  let R = 0, G = 0, B = 0, W = 0;
  for (const p of px) { if (p.a < 0.35) continue; R += p.r * p.a; G += p.g * p.a; B += p.b * p.a; W += p.a; }
  const mean = W ? { r: R / W / 255, g: G / W / 255, b: B / W / 255 } : { r: 0, g: 0, b: 0 };

  // 우세색: 5비트로 양자화해 최빈 구간을 찾되, **채도로 가중**한다.
  // 단순 최빈색을 쓰면 면적이 넓은 무채색(그림자·금속 회색)이 이긴다.
  const bins = new Map();
  for (const p of px) {
    if (p.a < 0.5) continue;
    const mx = Math.max(p.r, p.g, p.b), mn = Math.min(p.r, p.g, p.b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    if (mx < 40) continue;                     // 거의 검정은 제외 — 외곽선이 이긴다
    const k = `${p.r >> 5},${p.g >> 5},${p.b >> 5}`;
    const e = bins.get(k) || { w: 0, r: 0, g: 0, b: 0 };
    const wt = p.a * (0.15 + sat);             // 채도가 높을수록 크게 센다
    e.w += wt; e.r += p.r * wt; e.g += p.g * wt; e.b += p.b * wt;
    bins.set(k, e);
  }
  let best = null;
  for (const e of bins.values()) if (!best || e.w > best.w) best = e;
  const domin = best
    ? { r: best.r / best.w / 255, g: best.g / best.w / 255, b: best.b / best.w / 255 }
    : { ...mean };

  // 실루엣 — bbox 정규화 마스크
  const sil = new Uint8Array(SIL * SIL);
  for (let y = 0; y < SIL; y++) for (let x = 0; x < SIL; x++) {
    const sxp = minX + Math.floor((x + 0.5) * bw / SIL);
    const syp = minY + Math.floor((y + 0.5) * bh / SIL);
    if (sxp <= maxX && syp <= maxY && img.data[(syp * img.width + sxp) * 4 + 3] >= 128) sil[y * SIL + x] = 1;
  }

  return { name, gs, mean, domin, hex: toHex(mean), dominHex: toHex(domin), sil, aspect: bw / bh };
}

function iou(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x && y) inter++; if (x || y) uni++; }
  return uni ? inter / uni : 1;
}

const M = files.map(measure);
const empty = M.filter((m) => m.empty).map((m) => m.name);
const valid = M.filter((m) => !m.empty);
if (valid.length < 2) { console.error('비교 가능한 캐릭터가 2종 미만이다.\n판정: 측정 불가.'); process.exit(3); }

// ── 모든 쌍 ──────────────────────────────────────────────────────────────────
const types = CVD ? ['normal', ...CVD_TYPES] : ['normal'];
const rows = [];
for (let i = 0; i < valid.length; i++) for (let j = i + 1; j < valid.length; j++) {
  const a = valid[i], b = valid[j];
  // lib-color 는 0~1 스케일이다(parseHex 가 /255 해서 낸다). 255 로 넘기면 전부 흰색으로 클램프돼
  // dE 가 전부 0.0 이 나온다 — 실제로 한 번 그렇게 틀렸다(2026-09-08).
  // 평균색과 우세색 각각에서, 색각 유형 중 **가장 나쁜 값**을 구한다.
  // 두 축 중 **큰 쪽**을 쓴다 — 하나라도 확실히 다르면 구분되기 때문이다.
  const worstOf = (A, B) => {
    let d = Infinity, t0 = 'normal';
    for (const t of types) {
      const de = deltaE76(t === 'normal' ? A : simulateCvd(A, t), t === 'normal' ? B : simulateCvd(B, t));
      if (de < d) { d = de; t0 = t; }
    }
    return { d, t: t0 };
  };
  const mw = worstOf({ ...a.mean }, { ...b.mean });
  const dw = worstOf({ ...a.domin }, { ...b.domin });
  const useDom = dw.d > mw.d;
  const worstDe = useDom ? dw.d : mw.d;
  const worstType = useDom ? dw.t : mw.t;
  const deMean = mw.d, deDom = dw.d;
  const shape = iou(a.sil, b.sil);
  const byColor = worstDe >= MIN_DE;
  const byShape = shape <= MAX_IOU;
  rows.push({ a: a.name, b: b.name, de: worstDe, deMean, deDom, worstType, iou: shape, byColor, byShape, ok: byColor || byShape });
}
rows.sort((x, y) => (x.ok === y.ok ? 0 : x.ok ? 1 : -1) || x.de - y.de);
const bad = rows.filter((r) => !r.ok);

// ── 리포트 ───────────────────────────────────────────────────────────────────
const L = [];
L.push('# 캐스트 구분 판정\n');
L.push(`\`${root}\` · 캐릭터 ${valid.length}종 · 쌍 ${rows.length}개 · 게임 크기 ${SIZES ? '캐릭터별' : SIZE + 'px'}${CVD ? ' · 색각이상 포함' : ''}\n`);
L.push('## [주장]');
L.push(bad.length
  ? `판정: **미달** — 구분 안 되는 쌍 ${bad.length}개`
  : `판정: **충족** — ${rows.length}쌍 모두 색 또는 형태로 구분된다`);
L.push('');
L.push('> **하나만 통과해도 구분된다.** 색이 비슷해도 실루엣이 다르면 플레이어는 알아본다.');
L.push('> 반대로 둘 다 못 넘으면 게임 크기에서 같은 것으로 보인다.\n');

if (bad.length) {
  L.push('## [미달] 게임 크기에서 구분되지 않는 쌍\n');
  L.push('| 쌍 | 색 거리(dE) | 실루엣 IoU | 왜 |');
  L.push('|---|---|---|---|');
  for (const r of bad) {
    L.push(`| \`${r.a}\` vs \`${r.b}\` | ${r.de.toFixed(1)} (기준 ${MIN_DE}) | ${r.iou.toFixed(2)} (기준 ${MAX_IOU} 이하) | 색도 형태도 안 갈린다${r.worstType !== 'normal' ? ` · 최악 ${CVD_LABEL[r.worstType]}` : ''} |`);
  }
  L.push('');
  L.push('> 고치는 방법은 셋 중 하나다:');
  L.push('> 1. **명도를 벌린다** — 색상만 바꾸면 축소·색각이상에서 다시 붙는다');
  L.push('> 2. **실루엣을 바꾼다** — 뿔·날개·무기 같은 외곽 요소. 축소에서 가장 오래 살아남는 신호다');
  L.push('> 3. **크기를 벌린다** — 같은 종류의 적이면 대/소로 나눈다');
}

L.push('## [증거]\n```');
L.push(['쌍'.padEnd(34), '평균dE'.padStart(7), '우세dE'.padStart(7), '실루엣IoU'.padStart(10), '색', '형태', '판정'].join('  '));
L.push('-'.repeat(78));
for (const r of rows) {
  L.push([
    `${r.a} / ${r.b}`.padEnd(34),
    r.deMean.toFixed(1).padStart(7),
    r.deDom.toFixed(1).padStart(7),
    r.iou.toFixed(2).padStart(10),
    (r.byColor ? 'O' : 'X').padStart(2),
    (r.byShape ? 'O' : 'X').padStart(4),
    r.ok ? '구분' : '**안됨**',
  ].join('  '));
}
L.push('```\n');
L.push('캐릭터별 대표색(게임 크기 축소 후):');
L.push('```');
for (const m of valid) L.push(`  ${m.name.padEnd(18)} 평균 ${m.hex}  우세 ${m.dominHex}  ${m.gs}px  가로세로비 ${m.aspect.toFixed(2)}`);
L.push('```\n');

L.push('## [기준]');
L.push(`색 dE ≥ ${MIN_DE} **또는** 실루엣 IoU ≤ ${MAX_IOU}. 게임 크기로 줄인 뒤 잰다.`);
L.push(CVD ? '색 거리는 정상 시야 + 색각이상 4종 중 **가장 나쁜 값**을 쓴다.' : '색 거리는 정상 시야만 잰다 — `--cvd` 로 색각이상을 포함해라.');
L.push('');
L.push('## [공백]');
if (empty.length) L.push(`- 빈 이미지 ${empty.length}장 제외: ${empty.join(', ')}`);
if (!CVD) L.push('- **색각이상을 안 봤다.** `--cvd` 를 주면 적/녹색맹에서도 갈리는지 함께 잰다.');
if (!SIZES) L.push(`- 전부 ${SIZE}px 로 가정했다. 실제 크기가 다르면 \`--sizes\` 로 줘라 — 크기 차이 자체가 구분 신호다.`);
L.push('- **정지 이미지만 본다.** 움직임(대기 동작·이동 속도)으로 구분되는 것은 판정 밖이다.');
L.push('- 색은 **평균색과 우세색** 둘 다 보고 큰 쪽을 쓴다. 그래도 아주 작은 포인트 컬러(눈·보석 하이라이트)는 축소에서 사라져 반영되지 않는다.');
L.push('- 실루엣 IoU 는 bbox 정규화라 **크기 차이를 무시한다**. 크기로 구분되는 쌍은 `--sizes` 의 px 값을 함께 본다.');
L.push('- 이 판정은 "다르게 보이나"다. **알아보기 쉬운가**(아이콘 관습·역할 연상)는 사람 몫이다.\n');
L.push('## [잔여 위험]');
L.push(bad.length ? '- 위 쌍은 형태·아이콘 등 다른 신호가 없으면 실전에서 오인된다.' : '- (통과했지만 남는 위험을 여기 적는다.)');

const report = L.join('\n');
console.log(report);
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'cast-distinct.md'), report);
  fs.writeFileSync(path.join(OUT, 'cast-distinct.json'), JSON.stringify({
    root, size: SIZES || SIZE, minDe: MIN_DE, maxIou: MAX_IOU, cvd: CVD,
    characters: valid.map((m) => ({ name: m.name, meanHex: m.hex, dominantHex: m.dominHex, px: m.gs, aspect: +m.aspect.toFixed(3) })),
    pairs: rows.map((r) => ({ a: r.a, b: r.b, de: +r.de.toFixed(1), deMean: +r.deMean.toFixed(1), deDominant: +r.deDom.toFixed(1), worstType: r.worstType, iou: +r.iou.toFixed(3), ok: r.ok })),
  }, null, 2));
  console.log(`\n-> ${OUT}/cast-distinct.md · cast-distinct.json`);
}
if (bad.length) process.exit(1);
