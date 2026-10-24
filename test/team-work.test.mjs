import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../scripts/team-work.mjs', import.meta.url));
function box(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'team-work-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function run(root, action, ...args) {
  if (action !== 'brief' && !args.includes('--revision')) {
    try { args.push('--revision', String(JSON.parse(fs.readFileSync(path.join(root, '.team-work/state.json'), 'utf8')).revision)); } catch { /* new or damaged store */ }
  }
  return spawnSync(process.execPath, [cli, action, '--project', root, ...args], { encoding: 'utf8', timeout: 5000 });
}
function add(root) { return run(root, 'add', '--id', 'hero-walk', '--title', 'Hero walk', '--role', 'artist', '--next', 'Inspect feet', '--actor', 'codex'); }
const stateFile = root => path.join(root, '.team-work/state.json');
const state = root => JSON.parse(fs.readFileSync(stateFile(root), 'utf8'));
function proof(root) { fs.writeFileSync(path.join(root, 'qa.txt'), 'actual existing output'); return run(root, 'evidence', '--id', 'hero-walk', '--file', 'qa.txt', '--actor', 'codex'); }

test('new sessions resume checkpoints and role handoff with audit events', t => {
  const root = box(t);
  assert.equal(add(root).status, 0);
  assert.equal(run(root, 'checkpoint', '--id', 'hero-walk', '--status', 'blocked', '--reason', 'Need reference', '--next', 'Read reference', '--note', 'Walk drifts', '--actor', 'codex').status, 0);
  assert.equal(run(root, 'handoff', '--id', 'hero-walk', '--role', 'qa', '--next', 'Compare baseline', '--note', 'Check 03-06', '--actor', 'claude-code').status, 0);
  const brief = run(root, 'brief');
  assert.equal(brief.status, 3); // No project gates/review ledger exists in fixture.
  const data = JSON.parse(brief.stdout);
  assert.equal(data.work.tasks[0].role, 'qa');
  assert.equal(data.work.tasks[0].next, 'Compare baseline');
  assert.equal(data.work.tasks[0].reason, 'Need reference');
  assert.equal(state(root).revision, 3);
  assert.equal(state(root).events[2].fromRole, 'artist');
});

test('duplicate IDs and invalid blocked checkpoints leave bytes unchanged', t => {
  const root = box(t); assert.equal(add(root).status, 0);
  const before = fs.readFileSync(stateFile(root));
  assert.equal(add(root).status, 1);
  assert.equal(run(root, 'checkpoint', '--id', 'hero-walk', '--status', 'blocked', '--next', 'Wait', '--actor', 'codex').status, 1);
  assert.deepEqual(fs.readFileSync(stateFile(root)), before);
});

test('evidence is attached as an unverified receipt and stale content prevents done', t => {
  const root = box(t); add(root);
  assert.equal(proof(root).status, 0);
  const receipt = state(root).tasks[0].evidence[0];
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.validationExecuted, false);
  fs.writeFileSync(path.join(root, 'qa.txt'), 'changed evidence');
  assert.equal(run(root, 'checkpoint', '--id', 'hero-walk', '--status', 'done', '--next', 'Human review', '--actor', 'codex').status, 1);
  const brief = JSON.parse(run(root, 'brief').stdout);
  assert.equal(brief.work.tasks[0].evidence[0].freshness, 'changed');
  assert.notEqual(brief.work.tasks[0].evidence[0].actualSha256, receipt.sha256);
});

test('done requires fresh evidence but does not approve production or close a gate', t => {
  const root = box(t); add(root);
  assert.equal(run(root, 'checkpoint', '--id', 'hero-walk', '--status', 'done', '--next', 'Review', '--actor', 'codex').status, 1);
  proof(root);
  assert.equal(run(root, 'checkpoint', '--id', 'hero-walk', '--status', 'done', '--next', 'Human review', '--actor', 'codex').status, 0);
  assert.equal(fs.existsSync(path.join(root, 'docs/pipeline/state.json')), false);
  assert.equal(fs.existsSync(path.join(root, '.review-loop')), false);
});

