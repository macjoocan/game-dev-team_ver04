import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveTokens } from '../../../scripts/lib-palette.mjs';
import { hex } from '../../../scripts/lib-png.mjs';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function writeJSON(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const integer = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
export function validateSpec(raw, palette) {
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.effects) || !raw.effects.length || raw.effects.length > 16) throw Error('schemaVersion=1, effects 1~16개가 필요하다');
  if (!Number.isSafeInteger(raw.seed) || typeof raw.license !== 'string' || !raw.license.trim()) throw Error('고정 seed와 license가 필요하다');
  if (!raw.budgets || !['textureBytes', 'particles', 'triangles'].every(k => positive(raw.budgets[k]))) throw Error('텍스처·파티클·삼각형 예산이 필요하다');
  if (typeof raw.previewBg !== 'string' || !raw.previewBg.startsWith('@')) throw Error('배경색은 팔레트 토큰이어야 한다');
  const ids = new Set();
  for (const e of raw.effects) {
    if (typeof e.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(e.id) || ids.has(e.id)) throw Error('이펙트 ID가 잘못됐거나 중복됐다');
    ids.add(e.id);
    if (!['2d', '3d'].includes(e.dimension) || !integer(e.frames, 2, 120) || !integer(e.fps, 1, 60) || typeof e.loop !== 'boolean') throw Error(e.id + ': 차원·프레임·fps·loop 형식 오류');
    if (!positive(e.worldSize) || e.worldSize > 100 || e.blend !== 'additive' || typeof e.color !== 'string' || !e.color.startsWith('@')) throw Error(e.id + ': worldSize와 additive 블렌드, 색 토큰이 필요하다');
    if (e.dimension === '2d') {
      if (!['impact', 'pop', 'pulse', 'sparkle'].includes(e.type) || !integer(e.size, 16, 256) || e.frames * e.size > 16384) throw Error(e.id + ': 2D 타입·크기·시트 폭 오류');
      if (e.loop && e.type !== 'pulse') throw Error(e.id + ': 반복형은 pulse만 지원한다');
    } else {
      if (!['burst', 'orbit'].includes(e.type) || !integer(e.particles, 1, 128) || !integer(e.segments, 8, 128) || !positive(e.speed) || !Number.isFinite(e.gravity) || e.gravity < 0) throw Error(e.id + ': 3D 타입·파티클·속도·중력·분할 수 오류');
      if (e.loop !== (e.type === 'orbit')) throw Error(e.id + ': burst는 일회성, orbit는 반복형이다');
      if (e.type === 'orbit' && (!integer(e.speed, 1, 4) || e.gravity !== 0)) throw Error(e.id + ': orbit는 정수 회전 수 1~4와 gravity=0이 필요하다');
    }
  }
  const resolved = resolveTokens(raw, palette);
  if (![resolved.previewBg, ...resolved.effects.map(e => e.color)].every(c => /^#[0-9a-fA-F]{6}$/.test(c))) throw Error('팔레트는 #RRGGBB 색이어야 한다');
  return resolved;
}
export function safeAsset(root, rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.includes('\\') || rel.split('/').some(p => !p || p === '..' || p === '.')) throw Error('산출물 상대 경로 오류');
  const base = path.resolve(root), file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) throw Error('산출물 폴더 밖 경로');
  let current = base;
  for (const part of rel.split('/')) { current = path.join(current, part); if (fs.lstatSync(current).isSymbolicLink()) throw Error('산출물 연결 경로는 지원하지 않는다'); }
  return file;
}
function random(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
export function bakeMotion(e, seed) {
  const rng = random(seed), points = [];
  for (let i = 0; i < e.particles; i++) points.push({ angle: rng() * Math.PI * 2, lift: 0.3 + rng() * 0.7, speed: e.speed * (0.6 + rng() * 0.4) });
  const duration = e.frames / e.fps;
  const samples = [];
  for (let i = 0; i < e.frames; i++) {
    const phase = i / (e.loop ? e.frames : e.frames - 1), t = i / e.fps;
    const alpha = e.loop ? 0.55 + 0.2 * Math.sin(phase * Math.PI * 2) : (1 - phase) ** 1.5;
    const radius = e.worldSize * (e.loop ? 0.35 + 0.05 * Math.sin(phase * Math.PI * 2) : 0.06 + phase * 0.44);
    const particles = points.map((p, id) => {
      const angle = p.angle + (e.loop ? phase * Math.PI * 2 * e.speed : 0);
      const distance = e.loop ? radius : p.speed * t;
      return { id, position: [Math.cos(angle) * distance, e.loop ? e.worldSize * (0.12 + 0.06 * Math.sin(angle * 2)) : p.lift * p.speed * t - 0.5 * e.gravity * t * t, Math.sin(angle) * distance], size: e.worldSize * 0.045, alpha };
    });
    samples.push({ time: t, ringRadius: radius, alpha, particles });
  }
  return { schemaVersion: 1, duration, fps: e.fps, loop: e.loop, units: 'meters', coordinateSystem: { handedness: 'right', up: 'Y', forward: '+Z' }, samples };
}
export function ringMesh(segments, color) {
  const positions = [], indices = [];
  for (let i = 0; i < segments; i++) for (const radius of [0.88, 1]) positions.push(Math.cos(i / segments * Math.PI * 2) * radius, 0, Math.sin(i / segments * Math.PI * 2) * radius);
  for (let i = 0; i < segments; i++) { const a = i * 2, b = ((i + 1) % segments) * 2; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  const vertices = Buffer.alloc(positions.length * 4), faces = Buffer.alloc(indices.length * 2);
  positions.forEach((v, i) => vertices.writeFloatLE(v, i * 4)); indices.forEach((v, i) => faces.writeUInt16LE(v, i * 2));
  const buffer = Buffer.concat([vertices, faces]), rgb = hex(color).map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return { asset: { version: '2.0', generator: 'GameDevTeam fx-build' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'shockwave-ring' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 }] }],
    materials: [{ name: 'fx-ring', doubleSided: true, alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [...rgb, 0.8], metallicFactor: 0, roughnessFactor: 1 }, emissiveFactor: rgb, extras: { requestedRuntimeBlend: 'additive' } }],
    buffers: [{ byteLength: buffer.length, uri: 'data:application/octet-stream;base64,' + buffer.toString('base64') }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertices.length, target: 34962 }, { buffer: 0, byteOffset: vertices.length, byteLength: faces.length, target: 34963 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [0, 1, 2].map(axis => Math.min(...positions.filter((_, i) => i % 3 === axis).map(Math.fround))), max: [0, 1, 2].map(axis => Math.max(...positions.filter((_, i) => i % 3 === axis).map(Math.fround))) }, { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' }] };
}
export function render3D(sample, color, size, extent) {
  const pixels = Buffer.alloc(size * size * 4), rgb = hex(color), scale = size * 0.37 / extent;
  const project = ([x, y, z]) => [size / 2 + (x - z) * 0.707 * scale, size * 0.6 + (x + z) * 0.36 * scale - y * scale];
  function dot(point, radius, alpha) {
    const [cx, cy] = project(point), r = Math.max(1, radius * scale);
    for (let y = Math.max(0, Math.floor(cy - r * 2)); y < Math.min(size, cy + r * 2); y++) for (let x = Math.max(0, Math.floor(cx - r * 2)); x < Math.min(size, cx + r * 2); x++) {
      const a = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (r * r)) * alpha, j = (y * size + x) * 4;
      pixels[j] = rgb[0]; pixels[j + 1] = rgb[1]; pixels[j + 2] = rgb[2]; pixels[j + 3] = Math.min(255, pixels[j + 3] + Math.round(a * 255));
    }
  }
  for (let i = 0; i < 160; i++) { const a = i / 160 * Math.PI * 2; dot([Math.cos(a) * sample.ringRadius, 0, Math.sin(a) * sample.ringRadius], extent * 0.014, sample.alpha * 0.3); }
  for (const p of sample.particles) dot(p.position, p.size, p.alpha);
  return pixels;
}
