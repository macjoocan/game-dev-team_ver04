#!/usr/bin/env node
// scan-textures.mjs - Unity 를 열지 않고 텍스처 예산을 실측한다.
//   node scan-textures.mjs <Assets 경로> [--baseline budget-baseline.json] [--top 15] [--json out.json]
//
// .meta 의 임포트 설정 + 이미지 헤더만 읽는다. 외부 의존 없음.
// 재는 것: 원본 파일 크기 · 해상도 · 압축 포맷 · maxTextureSize · 밉맵 · 추정 VRAM
// 잡는 것: 무압축(RGBA32) · 과대 해상도 · 4의 배수 아님(ASTC 불가) · UI 밉맵 낭비

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const root = args[0];
if (!root || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node scan-textures.mjs <Assets 경로> [--baseline f.json] [--top N] [--json out.json]');
  console.error('       [--only <정규식>]  대상 한정 (예: --only "/Project/")');
  console.error('       [--exclude <정규식>]  기본: /(Editor|Editor Default Resources|Gizmos)/');
  console.error('       [--no-exclude]  제외 없이 전부');
  process.exit(2);
}
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const TOP = Number(opt('--top', 15));
const BASELINE = opt('--baseline', null);
const JSON_OUT = opt('--json', null);
// 빌드에 안 들어가는 것(에디터 전용)과 3rd-party SDK 는 기본으로 뺀다.
// 안 빼면 경고 수천 건이 남의 SDK 아이콘으로 채워져 우리 에셋 신호가 묻힌다.
const DEFAULT_EXCLUDE = '/(Editor|Editor Default Resources|Gizmos)/';
const EXCLUDE = new RegExp(opt('--exclude', DEFAULT_EXCLUDE));
const ONLY = args.includes('--only') ? new RegExp(opt('--only', '.')) : null;
const NO_EXCLUDE = args.includes('--no-exclude');

const IMG = new Set(['.png', '.jpg', '.jpeg', '.tga', '.psd', '.exr', '.gif', '.bmp']);

// ── 이미지 크기 읽기 (헤더만) ────────────────────────────────────────────────
function dims(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(32);
    fs.readSync(fd, b, 0, 32, 0);
    const ext = path.extname(file).toLowerCase();
    if (ext === '.png' && b.toString('ascii', 1, 4) === 'PNG') {
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    if (ext === '.tga') {
      return { w: b.readUInt16LE(12), h: b.readUInt16LE(14) };
    }
    if (ext === '.jpg' || ext === '.jpeg') return jpegDims(fd);
  } catch { /* 못 읽으면 null */ } finally { if (fd !== undefined) fs.closeSync(fd); }
  return null;
}

function jpegDims(fd) {
  const buf = Buffer.alloc(4);
  let pos = 2;
  for (;;) {
    if (fs.readSync(fd, buf, 0, 4, pos) < 4) return null;
    if (buf[0] !== 0xff) return null;
    const marker = buf[1];
    const len = buf.readUInt16BE(2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const sof = Buffer.alloc(5);
      fs.readSync(fd, sof, 0, 5, pos + 4);
      return { h: sof.readUInt16BE(1), w: sof.readUInt16BE(3) };
    }
    pos += 2 + len;
  }
}

// ── .meta 파싱 (필요한 키만; YAML 파서 없이) ──────────────────────────────────
function readMeta(file) {
  const p = file + '.meta';
  if (!fs.existsSync(p)) return null;
  const t = fs.readFileSync(p, 'utf8');
  const head = t.slice(0, t.indexOf('platformSettings') >>> 0 || t.length);
  const num = (re, src = head) => { const m = re.exec(src); return m ? Number(m[1]) : null; };

  // platformSettings 는 buildTarget 마다 자기 블록을 갖는다. 블록 단위로 끊어 읽는다 —
  // 전역 정규식으로 첫 값만 집으면 DefaultTexturePlatform 값을 Android 값으로 착각한다.
  const platforms = [];
  const re = /buildTarget:\s*(\S+)([\s\S]*?)(?=\n\s*-\s*serializedVersion:|\n\s*[a-zA-Z]+:\s*$|$)/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const body = m[2];
    const g = (k) => { const x = new RegExp(`\\b${k}:\\s*(-?\\d+)`).exec(body); return x ? Number(x[1]) : null; };
    platforms.push({
      target: m[1],
      maxSize: g('maxTextureSize'),
      format: g('textureFormat'),      // -1 = Automatic
      compression: g('textureCompression'), // 0=Uncompressed 1=Normal 2=HQ 3=LQ
      overridden: g('overridden'),
    });
  }
  return {
    isTexture: /TextureImporter:/.test(t),
    type: num(/\btextureType:\s*(\d+)/, t),   // 8 = Sprite(2D and UI)
    mipmaps: num(/\benableMipMap:\s*(\d+)/, t),
    crunch: num(/\bcrunchedCompression:\s*(\d+)/, t),
    platforms,
  };
}

// 모바일에서 실제로 적용될 설정을 고른다: 해당 플랫폼이 override 했으면 그것, 아니면 Default.
function effective(meta, target = 'Android') {
  if (!meta) return null;
  const p = meta.platforms.find((x) => x.target === target);
  if (p && p.overridden === 1) return p;
  return meta.platforms.find((x) => x.target === 'DefaultTexturePlatform') || p || null;
}

