#!/usr/bin/env node
// 엔진 공통 FX 규격 검사. 0 충족 / 1 미달 / 2 사용법 / 3 측정 불가.
import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { json, writeJSON, hash, safeAsset, validateSpec, bakeMotion, ringMesh } from './lib-fx-pipeline.mjs';
const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('-') || (args.length !== 1 && (args.length !== 3 || args[1] !== '--out'))) {
  console.error('usage: node fx-check.mjs <manifest.json> [--out dir]'); process.exit(2);
}
try {
  const file = path.resolve(args[0]), root = path.dirname(file), m = json(file), fails = [], metrics = [];
  const gaps = ['실제 엔진의 GPU 시간·드로우콜·오버드로·깊이 정렬은 미측정', '실제 화면의 중첩·시야 면적·플래시 안전은 별도 검사 필요', '가독성·색각이상 대체 신호·타이밍 체감·외형 승인·라이선스 허가는 사람 검수 필요'];
  if (m.schemaVersion !== 1 || m.status !== 'concept' || m.productionApproved !== false || !Array.isArray(m.effects) || !m.effects.length || !Array.isArray(m.sources) || !Array.isArray(m.previews)) throw Error('공통 manifest 형식 또는 concept 상태 오류');
  if (!m.budgets || !['textureBytes', 'particles', 'triangles'].every(k => Number.isFinite(m.budgets[k]) && m.budgets[k] > 0)) throw Error('예산 누락 또는 형식 오류');
  if (JSON.stringify(m.coordinateSystem) !== JSON.stringify({ handedness: 'right', up: 'Y', forward: '+Z', units: 'meters' })) fails.push('좌표계·단위 계약 불일치');
  const verified = new Set();
  function verify(asset) {
    if (!asset || typeof asset.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(asset.sha256)) throw Error('산출물 해시 누락');
    const f = safeAsset(root, asset.path); verified.add(asset.path);
    if (hash(fs.readFileSync(f)) !== asset.sha256) fails.push('파일 변경: ' + asset.path);
  }
  for (const a of [...m.sources, ...m.previews]) verify(a);
  for (const required of ['source-spec.json', 'palette.json', 'VISUAL_DESIGN.md', 'preview.png', 'preview.html']) if (!verified.has(required)) throw Error('필수 출처·프리뷰 누락: ' + required);
  const spec = validateSpec(json(safeAsset(root, 'source-spec.json')), json(safeAsset(root, 'palette.json')));
  if (m.effects.length !== spec.effects.length || new Set(m.effects.map(e => e.id)).size !== m.effects.length) throw Error('이펙트 개수·ID 불일치');
  let textureBytes = 0, triangles = 0, peakParticles = 0;
  for (const [index, e] of m.effects.entries()) {
    const expected = spec.effects[index];
    if (!e || !Array.isArray(e.assets) || !e.assets.length || !Array.isArray(e.runtimeTextures) || !e.runtimeTextures.length || !Array.isArray(e.frameFiles) || e.frameFiles.length !== expected.frames) throw Error('이펙트 파일 목록 누락');
    for (const [key, value] of Object.entries(expected)) if (JSON.stringify(e[key]) !== JSON.stringify(value)) fails.push(`${expected.id}: 스펙과 ${key} 불일치`);
    for (const [key, value] of Object.entries({ duration: expected.frames / expected.fps, pivot: [0.5, 0.5], simulationSpace: 'local', depthWrite: false, alphaConvention: 'straight', status: 'concept' })) if (JSON.stringify(e[key]) !== JSON.stringify(value)) fails.push(`${expected.id}: 런타임 ${key} 불일치`);
    const texture = expected.id + (expected.dimension === '2d' ? '/texture_sheet.png' : '/particle.png');
    if (JSON.stringify(e.runtimeTextures) !== JSON.stringify([texture])) fails.push(expected.id + ': 런타임 텍스처 목록 불일치');
    for (const asset of e.assets) verify(asset);
    for (const log of e.logs || []) verify(log);
    for (const ref of [...e.runtimeTextures, ...e.frameFiles, e.sheet, ...(expected.dimension === '3d' ? [e.mesh, e.motion] : [])]) if (!e.assets.some(a => a.path === ref)) throw Error('해시 목록에 없는 자원: ' + ref);
    if (new Set(e.assets.map(a => a.path)).size !== e.assets.length) throw Error('중복 자원 경로');
    const size = expected.dimension === '2d' ? expected.size : 128;
    const sheet = readPNG(safeAsset(root, e.sheet));
    if (sheet.width !== expected.frames * size || sheet.height !== size) fails.push(expected.id + ': 시트 크기 불일치');
    for (const frame of e.frameFiles) { const p = readPNG(safeAsset(root, frame)); if (p.width !== size || p.height !== size) fails.push('프레임 크기 불일치: ' + frame); }
    let bytes = 0;
    for (const texture of new Set(e.runtimeTextures)) { const p = readPNG(safeAsset(root, texture)); bytes += p.width * p.height * 4; }
    let count = 0, tris = 0;
    if (expected.dimension === '3d') {
      const motion = json(safeAsset(root, e.motion)), mesh = json(safeAsset(root, e.mesh));
      if (JSON.stringify(motion) !== JSON.stringify(bakeMotion(expected, spec.seed + index))) fails.push(expected.id + ': 시간·위치·수명 데이터가 스펙과 다르다');
      if (JSON.stringify(mesh) !== JSON.stringify(ringMesh(expected.segments, expected.color))) fails.push(expected.id + ': 메시·머티리얼 데이터가 스펙과 다르다');
      if (!Array.isArray(motion.samples) || !motion.samples.length || !mesh.accessors?.[1]?.count) throw Error('모션·메시 구조를 측정하지 못했다');
      count = Math.max(...motion.samples.map(s => s.particles.filter(p => p.alpha > 0).length)); tris = mesh.accessors[1].count / 3;
    }
    textureBytes += bytes; triangles += tris; peakParticles += count;
    metrics.push({ id: expected.id, textureBytes: bytes, peakParticles: count, triangles: tris, frames: expected.frames, duration: expected.frames / expected.fps });
  }
  const totals = { textureBytes, particles: peakParticles, triangles };
  for (const [key, value] of Object.entries(totals)) if (value > m.budgets[key]) fails.push(`예산 초과: ${key} ${value} > ${m.budgets[key]}`);
  const result = { verdict: fails.length ? '미달' : '충족', scope: 'asset-contract-only', productionApproved: false, manifestHash: hash(fs.readFileSync(file)), metrics, totals, budgets: m.budgets, failures: fails, gaps };
  const report = ['# FX 규격 검사', '', '## [주장]', `판정: **${result.verdict}**. 에셋 규격만 검사했다.`, '', '## [증거]', ...metrics.map(e => `${e.id}: ${e.frames}프레임, 텍스처 ${e.textureBytes} bytes, 파티클 ${e.peakParticles}, 삼각형 ${e.triangles}`), ...fails, '', '## [기준]', '파일 SHA-256·프레임/시트 규격·제작 스펙과 모션/메시 일치·지정 예산. 텍스처는 RGBA32 추정이며, 모든 효과 1개씩 동시 사용을 가정한 합계다.', '', '## [공백]', ...gaps, '', '## [잔여 위험]', '파일 해시는 출처 인증이 아니다. concept 산출물은 사람 승인 전 프로덕션에 반영하지 않는다. glTF의 BLEND는 additive를 보장하지 않으므로 엔진에서 manifest의 재질 계약을 적용한다.', ''].join('\n');
  if (args[2]) { fs.mkdirSync(args[2], { recursive: true }); writeJSON(path.join(args[2], 'fx-check.json'), result); fs.writeFileSync(path.join(args[2], 'fx-check-report.md'), report); }
  console.log(report); process.exit(fails.length ? 1 : 0);
} catch (e) { console.error('측정 불가: ' + e.message); process.exit(3); }