test('lessons stay proposals, and brief rechecks their evidence', t => {
  const root = box(t); add(root); proof(root);
  assert.equal(run(root, 'lesson', '--id', 'hero-walk', '--note', 'Use a shared palette', '--file', 'qa.txt', '--actor', 'codex').status, 0);
  const proposal = state(root).lessonProposals[0];
  assert.equal(proposal.status, 'proposed');
  assert.equal(fs.existsSync(path.join(root, '.review-loop/rules.json')), false);
  fs.unlinkSync(path.join(root, 'qa.txt'));
  const brief = JSON.parse(run(root, 'brief').stdout);
  assert.equal(brief.work.lessonProposals[0].evidence.freshness, 'missing');
});

test('corruption and existing locks cannot be overwritten', t => {
  const root = box(t); add(root);
  fs.writeFileSync(stateFile(root), '{broken');
  assert.equal(add(root).status, 3);
  assert.equal(fs.readFileSync(stateFile(root), 'utf8'), '{broken');
  fs.writeFileSync(path.join(root, '.team-work/write.lock'), 'another writer');
  assert.equal(add(root).status, 1);
  assert.equal(fs.readFileSync(path.join(root, '.team-work/write.lock'), 'utf8'), 'another writer');
});

test('sensitive and escaping evidence paths are refused', t => {
  const root = box(t); add(root);
  fs.mkdirSync(path.join(root, '.secrets')); fs.writeFileSync(path.join(root, '.secrets/key'), 'not-to-read');
  fs.writeFileSync(path.join(root, '.env'), 'not-to-read');
  for (const file of ['../outside.txt', '.secrets/key', '.env']) {
    assert.equal(run(root, 'evidence', '--id', 'hero-walk', '--file', file, '--actor', 'codex').status, 1);
  }
  assert.equal(state(root).tasks[0].evidence.length, 0);
});

test('linked store directories are refused without writing outside the project', t => {
  const root = box(t), outside = box(t);
  fs.symlinkSync(outside, path.join(root, '.team-work'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(add(root).status, 1);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('unsupported options, actors and roles are errors', t => {
  const root = box(t);
  assert.equal(run(root, 'add', '--id', 'x', '--title', 'x', '--role', 'admin', '--next', 'x', '--actor', 'codex').status, 1);
  assert.equal(run(root, 'brief', '--exec', 'anything').status, 1);
  assert.equal(fs.existsSync(stateFile(root)), false);
});

test('Unicode notes survive cross-session reload and brief is read-only', t => {
  const root = box(t); add(root);
  const next = '03~06 프레임 발 방향 확인';
  assert.equal(run(root, 'checkpoint', '--id', 'hero-walk', '--status', 'active', '--next', next, '--note', '칼 위치 유지', '--actor', 'claude-code').status, 0);
  const before = fs.readFileSync(stateFile(root));
  assert.equal(JSON.parse(run(root, 'brief').stdout).work.tasks[0].next, next);
  assert.deepEqual(fs.readFileSync(stateFile(root)), before);
});

test('a linked evidence parent is refused even when the destination file exists', t => {
  const root = box(t), outside = box(t); add(root);
  fs.writeFileSync(path.join(outside, 'qa.txt'), 'outside');
  fs.symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(run(root, 'evidence', '--id', 'hero-walk', '--file', 'linked/qa.txt', '--actor', 'codex').status, 1);
  assert.equal(state(root).tasks[0].evidence.length, 0);
});

test('stale sessions cannot overwrite a newer checkpoint', t => {
  const root = box(t); add(root);
  const revision = state(root).revision;
  assert.equal(run(root, 'checkpoint', '--id', 'hero-walk', '--status', 'active', '--next', 'New plan', '--actor', 'claude-code', '--revision', String(revision)).status, 0);
  const before = fs.readFileSync(stateFile(root));
  const stale = run(root, 'handoff', '--id', 'hero-walk', '--role', 'qa', '--next', 'Old plan', '--note', 'Stale session', '--actor', 'codex', '--revision', String(revision));
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /revision/i);
  assert.deepEqual(fs.readFileSync(stateFile(root)), before);
});

test('existing stores require an explicit observed revision', t => {
  const root = box(t); add(root);
  const r = spawnSync(process.execPath, [cli, 'checkpoint', '--project', root, '--id', 'hero-walk', '--status', 'active', '--next', 'Continue', '--actor', 'codex'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /revision/i);
  assert.equal(state(root).revision, 1);
});
