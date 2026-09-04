#!/usr/bin/env node
// asset-baseline.mjs - 에셋 불변식을 스냅샷하고, 재생성 후 의도치 않은 변화를 잡는다.
//
//   node asset-baseline.mjs snap  <에셋폴더> --out baseline.json
//   node asset-baseline.mjs check <에셋폴더> --baseline baseline.json
//
// **범위를 정직하게 그어둔다.** 화면 수준 비주얼 회귀(스크린샷 diff)는 게임이 실제로 돌아야
// 하므로 **프로젝트 몫**이다(Playwright·엔진 테스트). 플러그인이 엔진 무관하게 할 수 있는 건
// **에셋 파일 수준의 불변식** 뿐이다 - 크기·알파 경계·피벗·9-slice 보더·해시.
//
// 왜 필요한가: 생성 도구(ui-kit-gen·fx-gen·sprite 파이프라인)로 에셋을 재생성하면 스펙을
// 조금 고쳤을 때 **의도한 것 외의 것도 같이 바뀐다.** 크기가 1px 달라지거나 피벗이 밀리면
// 엔진에서 정렬이 깨지는데, 눈으로는 안 보인다. 그걸 기계가 잡는다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { textTable } from '../../../scripts/lib-stats.mjs';

const args = process.argv.slice(2);
const mode = args[0];
const target = args[1];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

if (!mode || !['snap', 'check'].includes(mode) || !target || target.startsWith('--')) {
  console.error('usage:');
  console.error('  node asset-baseline.mjs snap  <에셋폴더> --out baseline.json');
  console.error('  node asset-baseline.mjs check <에셋폴더> --baseline baseline.json [--tolerate-hash]');
  console.error('');
  console.error('  --tolerate-hash  픽셀 해시 변화는 경고로만 (크기·피벗·알파 변화는 여전히 오류)');
  process.exit(2);
}

// ── 에셋 측정 ────────────────────────────────────────────────────────────────

/** 알파가 있는 픽셀의 바운딩 박스와 무게중심. 피벗이 밀렸는지를 이걸로 잡는다. */
function alphaMetrics(img) {
  const { width: w, height: h, data } = img;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let sumX = 0, sumY = 0, sumA = 0, opaque = 0, semi = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      sumX += x * a; sumY += y * a; sumA += a;
      if (a === 255) opaque++; else semi++;
    }
  }
  if (maxX < 0) return { empty: true };
  return {
    empty: false,
    bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    // 무게중심을 0~1 상대 좌표로 - 캔버스가 바뀌어도 비교 가능하게
    centroid: { x: +(sumX / sumA / w).toFixed(4), y: +(sumY / sumA / h).toFixed(4) },
    opaque,
    semi,
    coverage: +((opaque + semi) / (w * h)).toFixed(4),
  };
}

function measureAsset(file) {
  const stat = fs.statSync(file);
  const bytes = fs.readFileSync(file);
  const rec = {
    bytes: stat.size,
    hash: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16),
  };
  if (/\.png$/i.test(file)) {
    try {
      const img = readPNG(file);
      rec.width = img.width;
      rec.height = img.height;
      Object.assign(rec, alphaMetrics(img));
    } catch (e) {
      rec.error = e.message;
    }
  }
  return rec;
}

/** manifest.json 이 있으면 9-slice 보더·피벗을 함께 스냅샷한다 (엔진 정렬의 핵심 값이다). */
function readManifest(dir) {
  const p = path.join(dir, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    const out = {};
    for (const s of m.sprites || m.effects || []) {
      if (!s.name) continue;
      out[s.name] = {
        nineSlice: s.nineSlice ?? null,
        pivot: s.pivot ?? null,
        frames: s.frames ?? null,
        fps: s.fps ?? null,
      };
    }
    return out;
  } catch { return null; }
}

function scan(dir) {
  const files = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name === 'manifest.json' || e.name === 'baseline.json') continue;
      const rel = path.relative(dir, p).split(path.sep).join('/');
      files[rel] = measureAsset(p);
    }
  };
  if (!fs.existsSync(dir)) { console.error(`폴더가 없다: ${dir}`); process.exit(3); }
  walk(dir);
  return { files, manifest: readManifest(dir) };
}

