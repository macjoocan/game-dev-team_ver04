#!/usr/bin/env node
// Shared local continuity for existing harnesses. No model/provider execution.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectHandoff } from './team-handoff.mjs';

const MAX = 2 * 1024 * 1024;
const ROLES = ['pm', 'game-designer', 'developer', 'qa', 'artist', 'meta-economy-designer'];
const STATUSES = ['todo', 'active', 'blocked', 'review', 'done'];
const ACTORS = ['codex', 'claude-code', 'human'];
const ok = (condition, message) => { if (!condition) throw new Error(message); };
const str = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 4000;
const idOK = x => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(x);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
class UnknownState extends Error { constructor(message) { super(message); this.exitCode = 3; } }

function safePath(root, relative, sensitive = false) {
  ok(typeof relative === 'string' && relative && !path.isAbsolute(relative), 'Project-relative path required');
  const target = path.resolve(root, relative), rel = path.relative(root, target);
  ok(rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel), 'Path outside project');
  const parts = rel.split(path.sep);
  if (sensitive) ok(!parts.some(x => ['.secrets', '.git'].includes(x.toLowerCase()) || /^\.env(?:\.|$)/i.test(x)), 'Sensitive path refused');
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try { ok(!fs.lstatSync(current).isSymbolicLink(), 'Linked paths are refused'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return target;
}

function fileReceipt(root, relative) {
  const file = safePath(root, relative, true), stat = fs.statSync(file);
  ok(stat.isFile() && stat.size <= MAX, 'Evidence must be a regular file up to 2 MiB');
  const bytes = fs.readFileSync(file);
  ok(bytes.length <= MAX, 'Evidence exceeds 2 MiB');
  return { path: path.relative(root, file).split(path.sep).join('/'), sha256: sha(bytes), validationExecuted: false };
}
function receiptStatus(root, receipt) {
  try {
    const actual = fileReceipt(root, receipt.path);
    return { ...receipt, actualSha256: actual.sha256, freshness: receipt.sha256 === actual.sha256 ? 'same' : 'changed' };
  } catch (e) {
    return { ...receipt, actualSha256: null, freshness: e.code === 'ENOENT' ? 'missing' : 'unknown' };
  }
}
const receiptValid = e => e && str(e.path) && /^[a-f0-9]{64}$/.test(e.sha256) && e.validationExecuted === false;
function load(root) {
  const file = safePath(root, '.team-work/state.json');
  if (!fs.existsSync(file)) return null;
  try {
    ok(fs.statSync(file).isFile() && fs.statSync(file).size <= MAX, 'State too large or not a file');
    const db = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    ok(db.schemaVersion === 1 && Number.isSafeInteger(db.revision) && db.revision >= 0
      && Array.isArray(db.tasks) && Array.isArray(db.events) && Array.isArray(db.lessonProposals), 'Unsupported state schema');
    ok(db.tasks.every(t => t && idOK(t.id) && str(t.title) && ROLES.includes(t.role) && STATUSES.includes(t.status)
      && str(t.next) && typeof t.reason === 'string' && typeof t.note === 'string' && Array.isArray(t.evidence) && t.evidence.every(receiptValid)), 'Invalid task schema');
    ok(new Set(db.tasks.map(t => t.id)).size === db.tasks.length, 'Duplicate task IDs');
    ok(db.lessonProposals.every(p => p && p.status === 'proposed' && idOK(p.taskId) && str(p.note) && receiptValid(p.evidence)), 'Invalid proposal schema');
    ok(db.events.every(e => e && typeof e.action === 'string' && ACTORS.includes(e.actor)), 'Invalid event schema');
    return db;
  } catch { throw new UnknownState('State is damaged or unsupported; preserve the original and recover it manually.'); }
}

export function briefProject(project) {
  const root = fs.realpathSync(path.resolve(project));
  let work, unknown = false;
  try {
    const db = load(root);
    if (!db) { work = { status: 'unknown', tasks: [], lessonProposals: [], events: [] }; unknown = true; }
    else {
      const tasks = db.tasks.map(t => ({ ...t, evidence: t.evidence.map(e => receiptStatus(root, e)) }));
      const proposals = db.lessonProposals.map(p => ({ ...p, evidence: receiptStatus(root, p.evidence) }));
      unknown = tasks.some(t => (t.status === 'done' && t.evidence.length === 0) || t.evidence.some(e => e.freshness !== 'same')) || proposals.some(p => p.evidence.freshness !== 'same');
      work = { status: unknown ? 'unknown' : 'recorded', revision: db.revision, tasks, lessonProposals: proposals, events: db.events.slice(-20) };
    }
  } catch { work = { status: 'unknown', error: 'Cannot read work state; preserve it for recovery.', tasks: null, lessonProposals: null }; unknown = true; }
  const handoff = collectHandoff(root);
  return { schemaVersion: 1, project: root, work, handoff, collectionStatus: unknown || handoff.collectionStatus === 'unknown' ? 'unknown' : 'collected',
    boundaries: { modelCalls: 0, paidSubmissionEnabled: false, taskDoneIsGateApproval: false, evidenceReceiptIsTestPass: false, lessonPromotionEnabled: false } };
}

export function updateWork(project, action, options) {
  const root = fs.realpathSync(path.resolve(project));
  ok(fs.statSync(root).isDirectory(), 'Project directory required');
  ok(ACTORS.includes(options.actor), 'Explicit --actor codex|claude-code|human required');
  ok(idOK(options.id), 'Stable --id required');
  const dir = safePath(root, '.team-work');
  fs.mkdirSync(dir, { recursive: true });
  const lock = safePath(root, '.team-work/write.lock');
  let handle;
  try { handle = fs.openSync(lock, 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') throw new Error('Work store locked; never steal a lock automatically.'); throw e; }
  let temp;
  try {
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, actor: options.actor }));
    const db = load(root) ?? { schemaVersion: 1, revision: 0, tasks: [], events: [], lessonProposals: [] };
    const event = { action, actor: options.actor, taskId: options.id, createdAt: new Date().toISOString() };
    const task = db.tasks.find(t => t.id === options.id);
    if (action === 'add') {
      ok(!task, 'Duplicate task ID'); ok(str(options.title) && str(options.next) && ROLES.includes(options.role), 'Title, next action and valid role required');
      db.tasks.push({ id: options.id, title: options.title, role: options.role, status: 'todo', next: options.next, reason: '', note: '', evidence: [] });
      event.toRole = options.role;
    } else {
      ok(task, 'Unknown task ID');
      if (action === 'checkpoint') {
        ok(STATUSES.includes(options.status) && str(options.next), 'Valid status and next action required');
        ok(options.status !== 'blocked' || str(options.reason), 'Blocked work needs a reason');
        if (options.status === 'done') ok(task.evidence.length > 0 && task.evidence.every(e => receiptStatus(root, e).freshness === 'same'), 'Done needs at least one fresh evidence file; this does not approve a gate.');
        event.fromStatus = task.status; event.toStatus = options.status;
        task.status = options.status; task.next = options.next; task.reason = options.status === 'blocked' ? options.reason : ''; task.note = options.note ?? '';
        event.next = task.next; event.note = task.note; event.reason = task.reason;
      } else if (action === 'handoff') {
        ok(ROLES.includes(options.role) && str(options.next) && str(options.note), 'Handoff needs valid role, next action and note');
        event.fromRole = task.role; event.toRole = options.role;
        task.role = options.role; task.next = options.next; task.note = options.note;
        event.next = task.next; event.note = task.note;
      } else if (action === 'evidence') {
        const receipt = fileReceipt(root, options.file);
        const index = task.evidence.findIndex(e => e.path === receipt.path);
        if (index < 0) task.evidence.push(receipt); else task.evidence[index] = receipt;
        event.receipt = receipt;
      } else if (action === 'lesson') {
        ok(str(options.note), 'Lesson note required');
        const proposal = { id: randomUUID(), taskId: task.id, status: 'proposed', note: options.note, evidence: fileReceipt(root, options.file), actor: options.actor };
        db.lessonProposals.push(proposal); event.proposalId = proposal.id;
      } else throw new Error('Unsupported action');
    }
    db.revision++; db.events.push(event);
    const bytes = JSON.stringify(db, null, 2) + '\n';
    ok(Buffer.byteLength(bytes) <= MAX, 'State exceeds 2 MiB; preserve and archive it manually');
    temp = safePath(root, `.team-work/state.tmp-${randomUUID()}`);
    fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, safePath(root, '.team-work/state.json')); temp = null;
    return { revision: db.revision, event, gateApprovalChanged: false };
  } finally {
    if (temp && fs.existsSync(temp)) fs.unlinkSync(temp);
    fs.closeSync(handle); fs.unlinkSync(lock);
  }
}

