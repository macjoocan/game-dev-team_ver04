import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writePNG } from '../scripts/lib-png.mjs';
import { inspectSequence, loadSequence, measureCrop, measureMotion, parseTightCrop } from '../skills/sprite-pipeline/scripts/lib-sprite-sequence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function frame(name = 'f0', { width = 32, height = 32, alpha = 255, background = 0,
  x0 = 8, x1 = 23, y0 = 8, y1 = 23, red = 90 } = {}) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    data[p] = red; data[p + 1] = 130; data[p + 2] = 180;
    data[p + 3] = x >= x0 && x <= x1 && y >= y0 && y <= y1 ? alpha : background;
  }
  return { name, width, height, data };
}
const sequence = options => Array.from({ length: 4 }, (_, i) => frame(`f${i}`, typeof options === 'function' ? options(i) : options));
function fixture(t, frames = sequence()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprite-motion-qa-'));
  t.after(() => {
    const resolved = fs.realpathSync(dir), parent = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved).toLowerCase(), parent.toLowerCase());
    assert.ok(path.basename(resolved).startsWith('sprite-motion-qa-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const source = path.join(dir, 'frames'); fs.mkdirSync(source);
  for (const f of frames) writePNG(path.join(source, `${f.name}.png`), f.width, f.height, f.data);
  return { dir, source };
}
function cli(tool, source, out, extra = []) {
  const result = spawnSync(process.execPath, [`skills/sprite-pipeline/scripts/${tool}.mjs`, source,
    ...(tool === 'motion-qa' ? ['--gait', 'walk'] : []), '--out', out, ...extra], { cwd: root, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  return { ...result, report: JSON.parse(fs.readFileSync(path.join(out, `${tool}.json`), 'utf8')) };
}

test('alpha 128 belongs to foreground; alpha 19 belongs to background; alpha 20 does not', () => {
  assert.equal(inspectSequence(sequence({ alpha: 128, background: 19 })).valid, true);
  assert.equal(inspectSequence(sequence({ alpha: 127 })).issues[0].code, 'empty-foreground');
  assert.equal(inspectSequence(sequence({ background: 20 })).issues[0].code, 'background-missing');
});
test('every frame is required; empty or opaque-background frame cannot be silently removed', () => {
  for (const bad of [{ alpha: 0 }, { background: 255 }, { width: 40 }]) {
    const frames = sequence(); frames[2] = frame('bad', bad);
    const result = inspectSequence(frames, 4);
    assert.equal(result.valid, false); assert.equal(result.measurements.length, 4);
    assert.ok(result.issues.some(i => i.frame === 'bad' || i.code === 'canvas-size'));
  }
});
test('empty folder and short sequences are unmeasurable', () => {
  assert.equal(inspectSequence([]).valid, false);
  assert.equal(inspectSequence(sequence().slice(0, 3), 4).valid, false);
});
test('the 2% background boundary is inclusive and checked per frame', () => {
  const s = sequence({ width: 50, height: 50, background: 255 });
  for (const f of s) for (let p = 0; p < 50; p++) f.data[p * 4 + 3] = 0;
  assert.equal(inspectSequence(s).valid, true);
  s[3].data[3] = 255;
  const result = inspectSequence(s);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].frame, 'f3');
});
for (const side of ['top', 'bottom', 'left', 'right']) {
  test(`crop ${side}: none, mixed, all, and explicit exemption`, () => {
    const touch = { top: { y0: 0 }, bottom: { y1: 31 }, left: { x0: 0 }, right: { x1: 31 } }[side];
    const measure = (s, declaration = []) => measureCrop(inspectSequence(s).measurements, declaration).sides[side];
    assert.equal(measure(sequence()).state, 'none');
    const mixed = measure(sequence(i => i === 2 ? touch : {}), [side]);
    assert.equal(mixed.state, 'mixed'); assert.equal(mixed.warning, true); assert.equal(mixed.exempted, false);
    assert.deepEqual(mixed.frames, ['f2']); assert.equal(mixed.minimumMarginPx, 0);
    assert.equal(measure(sequence(touch)).warning, true);
    const all = measure(sequence(touch), [side]);
    assert.equal(all.state, 'all'); assert.equal(all.warning, false); assert.equal(all.exempted, true);
  });
}
test('an isolated boundary pixel does not reach the two-pixel contact threshold', () => {
  const s = sequence(); s[1].data[3] = 255;
  const crop = measureCrop(inspectSequence(s).measurements);
  assert.equal(crop.sides.top.count, 0); assert.equal(crop.sides.left.count, 0);
  s[1].data[7] = 255;
  assert.equal(measureCrop(inspectSequence(s).measurements).sides.top.count, 1);
});
test('tight crop accepts only known explicit side names', () => {
  assert.deepEqual(parseTightCrop('left,bottom,left'), ['left', 'bottom']);
  assert.throws(() => parseTightCrop('auto')); assert.throws(() => parseTightCrop(''));
});
test('natural frame ordering, hashes, and exact sheet division', t => {
  const { dir, source } = fixture(t, [frame('f10'), frame('f2'), frame('f1')]);
  const loaded = loadSequence(source);
  assert.deepEqual(loaded.map(f => f.name), ['f1.png', 'f2.png', 'f10.png']);
  assert.match(loaded[0].sourceSha256, /^[a-f0-9]{64}$/);
  const sheet = path.join(dir, 'sheet.png'), f = frame('sheet'); writePNG(sheet, f.width, f.height, f.data);
  for (const n of [undefined, 3, 2.5, -2, Infinity, 100]) assert.throws(() => loadSequence(sheet, n));
  assert.equal(loadSequence(sheet, 2)[0].width, 16);
  assert.throws(() => loadSequence(source, 2));
});
test('lower contour is an observation: static feet with moving cloth still raises liftRange', () => {
  const still = sequence({ x0: 8, x1: 23, y0: 8, y1: 27 });
  const moving = sequence({ x0: 8, x1: 23, y0: 8, y1: 27 });
  for (let i = 0; i < moving.length; i++) {
    for (let y = 18 + i * 2; y <= 27; y++) for (let x = 8; x < 14; x++) moving[i].data[(y * 32 + x) * 4 + 3] = 0;
  }
  const a = measureMotion(inspectSequence(still).measurements), b = measureMotion(inspectSequence(moving).measurements);
  assert.equal(a.liftRange, 0); assert.ok(b.liftRange > 0);
  assert.equal(b.mode, 'report-only'); assert.equal(b.perFrame.length, 4);
  // Feet at x14..23 remain identical; the metric must never claim foot motion.
  assert.match(b.liftRangeMeaning, /실제 발.*아니다/);
  assert.equal(b.adjacentContourDelta.length, 3);
});
for (const tool of ['sprite-qa', 'motion-qa']) {
  for (const [name, bad, code] of [['empty', { alpha: 0 }, 'empty-foreground'],
    ['background', { background: 255 }, 'background-missing'], ['size', { width: 40 }, 'canvas-size']]) {
    test(`${tool}: single ${name} frame returns 3 and saves no partial measurement`, t => {
      const frames = sequence(); frames[1] = frame('bad', bad);
      const { dir, source } = fixture(t, frames);
      const r = cli(tool, source, path.join(dir, 'out'));
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.ok(r.report.input.issues.some(i => i.code === code));
      assert.equal(r.report[tool === 'sprite-qa' ? 'crop' : 'motion'], null);
    });
  }
  test(`${tool}: alpha128 and low alpha background share one contract`, t => {
    const { dir, source } = fixture(t, sequence({ alpha: 128, background: 10 }));
    const r = cli(tool, source, path.join(dir, 'out'));
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(r.report.input.valid, true);
  });
  test(`${tool}: unreadable PNG or missing source returns 3`, t => {
    const { dir, source } = fixture(t);
    fs.writeFileSync(path.join(source, 'f1.png'), 'bad PNG');
    assert.equal(cli(tool, source, path.join(dir, 'bad')).status, 3);
    assert.equal(cli(tool, path.join(dir, 'missing'), path.join(dir, 'missing-out')).status, 3);
  });
}
test('sprite-qa warnings alone do not block; explicit tight crop never hides mixed contact', t => {
  const { dir, source } = fixture(t, sequence(i => ({ x0: i === 2 ? 0 : 1, x1: i === 2 ? 15 : 16 })));
  const result = cli('sprite-qa', source, path.join(dir, 'out'), ['--tight-crop', 'left']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.report.warns.some(w => w.kind === '잘림 의심'));
  assert.equal(result.report.crop.sides.left.exempted, false);
});
test('all-frame contact remains warning-only unless declared; unrelated color failures still fail', t => {
  const { dir, source } = fixture(t, sequence({ x0: 0, x1: 15 }));
  const plain = cli('sprite-qa', source, path.join(dir, 'plain'));
  assert.equal(plain.status, 0); assert.equal(plain.report.crop.sides.left.warning, true);
  const declared = cli('sprite-qa', source, path.join(dir, 'declared'), ['--tight-crop', 'left']);
  assert.equal(declared.status, 0); assert.equal(declared.report.crop.sides.left.exempted, true);
  const red = frame('f2', { x0: 0, x1: 15, red: 255 });
  writePNG(path.join(source, 'f2.png'), red.width, red.height, red.data);
  const drift = cli('sprite-qa', source, path.join(dir, 'drift'), ['--tight-crop', 'left']);
  assert.equal(drift.status, 1); assert.ok(drift.report.fails.some(f => f.kind === '정체성(색)'));
});
test('motion-qa needs explicit gait; other actions remain observations', t => {
  const { dir, source } = fixture(t);
  const noGait = spawnSync(process.execPath, ['skills/sprite-pipeline/scripts/motion-qa.mjs', source], { cwd: root, encoding: 'utf8' });
  assert.equal(noGait.status, 3); assert.match(noGait.stdout, /--gait/);
  const result = spawnSync(process.execPath, ['skills/sprite-pipeline/scripts/motion-qa.mjs', source, '--gait', 'other', '--out', path.join(dir, 'out')], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0);
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'motion-qa.json')));
  assert.equal(report.verdict, '관찰 완료'); assert.equal(report.gait, 'other');
});
test('a missing output value never treats the next option as a directory', t => {
  const { dir, source } = fixture(t);
  const script = path.join(root, 'skills/sprite-pipeline/scripts/sprite-qa.mjs');
  const result = spawnSync(process.execPath, [script, source, '--out', '--frames', '4'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 3);
  assert.equal(fs.existsSync(path.join(dir, '--frames')), false);
});
