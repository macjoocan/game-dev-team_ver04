#!/usr/bin/env node
// 엔진 공통 FX 제작. 0 생성 완료 / 2 사용법 / 3 입력·실행 확인 불가.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { writePNG, packStrip, hex } from '../../../scripts/lib-png.mjs';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { json, writeJSON, validateSpec, hash, bakeMotion, ringMesh, render3D } from './lib-fx-pipeline.mjs';
import { previewHTML } from './lib-fx-preview.mjs';

const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url));
if (args.length !== 3 || args[0].startsWith('-') || args[1] !== '--out' || !args[2]) {
  console.error('usage: node fx-build.mjs <spec.json> --out <새 폴더>'); process.exit(2);
}
try {
  const source = path.resolve(args[0]), dir = path.dirname(source), raw = json(source);
  if (typeof raw.palette !== 'string' || typeof raw.visualReference !== 'string') throw Error('palette와 visualReference 파일 경로가 필요하다');
  const paletteFile = path.resolve(dir, raw.palette), visualFile = path.resolve(dir, raw.visualReference);
  const palette = json(paletteFile), visual = fs.readFileSync(visualFile), spec = validateSpec(raw, palette), out = path.resolve(args[2]);
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw Error('출력 폴더가 비어 있지 않다. 새 버전 폴더를 지정한다');
  fs.mkdirSync(out, { recursive: true });
  writeJSON(path.join(out, 'source-spec.json'), { ...raw, palette: 'palette.json', visualReference: 'VISUAL_DESIGN.md' });
  fs.copyFileSync(paletteFile, path.join(out, 'palette.json')); fs.writeFileSync(path.join(out, 'VISUAL_DESIGN.md'), visual);
  const describe = rel => ({ path: rel, sha256: hash(fs.readFileSync(path.join(out, rel))) });
  const manifest = { schemaVersion: 1, status: 'concept', productionApproved: false, generator: 'fx-build', seed: raw.seed,
    coordinateSystem: { handedness: 'right', up: 'Y', forward: '+Z', units: 'meters' },
    provenance: { kind: 'procedural', sourceHash: hash(fs.readFileSync(source)), license: raw.license },
    sources: ['source-spec.json', 'palette.json', 'VISUAL_DESIGN.md'].map(describe), budgets: raw.budgets, effects: [] };
  const cards = [], contact = Buffer.alloc(4 * 144 * raw.effects.length * 144 * 4), bg = hex(spec.previewBg);
  const contactWidth = 4 * 144;
  for (let y = 0; y < raw.effects.length * 144; y++) for (let x = 0; x < contactWidth; x++) { const p = (y * contactWidth + x) * 4; contact[p] = bg[0]; contact[p + 1] = bg[1]; contact[p + 2] = bg[2]; contact[p + 3] = 255; }
  for (const [index, e] of spec.effects.entries()) {
    const target = path.join(out, e.id); fs.mkdirSync(target);
    const record = { ...e, duration: e.frames / e.fps, pivot: [0.5, 0.5], simulationSpace: 'local', depthWrite: false, alphaConvention: 'straight', status: 'concept', assets: [], logs: [] };
    let frames, size, motion;
    if (e.dimension === '2d') {
      const legacy = path.join(target, 'texture-spec.json');
      writeJSON(legacy, { previewBg: spec.previewBg, effects: [{ ...e, name: 'texture' }] });
      const r = spawnSync(process.execPath, [path.join(here, 'fx-gen.mjs'), legacy, '--out', target, '--palette', path.join(out, 'palette.json')], { encoding: 'utf8', timeout: 120000, windowsHide: true });
      fs.writeFileSync(path.join(target, 'build.log'), (r.stdout || '') + (r.stderr || ''));
      if (r.status !== 0) throw Error(e.id + ': 2D 생성 실패. build.log 확인');
      size = e.size;
      frames = Array.from({ length: e.frames }, (_, i) => readPNG(path.join(target, 'texture', `texture_${String(i).padStart(2, '0')}.png`)).data);
      record.sheet = e.id + '/texture_sheet.png';
      record.frameFiles = Array.from({ length: e.frames }, (_, i) => e.id + `/texture/texture_${String(i).padStart(2, '0')}.png`);
      record.runtimeTextures = [record.sheet];
    } else {
      motion = bakeMotion(e, raw.seed + index); size = 128;
      writeJSON(path.join(target, 'motion.json'), motion);
      writeJSON(path.join(target, 'ring.gltf'), ringMesh(e.segments, e.color));
      const extent = Math.max(e.worldSize, ...motion.samples.flatMap(s => s.particles.flatMap(p => p.position.map(Math.abs))));
      frames = motion.samples.map(s => render3D(s, e.color, size, extent));
      record.frameFiles = frames.map((buf, i) => { const rel = e.id + `/frame_${String(i).padStart(3, '0')}.png`; writePNG(path.join(out, rel), size, size, buf); return rel; });
      const strip = packStrip(frames, size, size); writePNG(path.join(target, 'preview_sheet.png'), strip.w, strip.h, strip.buf);
      const texture = Buffer.alloc(32 * 32 * 4), rgb = hex(e.color);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const j = (y * 32 + x) * 4; texture[j] = rgb[0]; texture[j + 1] = rgb[1]; texture[j + 2] = rgb[2]; texture[j + 3] = Math.round(Math.exp(-((x - 15.5) ** 2 + (y - 15.5) ** 2) / 28) * 255); }
      writePNG(path.join(target, 'particle.png'), 32, 32, texture);
      record.mesh = e.id + '/ring.gltf'; record.motion = e.id + '/motion.json'; record.sheet = e.id + '/preview_sheet.png';
      record.runtimeTextures = [e.id + '/particle.png']; record.previewExtent = extent;
    }
    const walk = rel => { for (const entry of fs.readdirSync(path.join(out, rel), { withFileTypes: true })) { const next = rel + '/' + entry.name; if (entry.isDirectory()) walk(next); else (entry.name.endsWith('.log') ? record.logs : record.assets).push(describe(next)); } };
    walk(e.id); manifest.effects.push(record);
    cards.push({ ...record, motion, sheetData: 'data:image/png;base64,' + fs.readFileSync(path.join(out, record.sheet)).toString('base64'), cellSize: size });
    for (let col = 0; col < 4; col++) {
      const buf = frames[Math.round(col * (frames.length - 1) / 3)];
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const from = (Math.floor(y * size / 128) * size + Math.floor(x * size / 128)) * 4;
        const to = ((index * 144 + y + 8) * contactWidth + col * 144 + x + 8) * 4, a = buf[from + 3] / 255;
        for (let k = 0; k < 3; k++) contact[to + k] = Math.min(255, Math.round(bg[k] + buf[from + k] * a));
      }
    }
  }
  writePNG(path.join(out, 'preview.png'), contactWidth, raw.effects.length * 144, contact);
  fs.writeFileSync(path.join(out, 'preview.html'), previewHTML(cards, spec.previewBg));
  manifest.previews = ['preview.png', 'preview.html'].map(describe);
  writeJSON(path.join(out, 'manifest.json'), manifest);
  console.log(`FX ${manifest.effects.length}종 생성: ${out}\n상태: concept. 규격 검사와 실제 화면 검수 전이다.`);
} catch (e) { console.error('측정 불가: ' + e.message); process.exit(3); }