const allowed = {
  brief: ['project'],
  add: ['project', 'actor', 'id', 'title', 'role', 'next'],
  checkpoint: ['project', 'actor', 'id', 'status', 'next', 'reason', 'note'],
  handoff: ['project', 'actor', 'id', 'role', 'next', 'note'],
  evidence: ['project', 'actor', 'id', 'file'],
  lesson: ['project', 'actor', 'id', 'file', 'note'],
};
export function runWorkCli(args = process.argv.slice(2)) {
  try {
    if (args.length === 1 && args[0] === '--help') { console.log('team-work.mjs <brief|add|checkpoint|handoff|evidence|lesson> --project <root> [options]\nSee scripts/team-work.md. No model or provider calls.'); return; }
    const [action, ...pairs] = args; ok(allowed[action] && pairs.length % 2 === 0, 'Invalid command or options');
    const options = {};
    for (let i = 0; i < pairs.length; i += 2) {
      const key = pairs[i].slice(2), value = pairs[i + 1];
      ok(pairs[i].startsWith('--') && allowed[action].includes(key) && !(key in options) && str(value), 'Unknown, duplicate or empty option');
      options[key] = value;
    }
    ok(str(options.project), '--project required');
    const report = action === 'brief' ? briefProject(options.project) : updateWork(options.project, action, options);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.collectionStatus === 'unknown' ? 3 : 0;
  } catch (e) { console.error(e.message); process.exitCode = e.exitCode ?? 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runWorkCli();