// ── snap ─────────────────────────────────────────────────────────────────────
if (mode === 'snap') {
  const outPath = opt('--out', 'baseline.json');
  const snapshot = scan(target);
  const n = Object.keys(snapshot.files).length;
  fs.writeFileSync(outPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    root: target,
    count: n,
    ...snapshot,
  }, null, 2));
  console.log('');
  console.log(`베이스라인 저장: ${n}개 에셋 -> ${outPath}`);
  console.log(snapshot.manifest
    ? `manifest 에서 9-slice·피벗도 함께 스냅샷했다 (${Object.keys(snapshot.manifest).length}개)`
    : 'manifest.json 이 없어 9-slice·피벗은 스냅샷하지 못했다.');
  console.log('');
  console.log('**이 파일을 커밋해라.** 에셋을 재생성한 뒤 check 로 대조한다.');
  process.exit(0);
}

// ── check ────────────────────────────────────────────────────────────────────
const basePath = opt('--baseline', 'baseline.json');
if (!fs.existsSync(basePath)) {
  console.error(`베이스라인이 없다: ${basePath}`);
  console.error('먼저 snap 으로 만들어라: node asset-baseline.mjs snap <폴더> --out baseline.json');
  process.exit(3);
}
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const now = scan(target);
const tolerateHash = args.includes('--tolerate-hash');

const errors = [];   // 엔진 정렬을 깨는 변화
const warns = [];    // 픽셀만 바뀐 변화
const added = [];
const removed = [];

for (const key of Object.keys(now.files)) if (!base.files[key]) added.push(key);
for (const key of Object.keys(base.files)) if (!now.files[key]) removed.push(key);

const rows = [];
for (const [key, b] of Object.entries(base.files)) {
  const a = now.files[key];
  if (!a) continue;
  const diffs = [];

  if (b.width !== undefined && (a.width !== b.width || a.height !== b.height)) {
    diffs.push({ kind: '크기', from: `${b.width}x${b.height}`, to: `${a.width}x${a.height}`, hard: true });
  }
  if (b.bbox && a.bbox && (a.bbox.w !== b.bbox.w || a.bbox.h !== b.bbox.h)) {
    diffs.push({ kind: '알파 경계', from: `${b.bbox.w}x${b.bbox.h}`, to: `${a.bbox.w}x${a.bbox.h}`, hard: true });
  }
  if (b.centroid && a.centroid) {
    const dx = Math.abs(a.centroid.x - b.centroid.x);
    const dy = Math.abs(a.centroid.y - b.centroid.y);
    // 0.5% 넘게 무게중심이 밀리면 엔진에서 정렬이 눈에 보이게 어긋난다
    if (dx > 0.005 || dy > 0.005) {
      diffs.push({ kind: '무게중심', from: `${b.centroid.x},${b.centroid.y}`, to: `${a.centroid.x},${a.centroid.y}`, hard: true });
    }
  }
  if (b.empty === false && a.empty === true) diffs.push({ kind: '내용 소실', from: '있음', to: '**빈 이미지**', hard: true });
  if (a.error) diffs.push({ kind: '읽기 실패', from: '-', to: a.error, hard: true });

  if (a.hash !== b.hash) {
    diffs.push({ kind: '픽셀', from: b.hash, to: a.hash, hard: false });
  }

  if (diffs.length) {
    rows.push({ key, diffs });
    for (const d of diffs) (d.hard ? errors : warns).push({ key, ...d });
  }
}

// manifest 비교 — 9-slice·피벗은 값이 조금 달라도 늘렸을 때 깨진다
const manifestDiffs = [];
if (base.manifest && now.manifest) {
  for (const [name, b] of Object.entries(base.manifest)) {
    const a = now.manifest[name];
    if (!a) { manifestDiffs.push({ name, kind: '항목 삭제' }); continue; }
    const j = (v) => JSON.stringify(v);
    if (j(a.nineSlice) !== j(b.nineSlice)) manifestDiffs.push({ name, kind: '9-slice', from: j(b.nineSlice), to: j(a.nineSlice) });
    if (j(a.pivot) !== j(b.pivot)) manifestDiffs.push({ name, kind: '피벗', from: j(b.pivot), to: j(a.pivot) });
    if (a.frames !== b.frames) manifestDiffs.push({ name, kind: '프레임 수', from: b.frames, to: a.frames });
    if (a.fps !== b.fps) manifestDiffs.push({ name, kind: 'fps', from: b.fps, to: a.fps });
  }
}

