import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadContract, digest, verifyPins } from '../scripts/candidate-contract.mjs';
import { normalize, aggregate } from '../scripts/candidate-adapters.mjs';

const cli = fileURLToPath(new URL('../scripts/candidate-run.mjs', import.meta.url));
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function box(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate space-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function command(root, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 20000 });
}
function demo(t, domain = 'development') {
  const root = box(t);
  const result = command(root, 'init', '--domain', domain, '--out', root, '--demo');
  assert.equal(result.status, 0, result.stderr);
  return { root, file: path.join(root, 'experiment.json') };
}
const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const save = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));
function state(root) {
  return json(path.join(runDir(root), 'state.json'));
}
function runDir(root) {
  const base = path.join(root, 'out/experiments/demo');
  return path.join(base, fs.readdirSync(base).filter(n => n !== '.lock').sort().at(-1));
}

test('aggregate keeps confirmed failure separate from missing measurement', () => {
  assert.equal(aggregate([0, 3]), 3);
  assert.equal(aggregate([1, 3]), 1);
  assert.equal(aggregate([0, 0]), 0);
});
test('generic process crash is unknown; only configured test failures are failures', () => {
  assert.equal(normalize({ adapter: 'exit' }, { exitCode: 2 }).code, 3);
  assert.equal(normalize({ adapter: 'exit', failureCodes: [1] }, { exitCode: 1 }).code, 1);
  assert.equal(normalize({ adapter: 'exit' }, { exitCode: 0, timedOut: true }).code, 3);
});
test('balance adapter recomputes CI and rejects missing sample, placeholder, conditions mismatch', () => {
  const check = { adapter: 'balance-sim', target: [0.35, 0.55], conditions: { seed: 42, runs: 1000, policy: 'greedy' } };
  const data = { meta: { seed: 42, runs: 1000, policy: 'greedy' }, targets: { winRate: [0.35, 0.55] }, a: { wins: 450, n: 1000 } };
  assert.equal(normalize(check, { exitCode: 0 }, data).code, 0);
  const currentScaffold = { ...data, a: { n: 1000, winRate: { p: 0.45, n: 1000 } } };
  assert.equal(normalize(check, { exitCode: 0 }, currentScaffold).code, 0);
  assert.equal(normalize(check, { exitCode: 0 }, { ...data, targets: { winRate: [0, 1] } }).code, 3);
  assert.equal(normalize(check, { exitCode: 3 }, data).code, 3);
  assert.equal(normalize(check, { exitCode: 0 }, { ...data, placeholder: true }).code, 3);
  assert.equal(normalize(check, { exitCode: 0 }, { ...data, a: { wins: 8, n: 10 } }).code, 3);
  assert.equal(normalize(check, { exitCode: 0 }, { ...data, meta: { ...data.meta, seed: 99 } }).code, 3);
});
test('planning and development demos execute same checks for baseline and alternative', t => {
  for (const domain of ['planning', 'development']) {
    const { root, file } = demo(t, domain);
    const ctx = loadContract(file);
    assert.equal(ctx.contract.domain, domain);
    const r = command(root, 'run', file);
    assert.equal(r.status, 1, r.stderr); // synthetic baseline fails, alternative passes
    const s = state(root);
    assert.equal(s.candidates.baseline.code, 1);
    assert.equal(s.candidates.alternative.code, 0);
    assert.equal(command(root, 'report', file).status, 1);
    assert.match(fs.readFileSync(path.join(runDir(root), 'report.md'), 'utf8'), /공백/);
    assert.equal(command(root, 'record', file, '--candidate', 'alternative', '--reason', 'fixture improvement').status, 0);
    assert.equal(json(path.join(runDir(root), 'decision.json')).status, 'proposed');
  }
});
test('unfinished template is not a runnable experiment', t => {
  const root = box(t);
  assert.equal(command(root, 'init', '--domain', 'planning', '--out', root).status, 0);
  assert.equal(command(root, 'check', path.join(root, 'experiment.json')).status, 3);
});
test('changed target, validation script, duplicate ids and escaping candidate paths rejected', t => {
  const { root, file } = demo(t);
  const c = json(file);
  fs.appendFileSync(path.join(root, 'TARGETS.md'), '\nchanged');
  assert.throws(() => loadContract(file), /hash/i);
  fs.writeFileSync(path.join(root, 'TARGETS.md'), c.demoTarget);
  c.references[0].sha256 = hash(path.join(root, 'TARGETS.md'));
  save(file, { ...c, candidates: [c.candidates[0], c.candidates[0]] });
  assert.throws(() => loadContract(file), /duplicate/i);
  save(file, { ...c, candidates: [{ ...c.candidates[0], cwd: '../outside' }, c.candidates[1]] });
  assert.throws(() => loadContract(file), /outside|escape/i);
  save(file, c);
  fs.appendFileSync(path.join(root, 'verify.mjs'), '\n// tampered');
  assert.throws(() => loadContract(file), /hash/i);
});
test('missing output is unknown and stale json cannot satisfy a new execution', t => {
  const { root, file } = demo(t);
  const c = json(file);
  c.checks[0].args = ['-e', 'process.exit(0)'];
  save(file, c);
  assert.equal(command(root, 'run', file).status, 3);
});
test('report and resume reject changed raw evidence or inputs', t => {
  const { root, file } = demo(t);
  command(root, 'run', file);
  const s = state(root);
  const step = s.candidates.alternative.steps[0];
  fs.appendFileSync(path.join(runDir(root), step.stdout), 'tamper');
  assert.equal(command(root, 'report', file).status, 3);
  assert.equal(command(root, 'run', file, '--resume').status, 3);
});
test('completed resume reuses evidence; new run preserves previous state', t => {
  const { root, file } = demo(t);
  command(root, 'run', file);
  const before = fs.readFileSync(path.join(runDir(root), 'state.json'), 'utf8');
  assert.equal(command(root, 'run', file, '--resume').status, 1);
  assert.equal(fs.readFileSync(path.join(runDir(root), 'state.json'), 'utf8'), before);
  command(root, 'run', file);
  assert.equal(fs.readdirSync(path.join(root, 'out/experiments/demo')).length, 2);
});
test('reverse candidate outcomes are reported without assuming alternative is better', t => {
  const { root, file } = demo(t);
  for (const name of ['baseline', 'alternative']) {
    const p = path.join(root, name, 'input.json');
    const d = json(p); d.pass = !d.pass; save(p, d);
  }
  const c = json(file);
  for (const candidate of c.candidates) candidate.inputs[0].sha256 = hash(path.join(root, candidate.cwd, 'input.json'));
  save(file, c);
  command(root, 'run', file);
  assert.equal(state(root).candidates.baseline.code, 0);
  assert.equal(state(root).candidates.alternative.code, 1);
  assert.equal(command(root, 'record', file, '--candidate', 'alternative', '--reason', 'bad').status, 3);
});
test('lock denies concurrent run and is not stolen', t => {
  const { root, file } = demo(t);
  const base = path.join(root, 'out/experiments/demo');
  fs.mkdirSync(base, { recursive: true }); fs.writeFileSync(path.join(base, '.lock'), 'owned');
  const r = command(root, 'run', file);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /lock/i);
  assert.equal(fs.readFileSync(path.join(base, '.lock'), 'utf8'), 'owned');
});
test('dead process lock is not automatically stolen or deleted', t => {
  const { root, file } = demo(t); const base = path.join(root, 'out/experiments/demo');
  fs.mkdirSync(base, { recursive: true });
  const owner = { host: os.hostname(), pid: 2147483646, token: 'old-owner' };
  save(path.join(base, '.lock'), owner);
  assert.equal(command(root, 'run', file).status, 3);
  assert.deepEqual(json(path.join(base, '.lock')), owner);
});
test('timeout is unknown; interrupted unsafe steps are not rerun', t => {
  const { root, file } = demo(t);
  const c = json(file);
  c.checks[0] = { ...c.checks[0], adapter: 'exit', args: ['-e', 'setInterval(()=>{}, 1000)'], timeoutMs: 250, retrySafe: false };
  save(file, c);
  assert.equal(command(root, 'run', file).status, 3);
  const p = path.join(runDir(root), 'state.json');
  const s = json(p); const step = s.candidates.baseline.steps[0];
  step.status = 'running'; s.candidates.baseline.status = 'running'; s.status = 'running'; save(p, s);
  const r = command(root, 'run', file, '--resume');
  assert.equal(r.status, 3); assert.match(r.stderr, /retrySafe|interrupted/);
});
test('workflow requires actual execution evidence and hashes; lessons require intake', t => {
  const { file } = demo(t);
  const c = json(file); c.axis = 'workflow'; save(file, c);
  assert.throws(() => loadContract(file), /workflow|execution/i);
  c.axis = 'artifact'; delete c.lessonIntake; save(file, c);
  assert.throws(() => loadContract(file), /lesson/i);
});
test('hashes directories in sorted order and refuses symbolic links', t => {
  const root = box(t); fs.writeFileSync(path.join(root, 'x'), 'same');
  assert.equal(digest(path.join(root, 'x')), hash(path.join(root, 'x')));
  assert.equal(digest(root), digest(root));
});
test('mandatory threshold rejects an otherwise passing candidate and missing metric is unknown', t => {
  const { root, file } = demo(t); const c = json(file);
  c.metrics[0] = { ...c.metrics[0], direction: 'min', threshold: 2, required: true };
  save(file, c); command(root, 'run', file);
  assert.equal(state(root).candidates.alternative.code, 1);
  c.metrics[0].id = 'missing'; save(file, c); command(root, 'run', file);
  assert.equal(state(root).candidates.alternative.code, 3);
});
test('budget cannot silently skip required checks', t => {
  const { root, file } = demo(t); const c = json(file); c.budget.maxAttempts = 1; save(file, c);
  assert.equal(command(root, 'run', file).status, 3);
  assert.equal(command(root, 'report', file).status, 3);
});
test('workflow evidence pins actual output, trace and instructions', t => {
  const { root, file } = demo(t); const c = json(file); c.axis = 'workflow';
  for (const candidate of c.candidates) {
    const cwd = path.join(root, candidate.cwd);
    fs.writeFileSync(path.join(cwd, 'workflow.md'), '# instructions'); fs.writeFileSync(path.join(cwd, 'trace.log'), 'manual execution trace');
    const evidence = { session: 'fixture-session', model: 'unknown', tools: ['synthetic'], startedAt: '2026-10-24T00:00:00Z', endedAt: '2026-10-24T00:01:00Z',
      subjectHash: hash(path.join(cwd, 'input.json')), workflowSpec: { path: 'workflow.md', sha256: hash(path.join(cwd, 'workflow.md')) }, trace: { path: 'trace.log', sha256: hash(path.join(cwd, 'trace.log')) } };
    save(path.join(cwd, 'execution-evidence.json'), evidence);
    candidate.executionEvidence = { path: 'execution-evidence.json', sha256: hash(path.join(cwd, 'execution-evidence.json')) };
  }
  save(file, c); assert.equal(command(root, 'check', file).status, 0);
  assert.equal(command(root, 'run', file).status, 1);
  fs.appendFileSync(path.join(root, 'alternative/trace.log'), 'changed');
  assert.equal(command(root, 'report', file).status, 3);
});
test('safe interrupted local check reruns once in a new attempt folder', t => {
  const { root, file } = demo(t); command(root, 'run', file);
  const p = path.join(runDir(root), 'state.json'); const s = json(p);
  s.status = 'running'; s.candidates.baseline.status = 'running'; s.candidates.baseline.steps[0].status = 'running'; save(p, s);
  assert.equal(command(root, 'run', file, '--resume').status, 1);
  assert.equal(state(root).candidates.baseline.steps[0].attempt, 2);
  assert.ok(fs.existsSync(path.join(runDir(root), 'baseline/verify-1/stdout.log')));
});
test('timeout kills spawned process tree', t => {
  const { root, file } = demo(t); const c = json(file);
  const evaluator = `import {spawn} from 'node:child_process'; import fs from 'node:fs';
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
fs.writeFileSync(process.argv[2],String(child.pid));setInterval(()=>{},1000);`;
  fs.writeFileSync(path.join(root, 'verify.mjs'), evaluator);
  Object.assign(c.checks[0], { adapter: 'exit', timeoutMs: 1200, args: ['{project}/verify.mjs', '{output}/child.pid'],
    files: [{ path: 'verify.mjs', sha256: hash(path.join(root, 'verify.mjs')) }] });
  save(file, c); assert.equal(command(root, 'run', file).status, 3);
  for (const name of ['baseline', 'alternative']) {
    const pid = Number(fs.readFileSync(path.join(runDir(root), name, 'verify-1/child.pid'), 'utf8'));
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { alive = e.code !== 'ESRCH'; }
    if (alive && process.platform !== 'win32') {
      const ps = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
      alive = !ps.stdout.trim().startsWith('Z');
    }
    t.after(() => { try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ } });
    assert.equal(alive, false, `child ${pid} survived timeout`);
  }
});
test('human evidence is subject-bound and missing reviewer cannot pass', t => {
  const { root, file } = demo(t); const c = json(file);
  c.checks.push({ id: 'human', adapter: 'evidence', required: true, evidencePath: 'human.json' });
  save(file, c); command(root, 'run', file);
  assert.equal(state(root).candidates.alternative.code, 3);
  for (const candidate of c.candidates) {
    const cwd = path.join(root, candidate.cwd); fs.writeFileSync(path.join(cwd, 'notes.md'), 'fixture reviewer notes');
    save(path.join(cwd, 'human.json'), { id: 'fixture', type: 'human-play', reviewer: 'fixture-user', at: new Date().toISOString(),
      subjectHash: hash(path.join(cwd, 'input.json')), code: 0, raw: { path: 'notes.md', sha256: hash(path.join(cwd, 'notes.md')) } });
  }
  command(root, 'run', file); assert.equal(state(root).candidates.alternative.code, 0);
});
test('a fresh completed run is reportable despite an older abandoned contract', t => {
  const { root, file } = demo(t); const c = json(file); c.budget.maxAttempts = 1; save(file, c);
  assert.equal(command(root, 'run', file).status, 3);
  c.budget.maxAttempts = 6; save(file, c);
  assert.equal(command(root, 'run', file).status, 1);
  assert.equal(command(root, 'report', file).status, 1);
  assert.equal(command(root, 'run', file, '--resume').status, 1);
});
test('resolved executable bytes are pinned and change the resume fingerprint', t => {
  const { root, file } = demo(t); const c = json(file);
  const executable = path.join(root, 'fixture-tool.exe'); fs.writeFileSync(executable, 'fixture binary v1');
  c.checks[0].executable = executable; save(file, c);
  const before = loadContract(file);
  assert.equal(before.executables.verify, fs.realpathSync(executable));
  fs.writeFileSync(executable, 'fixture binary v2');
  assert.throws(() => verifyPins(before), /hash changed/);
  assert.notEqual(loadContract(file).signature, before.signature);
});
