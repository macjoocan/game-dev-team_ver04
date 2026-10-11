#!/usr/bin/env node
// palette-fetch.mjs - Lospec 팔레트를 받아오고, **우리 캐스트에 맞는지 재서 고른다.**
//   node palette-fetch.mjs --slug endesga-32 --out pal.json
//   node palette-fetch.mjs --match <캐스트폴더> [--max-colors 32] [--out-dir pal-candidates]
//
// 왜 필요한가: `palette-force` 는 팔레트를 **먹이는** 도구지 **고르는** 도구가 아니다.
// 캐스트에서 k-means 로 뽑으면 그 캐스트의 평균일 뿐이고, 원본이 3D 렌더처럼 탁하면
// 탁한 24색이 나온다. 도트 화풍은 **색 선택 자체가 화풍**이라 거기서 안 생긴다.
//
// Lospec 팔레트는 수천 명이 실제로 써서 걸러진 것들이다. 아티스트가 없는 프로젝트에서
// "어떤 팔레트가 좋은가"를 우리가 판단할 근거는 없지만, **"어느 것이 우리 그림에 덜
// 손해인가"는 잴 수 있다.** 그게 이 도구가 하는 일이다.
//
// 판정 기준: 캐스트의 실제 픽셀을 각 후보 팔레트의 최근접 색으로 매핑했을 때의 **색 이동량**
// (CIE76 dE). 픽셀 수로 가중한다 — 한 점만 쓰인 색이 많이 틀리는 것보다 넓은 면이
// 조금 틀리는 쪽이 눈에 더 띈다.
//
// 이 도구는 **고르지 않는다.** 순위와 수치를 내놓고 사람이 고른다. 1등이 항상 정답이 아니다 —
// dE 가 낮다는 건 "원본과 가깝다"는 뜻이지 "도트로 더 낫다"가 아니다. 원본이 별로면
// 원본에 가까운 게 나쁜 선택이다.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { toLab } from '../../../scripts/lib-color.mjs';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node palette-fetch.mjs --slug <lospec-slug> --out <pal.json>');
  console.error('       node palette-fetch.mjs --match <캐스트폴더|png...> [--max-colors 32] [--out-dir dir]');
  console.error('  --slug        Lospec 팔레트 하나를 받아 저장한다 (출처·저자 기록 포함)');
  console.error('  --match       캐스트에 대한 후보 팔레트 적합도를 재서 순위를 낸다');
  console.error('  --candidates  후보 슬러그 목록 파일(줄바꿈 구분). 없으면 아래 기본 목록을 쓴다');
  console.error('  --max-colors  이 수를 넘는 팔레트는 후보에서 뺀다 (기본 32 — 도트 계약 상한)');
  process.exit(2);
}

// 기본 후보. **하드코딩이 아니라 출발점**이고 `--candidates` 로 갈아끼운다.
// 손으로 관리하는 목록은 샌다(REVIEW B-16 ④) — 그래서 "이게 전부"라고 주장하지 않는다.
// Lospec 에는 수천 개가 있고 여기 12개는 널리 쓰이는 것들일 뿐이다.
const DEFAULT_CANDIDATES = [
  'pico-8', 'sweetie-16', 'endesga-32', 'resurrect-64', 'apollo', 'nyx8',
  'vinik24', 'na16', 'fantasy-24', 'slso8', 'dawnbringer-32', 'journey',
];

const UA = { 'User-Agent': 'game-dev-team-char-art (+https://github.com/macjoocan/game-dev-team_ver04)' };

async function fetchPalette(slug) {
  const url = `https://lospec.com/palette-list/${encodeURIComponent(slug)}.json`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${slug}: HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j.colors) || !j.colors.length) throw new Error(`${slug}: colors 가 비었다`);
  return {
    name: j.name || slug,
    author: j.author || '',
    slug,
    source: url,
    // 팔레트는 색 목록이라 저작권 대상이 되기 어렵지만, **출처와 저자는 남긴다.**
    // 이 레포는 출처 없는 에셋을 프로덕션에 넣지 않는 규칙이 있다.
    sourceSite: 'https://lospec.com/palette-list',
    fetchedAt: new Date().toISOString(),
    colors: j.colors.map((c) => (String(c)[0] === '#' ? String(c) : '#' + String(c)).toLowerCase()),
  };
}

const labDist = (a, b) => Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);