const hardCount = errors.length + manifestDiffs.length;
const verdict = hardCount ? '미달' : (warns.length && !tolerateHash) ? '조건부' : '충족';

// ── 출력 ─────────────────────────────────────────────────────────────────────
console.log('');
console.log('# 에셋 회귀 판정');
console.log('');
console.log(`베이스라인 ${base.count}개 (${base.createdAt?.slice(0, 10) ?? '?'}) vs 현재 ${Object.keys(now.files).length}개`);
console.log('');
console.log('## [주장]');
console.log(`판정: **${verdict}**` +
  (hardCount ? ` — 엔진 정렬을 깨는 변화 ${hardCount}건` : warns.length ? ` — 픽셀만 바뀐 항목 ${warns.length}건` : ''));
console.log('');

if (errors.length) {
  console.log('## [발견] 정렬을 깨는 변화 — 여기부터 본다');
  console.log('');
  console.log(textTable(['에셋', '항목', '이전', '현재'], errors.map((e) => [e.key, e.kind, String(e.from), String(e.to)])));
  console.log('');
  console.log('> 크기·알파 경계·무게중심이 바뀌면 엔진에서 스프라이트가 밀린다. 눈으로는 잘 안 보이고');
  console.log('> 실기기에서 어긋난다. 의도한 변경이면 베이스라인을 다시 snap 해라.');
  console.log('');
}
if (manifestDiffs.length) {
  console.log('## [발견] manifest 변화 (9-slice·피벗·프레임)');
  console.log('');
  console.log(textTable(['에셋', '항목', '이전', '현재'], manifestDiffs.map((d) => [d.name, d.kind, String(d.from ?? '-'), String(d.to ?? '-')])));
  console.log('');
  console.log('> 9-slice 보더가 바뀌면 늘렸을 때 테두리가 깨진다. 프레임 수·fps 가 바뀌면 애니메이션');
  console.log('> 타이밍이 바뀐다 — 둘 다 정적 스크린샷으로는 안 잡힌다.');
  console.log('');
}
if (warns.length) {
  console.log(`## [발견] 픽셀만 바뀐 항목 ${warns.length}개`);
  console.log(warns.slice(0, 15).map((w) => '- ' + w.key).join('\n'));
  if (warns.length > 15) console.log(`- ... 외 ${warns.length - 15}개`);
  console.log('');
  console.log('> 규격은 그대로이고 그림만 바뀌었다. 팔레트를 고쳤다면 정상이다.');
  console.log('> **의도한 변경인지는 사람이 판정한다** — 보이는 것은 `visual-qa` 소관이다.');
  console.log('');
}
if (added.length || removed.length) {
  console.log('## [발견] 추가·삭제');
  if (added.length) console.log(`- 추가 ${added.length}개: ${added.slice(0, 10).join(', ')}${added.length > 10 ? ' ...' : ''}`);
  if (removed.length) console.log(`- **삭제 ${removed.length}개**: ${removed.slice(0, 10).join(', ')}${removed.length > 10 ? ' ...' : ''}`);
  if (removed.length) console.log('  > 삭제된 에셋을 코드가 참조하고 있으면 런타임에 깨진다. manifest ID 를 확인해라.');
  console.log('');
}
if (verdict === '충족') console.log('변화 없음 — 크기·알파·무게중심·manifest·픽셀 전부 동일.', '');

console.log('## [공백]');
console.log('- **화면 수준 비주얼 회귀는 이 도구 범위 밖이다.** 에셋 파일은 같아도 화면에서');
console.log('  겹침·레이아웃이 깨질 수 있다 — 그건 프로젝트의 스크린샷 테스트(Playwright·엔진) 몫이다.');
console.log('- **보기 좋은가는 판정하지 않는다.** 규격 동일성만 본다 (`visual-qa` 가 보이는 것을 본다).');
console.log('- PNG 만 픽셀 단위로 본다. 그 외 파일은 크기·해시만 비교한다.');
if (!base.manifest) console.log('- 베이스라인에 manifest 가 없어 9-slice·피벗 변화를 못 잡았다.');
console.log('');

if (verdict === '미달') process.exit(1);
if (verdict === '조건부') process.exit(0);
