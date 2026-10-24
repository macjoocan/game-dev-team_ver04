import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { aggregate, normalize, metricResults } from './candidate-adapters.mjs';
import { digest, inside, readJSON, requireThat, stable, verifyPins, provenance } from './candidate-contract.mjs';

export function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, p);
}
const relative = (root, p) => path.relative(root, p).split(path.sep).join('/');
const stamp = () => new Date().toISOString();
const proof = (root, p) => ({ path: relative(root, p), sha256: digest(p) });
export function expand(text, values) {
  const value = text.replace(/\{(project|candidate|output)\}/g, (_, name) => values[name]);
  requireThat(!/\{(?:project|candidate|output)\}/.test(value), 'unresolved command path');
  return value;
}
export function latest(ctx, forResume = false) {
  requireThat(fs.existsSync(ctx.outputBase), 'no existing run');
  const dirs = fs.readdirSync(ctx.outputBase, { withFileTypes: true }).filter(e => e.isDirectory());
  const runs = dirs.map(e => ({ dir: inside(ctx.outputBase, e.name), state: readJSON(inside(ctx.outputBase, `${e.name}/state.json`)) }))
    .sort((a, b) => b.state.createdAt.localeCompare(a.state.createdAt));
  requireThat(runs.length > 0, 'no existing run');
  if (!forResume) return runs[0];
  const matching = runs.filter(r => r.state.signature === ctx.signature);
  requireThat(matching.length > 0, 'contract/input/tool hash changed; use a new run');
  const pending = matching.filter(r => r.state.status !== 'complete');
  requireThat(pending.length <= 1, 'multiple unfinished runs; resolve explicitly before resume');
  return pending[0] || matching[0];
}
export function verifyState(ctx, runDir, state) {
  requireThat(state.signature === ctx.signature, 'contract/input/tool hash changed; use a new run');
  verifyPins(ctx);
  for (const [id, candidate] of Object.entries(state.candidates)) {
    requireThat(ctx.contract.candidates.some(c => c.id === id), 'unknown candidate in state');
    for (const step of candidate.steps || []) if (step.status === 'complete') {
      requireThat(Array.isArray(step.proofs) && step.proofs.length >= 2, 'missing raw evidence proofs');
      for (const ref of step.proofs) requireThat(digest(inside(runDir, ref.path)) === ref.sha256, `evidence hash mismatch: ${ref.path}`);
      const stored = readJSON(inside(runDir, step.result));
      requireThat(stable(stored.normalized) === stable(step.normalized), 'normalized evidence mismatch');
      const check = ctx.contract.checks.find(ch => ch.id === step.id);
      requireThat(check, 'unknown check in evidence');
      // Recompute from captured process/data, not a hand-edited aggregate verdict.
      if (!stored.measurementError) {
        const actual = normalize(check, stored.process, stored.payload, ctx.subjects[id]);
        requireThat(stable(actual) === stable(step.normalized), 'captured process/data verdict mismatch');
      } else requireThat(step.normalized.code === 3 && step.normalized.why === stored.measurementError, 'measurement error verdict mismatch');
    }
  }
}
function acquire(ctx) {
  fs.mkdirSync(ctx.outputBase, { recursive: true });
  const p = path.join(ctx.outputBase, '.lock');
  if (fs.existsSync(p)) {
    // Never delete a lock after a read/check: another writer could have replaced it.
    throw new Error('lock exists; verify owner is stopped and remove manually before resume');
  }
  const owner = { pid: process.pid, host: os.hostname(), at: stamp(), token: randomUUID() };
  fs.writeFileSync(p, JSON.stringify(owner), { flag: 'wx' });
  return () => { if (fs.existsSync(p) && readJSON(p).token === owner.token) fs.unlinkSync(p); };
}
function killTree(child) {
  if (!child.pid) return { ok: true };
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
    return { ok: r.status === 0, error: r.status === 0 ? undefined : `taskkill failed: ${r.error?.code || r.status}` };
  }
  try { process.kill(-child.pid, 'SIGKILL'); return { ok: true }; }
  catch (e) { return { ok: e.code === 'ESRCH', error: e.code }; }
}
export async function execute(check, cwd, values, stdout, stderr, timeout, signal, terminate = killTree) {
  const executable = check.executable === '$NODE' ? process.execPath : check.executable;
  const args = check.args.map(a => expand(a, values));
  const out = fs.openSync(stdout, 'wx'), err = fs.openSync(stderr, 'wx');
  let child, timer, abort, cleanupTimer, settle, stopping = false;
  const p = { executable, args, cwd, startedAt: stamp(), exitCode: null, timedOut: false, interrupted: false };
  try {
    child = spawn(executable, args, { cwd, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', out, err] });
    p.pid = child.pid;
    const stopChild = () => {
      if (stopping) return;
      stopping = true;
      let outcome;
      try { outcome = terminate(child); } catch (e) { outcome = { ok: false, error: e.code || e.message }; }
      if (!outcome.ok) {
        p.terminationError = outcome.error || 'process tree cleanup unconfirmed';
        p.error = p.terminationError;
        // Stop our direct child where possible, but never claim its descendants were cleaned.
        try { child.kill('SIGKILL'); } catch { /* lock remains for manual cleanup */ }
        child.unref();
        cleanupTimer = setTimeout(() => settle?.(), 1000);
      }
    };
    abort = () => { p.interrupted = true; stopChild(); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    timer = setTimeout(() => { p.timedOut = true; stopChild(); }, timeout);
    await new Promise(resolve => {
      settle = resolve;
      child.on('error', e => { p.error = e.message; resolve(); });
      child.on('close', (code, sig) => { p.exitCode = code; p.signal = sig; resolve(); });
    });
  } finally {
    clearTimeout(timer);
    clearTimeout(cleanupTimer);
    if (abort) signal.removeEventListener('abort', abort);
    // POSIX descendants share an isolated group, even when the root exits first.
    if (child && process.platform !== 'win32') {
      const cleanup = killTree(child);
      if (!cleanup.ok) { p.terminationError = cleanup.error; p.error = cleanup.error; }
    }
    fs.closeSync(out); fs.closeSync(err); p.endedAt = stamp();
  }
  return p;
}
function resultFromFile(ctx, check, candidate, values) {
  if (check.adapter === 'exit') return { data: undefined, externalProofs: [] };
  const cwd = values.candidate;
  if (check.adapter === 'evidence') {
    const file = inside(cwd, check.evidencePath);
    const data = readJSON(file);
    const raw = inside(cwd, data.raw.path);
    requireThat(digest(raw) === data.raw.sha256, 'human raw evidence hash mismatch');
    return { data, externalProofs: [file, raw] };
  }
  const full = expand(check.result, values);
  const p = inside(values.output, relative(values.output, full));
  return { data: readJSON(p), output: p, externalProofs: [] };
}
export async function run(ctx, { resume = false } = {}) {
  const unlock = acquire(ctx);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  let state, dir, cleanupBlocked = false;
  try {
    if (resume) {
      ({ state, dir } = latest(ctx, true)); verifyState(ctx, dir, state);
      requireThat(!state.cleanupRequired, 'cleanup-blocked execution cannot resume; verify cleanup and start a new run');
      if (state.status === 'complete') return { dir, state, code: state.code };
    } else {
      const runId = `${stamp().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
      dir = path.join(ctx.outputBase, runId); fs.mkdirSync(dir);
      state = { version: 1, createdAt: stamp(), signature: ctx.signature, toolHash: ctx.toolHash,
        provenance: { ...provenance(ctx.root), candidates: Object.fromEntries(ctx.contract.candidates.map(c => [c.id, provenance(inside(ctx.root, c.cwd))])) },
        status: 'running', attempts: 0, durationMs: 0, candidates: {} };
      writeJSON(path.join(dir, 'contract.json'), ctx.contract);
    }
    const persist = () => writeJSON(path.join(dir, 'state.json'), state);
    persist();
    const ordered = [...ctx.contract.candidates].sort((a, b) => a.id === ctx.contract.baseline ? -1 : b.id === ctx.contract.baseline ? 1 : 0);
    for (const candidate of ordered) {
      const entry = state.candidates[candidate.id] ||= { status: 'running', steps: [] };
      for (const check of ctx.contract.checks) {
        let step = entry.steps.find(s => s.id === check.id);
        if (step?.status === 'complete') continue;
        if (step) {
          step.status = 'interrupted'; persist();
          requireThat(check.retrySafe === true, `interrupted ${candidate.id}/${check.id}: retrySafe is false; inspect before a new run`);
        }
        requireThat(state.attempts < ctx.contract.budget.maxAttempts && state.durationMs < ctx.contract.budget.maxDurationMs, 'execution budget exhausted');
        if (controller.signal.aborted) throw new Error('interrupted');
        verifyPins(ctx);
        const attempt = (step?.attempt || 0) + 1;
        const output = path.join(dir, candidate.id, `${check.id}-${attempt}`); fs.mkdirSync(output, { recursive: true });
        const values = { project: ctx.root, candidate: inside(ctx.root, candidate.cwd), output };
        step = { id: check.id, attempt, status: 'running', startedAt: stamp(), stdout: relative(dir, path.join(output, 'stdout.log')),
          stderr: relative(dir, path.join(output, 'stderr.log')) };
        const index = entry.steps.findIndex(s => s.id === check.id);
        if (index >= 0) entry.steps[index] = step; else entry.steps.push(step);
        state.attempts++; persist();
        const start = Date.now();
        const stdout = path.join(dir, step.stdout), stderr = path.join(dir, step.stderr);
        let proc;
        if (check.adapter === 'evidence') { fs.writeFileSync(stdout, ''); fs.writeFileSync(stderr, ''); proc = { exitCode: 0 }; }
        else proc = await execute({ ...check, executable: ctx.executables[check.id] }, values.candidate, values, stdout, stderr,
          Math.min(check.timeoutMs, ctx.contract.budget.maxDurationMs - state.durationMs), controller.signal);
        if (proc.terminationError) cleanupBlocked = true;
        state.durationMs += Date.now() - start;
        let payload, normalized, measurementError, extras = [];
        try {
          verifyPins(ctx);
          const parsed = resultFromFile(ctx, check, candidate, values); payload = parsed.data;
          if (parsed.output) extras.push(parsed.output);
          // Copy external evidence into the run so old results cannot change invisibly.
          for (const [i, p] of parsed.externalProofs.entries()) {
            const target = path.join(output, `external-${i}.json`); fs.copyFileSync(p, target); extras.push(target);
          }
          normalized = normalize(check, proc, payload, ctx.subjects[candidate.id]);
        } catch (e) { measurementError = e.message; normalized = { code: 3, why: e.message, metrics: {} }; }
        const resultPath = path.join(output, 'process.json');
        writeJSON(resultPath, { process: proc, normalized, payload, measurementError });
        Object.assign(step, { status: proc.interrupted ? 'interrupted' : 'complete', normalized,
          result: relative(dir, resultPath), endedAt: stamp(), proofs: [stdout, stderr, resultPath, ...extras].map(p => proof(dir, p)) });
        persist();
        if (cleanupBlocked) {
          state.status = 'blocked'; state.code = 3;
          state.cleanupRequired = { pid: proc.pid, reason: proc.terminationError };
          persist();
          throw new Error('Process tree cleanup unconfirmed; lock retained. Verify processes stopped before manual recovery.');
        }
        if (controller.signal.aborted) throw new Error('interrupted');
      }
      entry.metrics = metricResults(ctx.contract, entry);
      entry.code = aggregate([...ctx.contract.checks.filter(c => c.required).map(c => entry.steps.find(s => s.id === c.id)?.normalized?.code ?? 3),
        ...entry.metrics.filter(m => m.required).map(m => m.code)]);
      entry.status = 'complete'; persist();
    }
    state.code = aggregate(Object.values(state.candidates).map(c => c.code));
    state.status = 'complete'; persist();
    return { dir, state, code: state.code };
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    if (!cleanupBlocked) unlock();
  }
}
export function report(ctx) {
  const { dir, state } = latest(ctx); verifyState(ctx, dir, state);
  requireThat(state.status === 'complete' && ctx.contract.candidates.every(c => state.candidates[c.id]?.status === 'complete'), 'run incomplete');
  const gaps = [];
  const rows = ctx.contract.candidates.map(c => {
    const entry = state.candidates[c.id];
    for (const check of ctx.contract.checks) {
      const step = entry.steps.find(s => s.id === check.id);
      requireThat(step?.status === 'complete', 'missing check evidence');
      if (step.normalized.code === 3) gaps.push(`${c.id}/${check.id}: ${step.normalized.why}`);
    }
    const measured = metricResults(ctx.contract, entry);
    const recomputed = aggregate([...ctx.contract.checks.filter(ch => ch.required).map(ch => entry.steps.find(s => s.id === ch.id).normalized.code),
      ...measured.filter(m => m.required).map(m => m.code)]);
    requireThat(entry.code === recomputed, 'candidate verdict mismatch');
    return `| ${c.id} | ${c.id === ctx.contract.baseline ? 'baseline' : 'candidate'} | ${entry.code} | ${c.difference} |`;
  });
  requireThat(state.code === aggregate(Object.values(state.candidates).map(c => c.code)), 'run verdict mismatch');
  const lines = [`# ${ctx.contract.id}: ${ctx.contract.purpose}`, '', '## 주장', `검증 집계: ${state.code} (후보 전체; 자동 채택 아님).`, '',
    '| 후보 | 구분 | 코드 | 차이 |', '|---|---|---|---|', ...rows, '', '## 증거',
    `run: ${relative(ctx.root, dir)} · commit: ${state.provenance.commit || 'unknown'} · dirty: ${state.provenance.dirty}`,
    `계약 fingerprint: ${ctx.signature}`, '각 check의 process.json과 stdout/stderr에 실제 명령·실행 결과가 보존됨.', '', '## 기준',
    ...ctx.contract.references.map(r => `- ${r.path}: ${r.sha256}`), '', '### 지표 (임계값 없으면 참고)',
    '| 후보 | 지표 | 값 | 단위 | 방향 | 기준 |', '|---|---|---|---|---|---|'];
  for (const c of ctx.contract.candidates) for (const m of ctx.contract.metrics || []) {
    const value = state.candidates[c.id].steps.find(s => s.id === m.check)?.normalized.metrics[m.id];
    lines.push(`| ${c.id} | ${m.id} | ${value ?? '측정 불가'} | ${m.unit} | ${m.direction}${m.threshold === undefined ? '' : ` ${m.threshold}`} | ${m.source} |`);
  }
  lines.push('', '## 공백', ...(gaps.length ? gaps.map(g => `- ${g}`) : ['- 각 check의 검증 범위 밖은 미검증.']),
    '- 사람의 게임성·아트·merge 승인은 이 도구가 내리지 않음.', '', '## 잔여 위험',
    '- 합성 fixture는 실제 게임 성능/재미를 증명하지 않음. 외부 증거의 사람 신원은 인증하지 않음.',
    '- 실행기는 샌드박스가 아님. 명시한 입력·검증 경로 밖의 의존성은 별도로 고정해야 함.', '');
  fs.writeFileSync(path.join(dir, 'report.md'), lines.join('\n'));
  writeJSON(path.join(dir, 'comparison.json'), { code: state.code, candidates: state.candidates, signature: ctx.signature });
  return { dir, state, code: state.code };
}
export function record(ctx, candidate, reason) {
  const { dir, state } = report(ctx);
  requireThat(typeof reason === 'string' && reason.trim().length > 0, 'reason required');
  requireThat(state.candidates[candidate]?.code === 0, 'candidate has failed or missing mandatory evidence');
  const decision = { candidate, reason, status: 'proposed', at: stamp(), signature: ctx.signature,
    evidenceHash: digest(path.join(dir, 'comparison.json')), approval: 'not granted' };
  requireThat(!fs.existsSync(path.join(dir, 'decision.json')), 'decision exists; do not overwrite');
  writeJSON(path.join(dir, 'decision.json'), decision);
  const lesson = { status: 'proposed', experiment: ctx.contract.id, candidate, reason, conditions: ctx.contract.conditions,
    evidence: relative(ctx.root, dir), limitations: 'one experiment; review before reuse' };
  writeJSON(path.join(dir, 'lesson-proposal.json'), lesson);
  return decision;
}
