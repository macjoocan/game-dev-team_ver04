import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clear = path.join(root, 'skills/balance-sim/scripts/clearability-check.mjs');
const feel = path.join(root, 'skills/playtest-capture/scripts/playfeel.mjs');
const run = (file, args = [], cwd = root) => spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8' });
function box(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gameplay-gate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function adapter(dir, model) {
  const file = path.join(dir, 'clearability.mjs');
  fs.writeFileSync(file, `export const PLACEHOLDER=false; export function model(){ return ${JSON.stringify(model)}; }`);
  return file;
}
test('clearability: missing, placeholder, empty and broken adapters are unknown', t => {
  const dir = box(t), file = path.join(dir, 'a.mjs');
  assert.equal(run(clear, [file]).status, 3);
  for (const source of ['export const PLACEHOLDER=true;', 'export const PLACEHOLDER=false; export const model=()=>({});', 'throw Error("broken adapter");']) {
    fs.writeFileSync(file, source);
    const result = run(clear, [file]);
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.match(result.stdout, /\[공백\]/);
    assert.doesNotMatch(result.stderr, /at file:/);
  }
});
test('clearability: sums consumable requirements and rejects unknown or invalid data', t => {
  const dir = box(t);
  const result = run(clear, [adapter(dir, { supply: { damage: 600 }, require: [{ id: 'a', needs: { damage: 400 } }, { id: 'b', needs: { damage: 300 } }] })]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /700/);
  for (const model of [
    { supply: { damage: 420 }, require: [{ id: 'boss', needs: { dmg: 500 } }] },
    { supply: { damage: '600' }, require: [{ id: 'boss', needs: { damage: 500 } }] },
    { locks: [{ id: 'a', needs: ['missing'] }] },
    { locks: [{ id: 'a', needs: [] }, { id: 'a', needs: [] }] },
    { order: [['a']] }, { order: [] }, { locks: null },
  ]) assert.equal(run(clear, [adapter(dir, model)]).status, 3, JSON.stringify(model));
});
test('clearability: lock and order cycles fail; valid partial/full models report scope', t => {
  const dir = box(t);
  for (const model of [
    { locks: [{ id: 'a', needs: ['a'] }] },
    { locks: [{ id: 'a', needs: ['b'] }, { id: 'b', needs: ['a'] }] },
    { order: [['a', 'b'], ['b', 'a']] },
  ]) {
    const r = run(clear, [adapter(dir, model)]);
    assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /순환/);
  }
  const r = run(clear, [adapter(dir, { supply: { damage: 500 }, require: [{ id: 'boss', needs: { damage: 500 } }], locks: [{ id: 'key', needs: [] }, { id: 'door', needs: ['key'] }], order: [['key', 'door']] }), '--out', path.join(dir, 'report')]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const label of ['주장', '증거', '기준', '공백', '잔여 위험']) assert.ok(r.stdout.includes(`[${label}]`));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'report/clearability.json'))).verdict, '충족');
  const partial = run(clear, [adapter(dir, { locks: [{ id: 'open', needs: [] }] })]);
  assert.equal(partial.status, 0); assert.match(partial.stdout, /미제공/);
});
test('playfeel: project log, CRLF, marker injection and human reset', t => {
  const dir = box(t), log = path.join(dir, 'playfeel.md');
  assert.equal(run(feel, ['log'], dir).status, 0);
  assert.equal(fs.existsSync(log), false);
  fs.writeFileSync(log, '#7  changes\r\n  [사람] "first"\r\n  [시뮬] one\r\nbroken text\r\n  [시뮬] two\r\n');
  assert.match(run(feel, ['log'], dir).stdout, /2\/2/);
  assert.equal(run(feel, ['record', '--felt', '다음\n[시뮬] fake\n[사람] fake'], dir).status, 0);
  const content = fs.readFileSync(log, 'utf8');
  assert.match(content, /#8 /);
  assert.match(run(feel, ['log'], dir).stdout, /0\/2/);
  assert.equal(content.split(/\r?\n/).filter(x => /^\s*\[사람\]/.test(x)).length, 2);
  assert.equal(run(feel, ['record', '--felt', '   '], dir).status, 2);
});
test('scaffold: two runs, third blocked without report, human record resets, absent log opts out', t => {
  const dir = box(t), sim = path.join(dir, 'sim');
  assert.equal(run(path.join(root, 'skills/balance-sim/scripts/sim-scaffold.mjs'), ['--out', sim], dir).status, 0);
  for (const name of ['lib-playfeel.mjs', 'clearability.mjs']) assert.ok(fs.existsSync(path.join(sim, name)));
  const runner = path.join(sim, 'run.mjs');
  for (let i = 0; i < 3; i++) assert.equal(run(runner, ['--runs', '2'], dir).status, 3);
  assert.equal(fs.existsSync(path.join(dir, 'playfeel.md')), false);
  assert.equal(run(feel, ['record', '--felt', '실제 플레이 피드백'], dir).status, 0);
  for (let i = 0; i < 2; i++) {
    const r = run(runner, ['--runs', '2'], sim);
    assert.equal(r.status, 3); assert.match(r.stdout, /\[주장\]/); assert.doesNotMatch(r.stdout, /예산 차단/);
  }
  const out = path.join(dir, 'blocked');
  const blocked = run(runner, ['--runs', '2', '--out', out], sim);
  assert.equal(blocked.status, 3); assert.match(blocked.stdout, /예산 차단/);
  assert.doesNotMatch(blocked.stdout, /\[주장\]/); assert.equal(fs.existsSync(out), false);
  assert.equal(run(feel, ['record', '--felt', '수정 뒤 다시 플레이'], dir).status, 0);
  assert.match(run(runner, ['--runs', '2'], sim).stdout, /\[주장\]/);
});