// bit/pixel 추정. **정본은 엔진 빌드 리포트다** — 여기서는 규모와 이상치만 본다.
function bpp(meta) {
  const e = effective(meta);
  if (!e) return { v: 32, why: 'meta 없음' };
  if (e.format !== null && e.format > 0) {
    if (e.format >= 47) return { v: 8, why: 'ASTC 계열' };
    if (e.format >= 30) return { v: 4, why: 'ETC2/PVRTC 계열' };
    return { v: 8, why: '명시 포맷' };
  }
  // Automatic(-1): textureCompression 이 결정한다
  if (e.compression === 0) return { v: 32, why: 'Uncompressed' };
  if (e.compression === 2) return { v: 8, why: 'CompressedHQ' };
  return { v: 8, why: 'Compressed' };
}

// ── 수집 ─────────────────────────────────────────────────────────────────────
const rows = [];
let excluded = 0;
(function walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!IMG.has(path.extname(e.name).toLowerCase())) continue;
    const relPath = '/' + path.relative(root, p).split(path.sep).join('/');
    if (!NO_EXCLUDE && EXCLUDE.test(relPath)) { excluded++; continue; }
    if (ONLY && !ONLY.test(relPath)) { excluded++; continue; }
    const meta = readMeta(p);
    const d = dims(p);
    const size = fs.statSync(p).size;
    const b = bpp(meta);
    const px = d ? d.w * d.h : 0;
    const mipFactor = meta && meta.mipmaps ? 1.333 : 1;
    rows.push({
      file: relPath.slice(1),
      bytes: size,
      w: d ? d.w : null,
      h: d ? d.h : null,
      bpp: b.v,
      why: b.why,
      vram: Math.round((px * b.v / 8) * mipFactor),
      meta,
    });
  }
})(root);

if (rows.length === 0) {
  console.log(`\n스캔 대상 이미지가 없다: ${root}\n`);
  process.exit(0);
}

// ── 경고 규칙 ────────────────────────────────────────────────────────────────
const warn = { uncompressed: [], notMul4: [], oversized: [], mipUI: [], noMeta: [] };
for (const r of rows) {
  if (!r.meta) { warn.noMeta.push(r); continue; }
  if (r.bpp === 32) warn.uncompressed.push(r);
  if (r.w && (r.w % 4 || r.h % 4)) warn.notMul4.push(r);
  if (r.w && Math.max(r.w, r.h) > 2048) warn.oversized.push(r);
  if (r.meta.type === 8 && r.meta.mipmaps) warn.mipUI.push(r);
}

const totalBytes = rows.reduce((a, r) => a + r.bytes, 0);
const totalVram = rows.reduce((a, r) => a + r.vram, 0);
const mb = (n) => (n / 1048576).toFixed(1) + 'MB';

// ── 출력 ─────────────────────────────────────────────────────────────────────
console.log(`\n텍스처 스캔 — ${root}`);
console.log(`  이미지 ${rows.length}장 · 원본 합계 ${mb(totalBytes)} · 추정 VRAM ${mb(totalVram)} (추정 — 정본은 빌드 리포트)`);
if (excluded) console.log(`  제외 ${excluded}장 (${NO_EXCLUDE ? '' : EXCLUDE.source}${ONLY ? ` / --only ${ONLY.source}` : ''}) — 빌드에 안 들어가거나 대상 밖`);

if (BASELINE && fs.existsSync(BASELINE)) {
  const b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const dC = rows.length - b.count, dB = totalBytes - b.bytes, dV = totalVram - b.vram;
  const sign = (n) => (n >= 0 ? '+' : '');
  console.log(`  직전 대비 — 장수 ${sign(dC)}${dC} · 원본 ${sign(dB)}${mb(Math.abs(dB))} · VRAM ${sign(dV)}${mb(Math.abs(dV))}`);
} else if (BASELINE) {
  console.log(`  (baseline 없음 — 이번 결과를 ${BASELINE} 로 저장하면 다음부터 델타가 나온다)`);
}

const label = { uncompressed: '무압축(RGBA32 추정) — VRAM 4배', notMul4: '가로/세로가 4의 배수 아님 — ASTC 불가', oversized: '2048 초과 해상도', mipUI: 'Sprite(UI)인데 밉맵 켜짐 — 33% 낭비', noMeta: '.meta 없음 — 임포트 설정 확인 불가' };
console.log(`\n경고`);
let any = false;
for (const k of Object.keys(warn)) {
  if (!warn[k].length) continue;
  any = true;
  console.log(`  [${warn[k].length}] ${label[k]}`);
  for (const r of warn[k].slice(0, 5)) console.log(`      ${r.file} (${r.w}x${r.h}, ${mb(r.bytes)}, ${r.why})`);
  if (warn[k].length > 5) console.log(`      ... 외 ${warn[k].length - 5}개`);
}
if (!any) console.log('  없음');

console.log(`\nVRAM 상위 ${TOP}`);
for (const r of [...rows].sort((a, b) => b.vram - a.vram).slice(0, TOP)) {
  console.log(`  ${mb(r.vram).padStart(8)}  ${String(r.w) + 'x' + r.h}`.padEnd(26) + `  ${r.file}`);
}

const out = { count: rows.length, bytes: totalBytes, vram: totalVram, warnings: Object.fromEntries(Object.entries(warn).map(([k, v]) => [k, v.length])) };
if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 2)); console.log(`\n결과 저장: ${JSON_OUT}`); }
console.log('');
