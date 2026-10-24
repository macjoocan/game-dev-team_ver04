// Immutable experiment inputs. No shell, model calls, or approval mutation.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
export const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
export const sha = data => createHash('sha256').update(data).digest('hex');
export const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
export function digest(p) {
  const stat = fs.lstatSync(p);
  requireThat(!stat.isSymbolicLink(), `symbolic link not allowed: ${p}`);
  if (stat.isFile()) return sha(fs.readFileSync(p));
  requireThat(stat.isDirectory(), `not a regular file/directory: ${p}`);
  return sha(stable(fs.readdirSync(p).sort().map(name => [name, digest(path.join(p, name))])));
}
export function inside(root, relative, mustExist = true) {
  requireThat(typeof relative === 'string' && relative.length > 0 && !path.isAbsolute(relative), `relative path required: ${relative}`);
  const p = path.resolve(root, relative);
  requireThat(p === root || (!path.relative(root, p).startsWith(`..${path.sep}`) && path.relative(root, p) !== '..' && !path.isAbsolute(path.relative(root, p))), `path outside project: ${relative}`);
  let cursor = p;
  while (cursor !== root) {
    if (fs.existsSync(cursor)) requireThat(!fs.lstatSync(cursor).isSymbolicLink(), `symbolic link path: ${relative}`);
    cursor = path.dirname(cursor);
  }
  if (mustExist) requireThat(fs.existsSync(p), `missing path: ${relative}`);
  return p;
}
export function pin(root, ref) {
  requireThat(ref && typeof ref.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(ref.sha256), 'reference sha256 required');
  const p = inside(root, ref.path);
  requireThat(digest(p) === ref.sha256.toLowerCase(), `hash mismatch: ${ref.path}`);
  return { path: p, sha256: ref.sha256.toLowerCase() };
}
const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value);
const positive = n => Number.isSafeInteger(n) && n > 0;
function executablePath(command) {
  if (command === '$NODE') return process.execPath;
  if (path.isAbsolute(command)) return fs.realpathSync(command);
  requireThat(!command.includes('/') && !command.includes('\\'), 'use absolute executable path or PATH name');
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE').split(';')] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) for (const ext of extensions) {
    const p = path.join(dir, command + ext);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return fs.realpathSync(p);
  }
  throw new Error(`executable not found: ${command}`);
}
function unique(items, label) {
  const ids = items.map(x => x.id);
  requireThat(ids.every(idOK) && new Set(ids).size === ids.length, `invalid/duplicate ${label} ids`);
}
export function loadContract(file) {
  file = path.resolve(file);
  const c = readJSON(file);
  requireThat(c.version === 1 && idOK(c.id), 'version 1 and stable id required');
  requireThat(['planning', 'development'].includes(c.domain), 'domain required');
  requireThat(['artifact', 'workflow'].includes(c.axis), 'axis required');
  requireThat(typeof c.purpose === 'string' && c.purpose.trim().length > 0 && !c.pending, 'purpose incomplete/pending');
  requireThat(typeof c.projectRoot === 'string', 'projectRoot required');
  const root = fs.realpathSync(path.resolve(path.dirname(file), c.projectRoot));
  requireThat(fs.statSync(root).isDirectory(), 'projectRoot is not a directory');
  requireThat(Array.isArray(c.references) && c.references.length > 0, 'target/requirements references required');
  const pins = c.references.map(ref => pin(root, ref));
  requireThat(c.lessonIntake && Array.isArray(c.lessonIntake.searched) && c.lessonIntake.searched.length > 0 && Array.isArray(c.lessonIntake.uses), 'lesson intake required');
  for (const lesson of c.lessonIntake.uses) {
    requireThat(lesson.id && lesson.reason && lesson.evidence && ['proposed', 'accepted', 'rejected'].includes(lesson.status), 'lesson metadata required');
    pins.push(pin(root, lesson));
    pins.push(pin(root, lesson.evidence));
    if (lesson.status === 'accepted') pins.push(pin(root, lesson.approval));
  }
  requireThat(c.conditions && Object.keys(c.conditions).length > 0, 'comparison conditions required (or explicit notApplicable reason)');
  requireThat(c.budget && positive(c.budget.maxAttempts) && positive(c.budget.maxDurationMs), 'positive execution budget required');
  requireThat(Array.isArray(c.candidates) && c.candidates.length >= 2 && c.candidates.length <= 3, '2–3 candidates required');
  unique(c.candidates, 'candidate');
  requireThat(c.candidates.some(x => x.id === c.baseline), 'baseline candidate missing');
  const subjects = {};
  for (const candidate of c.candidates) {
    requireThat(candidate.difference && Array.isArray(candidate.inputs) && candidate.inputs.length > 0, 'candidate difference and pinned inputs required');
    const cwd = inside(root, candidate.cwd);
    requireThat(fs.statSync(cwd).isDirectory(), 'candidate cwd must be directory');
    const localPins = candidate.inputs.map(ref => pin(cwd, ref));
    pins.push(...localPins);
    // Complete candidate tree is frozen; declared inputs alone cannot hide source changes.
    pins.push({ path: cwd, sha256: digest(cwd) });
    subjects[candidate.id] = digest(inside(cwd, candidate.subject));
    if (c.axis === 'workflow') {
      requireThat(candidate.executionEvidence, 'workflow execution evidence required');
      const evidencePin = pin(cwd, candidate.executionEvidence); pins.push(evidencePin);
      const e = readJSON(evidencePin.path);
      requireThat(e.session && e.model && e.startedAt && e.endedAt && Date.parse(e.endedAt) >= Date.parse(e.startedAt)
        && Array.isArray(e.tools) && e.tools.length > 0, 'workflow execution metadata incomplete');
      requireThat(e.subjectHash === subjects[candidate.id], 'workflow execution subject hash mismatch');
      for (const ref of [e.workflowSpec, e.trace]) pins.push(pin(cwd, ref));
    }
  }
  requireThat(Array.isArray(c.checks) && c.checks.length > 0, 'checks required');
  unique(c.checks, 'check');
  const executables = {};
  for (const check of c.checks) {
    requireThat(['exit', 'json', 'balance-sim', 'evidence'].includes(check.adapter), `unknown adapter: ${check.adapter}`);
    requireThat(typeof check.required === 'boolean', 'check.required must be boolean');
    if (check.adapter === 'evidence') { requireThat(check.evidencePath, 'evidencePath required'); continue; }
    requireThat(typeof check.executable === 'string' && check.executable.length > 0 && Array.isArray(check.args)
      && check.args.every(x => typeof x === 'string'), 'executable and string args required');
    executables[check.id] = executablePath(check.executable);
    pins.push({ path: executables[check.id], sha256: digest(executables[check.id]) });
    requireThat(positive(check.timeoutMs) && typeof check.retrySafe === 'boolean', 'timeoutMs and retrySafe required');
    requireThat(Array.isArray(check.files) && check.files.length > 0, 'fixed evaluator files required');
    pins.push(...check.files.map(ref => pin(root, ref)));
    if (check.adapter !== 'exit') requireThat(typeof check.result === 'string' && check.result.startsWith('{output}/'), 'fresh {output}/ result required');
    if (check.adapter === 'balance-sim') {
      requireThat(check.conditions && ['seed', 'runs', 'policy'].every(k => check.conditions[k] !== undefined
        && check.conditions[k] === c.conditions[k]), 'balance conditions must match experiment');
      requireThat(Array.isArray(check.target) && check.target.length === 2 && check.target.every(Number.isFinite)
        && check.target[0] >= 0 && check.target[1] <= 1 && check.target[0] < check.target[1], 'fixed winRate target required');
    }
    if (check.failureCodes) requireThat(check.failureCodes.every(n => Number.isInteger(n) && n > 0 && n !== 3), 'invalid failureCodes');
  }
  for (const m of c.metrics || []) {
    requireThat(m.id && c.checks.some(ch => ch.id === m.check) && m.unit && m.source && ['min', 'max', 'observe'].includes(m.direction), 'metric definition incomplete');
    if (m.threshold !== undefined) requireThat(Number.isFinite(m.threshold) && m.direction !== 'observe', 'metric threshold invalid');
    if (m.required) requireThat(m.threshold !== undefined, 'required metric needs a threshold');
  }
  const outputBase = inside(root, `out/experiments/${c.id}`, false);
  for (const p of pins) requireThat(!(outputBase === p.path || outputBase.startsWith(p.path + path.sep) || p.path.startsWith(outputBase + path.sep)), 'outputs overlap frozen inputs');
  const engine = path.dirname(fileURLToPath(import.meta.url));
  const toolFiles = ['candidate-contract.mjs', 'candidate-adapters.mjs', 'candidate-executor.mjs', 'candidate-run.mjs', 'lib-stats.mjs'];
  const toolHash = sha(stable(toolFiles.map(n => [n, digest(path.join(engine, n))])));
  const signature = sha(stable({ contract: c, pins, subjects, toolHash, node: process.version, executable: process.execPath, platform: process.platform, arch: process.arch }));
  return { file, root, contract: c, pins, subjects, signature, toolHash, outputBase, executables };
}
export function verifyPins(ctx) {
  for (const p of ctx.pins) requireThat(digest(p.path) === p.sha256, `frozen input/evaluator hash changed: ${p.path}`);
}
export function provenance(root) {
  const git = args => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  return { commit: git(['rev-parse', 'HEAD']), dirty: !!git(['status', '--porcelain']), node: process.version, platform: process.platform, arch: process.arch };
}
