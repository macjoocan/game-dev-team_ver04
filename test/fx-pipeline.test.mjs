import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = name => path.join(root, 'skills/fx-art-system/scripts', name + '.mjs');
const run = (name, args) => spawnSync(process.execPath, [cli(name), ...args], { encoding: 'utf8' });
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-pipeline-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'palette.json'), JSON.stringify({ fx: { hit: '#FFC132', bg: '#101C2E' } }));
  fs.writeFileSync(path.join(dir, 'visual.md'), 'Test-only visual standard. Warm small impact.');
  const spec = { schemaVersion: 1, palette: 'palette.json', visualReference: 'visual.md', license: 'UNSPECIFIED; concept only', seed: 42, previewBg: '@fx.bg', budgets: { textureBytes: 1048576, particles: 32, triangles: 128 }, effects: [
    { id: 'fx.hit.2d', dimension: '2d', type: 'impact', color: '@fx.hit', size: 32, frames: 6, fps: 12, loop: false, blend: 'additive', worldSize: 1 },
    { id: 'fx.burst.3d', dimension: '3d', type: 'burst', color: '@fx.hit', frames: 8, fps: 12, loop: false, blend: 'additive', worldSize: 2, particles: 12, speed: 1.4, gravity: 1.2, segments: 24 },
  ] };
  const file = path.join(dir, 'spec.json');
  fs.writeFileSync(file, JSON.stringify(spec));
  return { dir, file, spec };
}
test('engine-neutral FX: deterministic 2D/3D artifacts, preview and static QA', t => {
  const x = fixture(t), out = path.join(x.dir, 'out'), other = path.join(x.dir, 'other');
  const a = run('fx-build', [x.file, '--out', out]);
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(run('fx-build', [x.file, '--out', other]).status, 0);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
  assert.equal(m.status, 'concept'); assert.equal(m.effects.length, 2);
  assert.equal(m.coordinateSystem.up, 'Y');
  for (const e of m.effects) for (const asset of e.assets) assert.equal(fs.readFileSync(path.join(out, asset.path)).equals(fs.readFileSync(path.join(other, asset.path))), true, asset.path);
  assert.ok(fs.existsSync(path.join(out, 'preview.html')));
  const g = JSON.parse(fs.readFileSync(path.join(out, m.effects[1].mesh)));
  assert.equal(g.asset.version, '2.0'); assert.ok(g.accessors[1].count > 0);
  const qa = run('fx-check', [path.join(out, 'manifest.json'), '--out', path.join(x.dir, 'qa')]);
  assert.equal(qa.status, 0, qa.stdout + qa.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(x.dir, 'qa/fx-check.json')));
  assert.equal(report.verdict, '충족'); assert.match(report.gaps.join(' '), /엔진/);
  assert.equal(report.productionApproved, false);
  assert.equal(run('fx-build', [x.file, '--out', out]).status, 3, 'must not overwrite prior results');
});
test('FX validation refuses invalid palette, duplicate IDs, traversal and missing inputs', t => {
  const x = fixture(t);
  for (const change of [s => s.effects[0].id = '../escape', s => s.effects[1].id = s.effects[0].id, s => s.effects[0].color = '#FFFFFF', s => s.effects[0].color = '@fx.missing', s => s.effects[0].fps = 0, s => s.effects[1].particles = -1]) {
    const spec = structuredClone(x.spec); change(spec); fs.writeFileSync(x.file, JSON.stringify(spec));
    const r = run('fx-build', [x.file, '--out', path.join(x.dir, 'bad')]);
    assert.equal(r.status, 3, r.stdout + r.stderr); assert.doesNotMatch(r.stderr, /node:internal/);
  }
  assert.equal(run('fx-check', [path.join(x.dir, 'missing.json')]).status, 3);
});
test('FX QA catches changed files, semantic damage and budget excess', t => {
  const x = fixture(t), out = path.join(x.dir, 'out');
  assert.equal(run('fx-build', [x.file, '--out', out]).status, 0);
  const file = path.join(out, 'manifest.json'), original = fs.readFileSync(file);
  let m = JSON.parse(original); m.budgets.particles = 1; fs.writeFileSync(file, JSON.stringify(m));
  assert.equal(run('fx-check', [file]).status, 1);
  m = JSON.parse(original); m.effects[0].duration = 99; m.effects[0].runtimeTextures = [m.effects[0].frameFiles[0]]; fs.writeFileSync(file, JSON.stringify(m));
  assert.equal(run('fx-check', [file]).status, 1, 'runtime contract and memory accounting cannot silently drift');
  fs.writeFileSync(file, original); m = JSON.parse(original);
  fs.appendFileSync(path.join(out, m.effects[1].motion), ' ');
  assert.equal(run('fx-check', [file]).status, 1);
  const motionPath = path.join(out, m.effects[1].motion), motion = JSON.parse(fs.readFileSync(motionPath));
  motion.samples[0].particles[0].position[0] += 10;
  fs.writeFileSync(motionPath, JSON.stringify(motion));
  m.effects[1].assets.find(a => a.path === m.effects[1].motion).sha256 = createHash('sha256').update(fs.readFileSync(motionPath)).digest('hex');
  fs.writeFileSync(file, JSON.stringify(m));
  assert.equal(run('fx-check', [file]).status, 1, 'even updated hashes cannot hide a changed motion contract');
  m.effects[0].assets[0].path = '../../escape.png'; fs.writeFileSync(file, JSON.stringify(m));
  const r = run('fx-check', [file]); assert.equal(r.status, 3); assert.doesNotMatch(r.stderr, /node:internal/);
});


test('preview loop wraps immediately while one-shot keeps its inspection pause', async () => {
  const { playbackPhase, previewHTML } = await import('../skills/fx-art-system/scripts/lib-fx-preview.mjs');
  const loop = { duration: 2, loop: true }, once = { duration: 2, loop: false };
  assert.equal(playbackPhase(loop, 2), 0);
  assert.equal(playbackPhase(loop, 2.25), 0.125);
  assert.equal(playbackPhase(once, 2.25), 1);
  assert.equal(playbackPhase(once, 2.5), 0);
  assert.ok(previewHTML([], '#101010').includes(playbackPhase.toString()));
});