// 캐스트의 **색별 픽셀 수**를 센다. 전 픽셀을 들고 다니면 메모리가 터진다.
function castColorHistogram(inputs) {
  const hist = new Map();
  for (const f of inputs) {
    const img = readPNG(f);
    for (let p = 0; p < img.width * img.height; p++) {
      const o = p * 4;
      if (img.data[o + 3] <= 127) continue;
      const key = (img.data[o] << 16) | (img.data[o + 1] << 8) | img.data[o + 2];
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  }
  return [...hist.entries()].map(([k, n]) => ({
    rgb: { r: ((k >> 16) & 255) / 255, g: ((k >> 8) & 255) / 255, b: (k & 255) / 255 },
    n,
  }));
}

function fit(histLab, totalPx, palette) {
  const pal = palette.colors.map((h) => toLab({
    r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255,
  }));
  let sum = 0, worst = 0, over10 = 0;
  const used = new Set();
  for (const e of histLab) {
    let bd = Infinity, bi = 0;
    for (let i = 0; i < pal.length; i++) { const d = labDist(e.lab, pal[i]); if (d < bd) { bd = d; bi = i; } }
    used.add(bi);
    sum += bd * e.n;
    if (bd > worst) worst = bd;
    if (bd > 10) over10 += e.n;   // dE 10 = "확실히 다른 색"(lib-color 의 DELTA_E_MIN)
  }
  return {
    meanDe: sum / totalPx,
    worstDe: worst,
    over10Ratio: over10 / totalPx,
    usedColors: used.size,
    totalColors: pal.length,
  };
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
const SLUG = opt('--slug');
const MATCH = args.includes('--match');

try {
  if (SLUG) {
    const pal = await fetchPalette(SLUG);
    const out = opt('--out', `${SLUG}.json`);
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(pal, null, 2) + '\n');
    console.log(`${pal.name} · ${pal.colors.length}색${pal.author ? ' · ' + pal.author : ''} -> ${out}`);
    console.log(`출처 ${pal.source}`);
    console.log(`\n바로 먹이려면: node palette-force.mjs <폴더> --out forced --palette ${out}`);
    process.exit(0);
  }

  if (!MATCH) { console.error('--slug 또는 --match 중 하나가 필요하다.'); process.exit(2); }

  // 입력 모으기
  const mi = args.indexOf('--match');
  const targets = [];
  for (let i = mi + 1; i < args.length && !args[i].startsWith('--'); i++) targets.push(args[i]);
  const inputs = [];
  for (const t of targets) {
    if (!fs.existsSync(t)) continue;
    if (fs.statSync(t).isDirectory()) {
      for (const f of fs.readdirSync(t)) if (f.toLowerCase().endsWith('.png')) inputs.push(path.join(t, f));
    } else if (t.toLowerCase().endsWith('.png')) inputs.push(t);
  }
  if (!inputs.length) { console.error('입력 PNG 가 없다.'); process.exit(2); }

  const MAXC = Number(opt('--max-colors', 32));
  const candFile = opt('--candidates');
  const slugs = candFile
    ? fs.readFileSync(candFile, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))
    : DEFAULT_CANDIDATES;

  const hist = castColorHistogram(inputs);
  const totalPx = hist.reduce((a, e) => a + e.n, 0);
  const histLab = hist.map((e) => ({ lab: toLab(e.rgb), n: e.n }));
  console.log(`캐스트 ${inputs.length}장 · 불투명 ${totalPx}px · 고유색 ${hist.length}개`);
  console.log(`후보 ${slugs.length}개 (${MAXC}색 이하만 채점)\n`);

  const outDir = opt('--out-dir', null);
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  const rows = [];
  for (const slug of slugs) {
    let pal;
    try { pal = await fetchPalette(slug); }
    catch (e) { console.log(`  ? ${slug.padEnd(16)} 받기 실패 — ${e.message}`); continue; }
    if (pal.colors.length > MAXC) { console.log(`  - ${slug.padEnd(16)} ${pal.colors.length}색 — 상한 ${MAXC} 초과로 제외`); continue; }
    const f = fit(histLab, totalPx, pal);
    rows.push({ slug, pal, ...f });
    if (outDir) fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(pal, null, 2) + '\n');
  }
  if (!rows.length) { console.error('채점된 후보가 없다 — 네트워크 또는 --max-colors 를 확인해라.'); process.exit(3); }

  rows.sort((a, b) => a.meanDe - b.meanDe);
  console.log('\n# 적합도 (색 이동량이 작을수록 원본에 가깝다)\n');
  console.log('순위  팔레트            색   쓰인색  평균dE  최악dE  dE>10 비율');
  rows.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(3)}.  ${r.slug.padEnd(16)} ${String(r.totalColors).padStart(3)}  ` +
      `${String(r.usedColors).padStart(5)}  ${r.meanDe.toFixed(2).padStart(6)}  ` +
      `${r.worstDe.toFixed(1).padStart(6)}  ${(r.over10Ratio * 100).toFixed(1).padStart(8)}%`
    );
  });

  console.log('\n## 읽는 법');
  console.log('- **평균dE** 가 낮다 = 원본 색에서 덜 움직인다. **"도트로 더 낫다"는 뜻이 아니다.**');
  console.log('  원본이 별로면 원본에 가까운 것이 나쁜 선택이다 — 3D 렌더처럼 탁한 원본이 그렇다.');
  console.log('- **쓰인색/색** 이 낮으면 팔레트를 놀린다. 32색 중 12색만 쓰면 16색짜리를 쓰는 편이 낫다.');
  console.log('- **dE>10 비율** 은 "확실히 다른 색"으로 바뀐 픽셀의 넓이다. 여기가 크면 의상색이 뒤집힌다.');
  console.log('\n**이 도구는 고르지 않는다.** 두세 개를 실제로 먹여보고 사람이 눈으로 고른다:');
  console.log(`  node palette-force.mjs <폴더> --out forced-<slug> --palette ${outDir || '<받은 pal.json>'}/<slug>.json`);
  if (!outDir) console.log('  (--out-dir 을 주면 후보 팔레트를 파일로 남긴다)');
} catch (e) {
  // 네트워크 실패는 "팔레트가 나쁘다"가 아니라 **측정 불가**다.
  console.error(`실패: ${e.message}`);
  console.error('판정이 아니라 측정 실패다 — 네트워크나 Lospec 가용성을 확인해라.');
  process.exit(3);
}
