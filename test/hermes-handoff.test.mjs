import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../scripts/hermes-handoff.mjs', import.meta.url));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-handoff-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, name, value) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}
function run(root, args = []) {
  const result = spawnSync(process.execPath, [cli, '--project', root, ...args], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  return { ...result, report: result.stdout ? JSON.parse(result.stdout) : null };
}
function complete(root) {
  put(root, 'docs/pipeline/state.json', { openGates: ['core-review'], secret: 'do-not-emit' });
  put(root, '.review-loop/items.json', { items: [{ key: 'hero@1', status: 'revise', title: 'Hero' }] });
  put(root, '.review-loop/rules.json', { rules: [] });
  put(root, '.review-loop/reviews.jsonl', JSON.stringify({ itemKey: 'hero@1', decision: 'revise', comment: 'Keep sword visible', token: 'do-not-emit' }) + '\n');
}

test('missing state is unknown with exit 3, never an empty approved gate list', t => {
  const r = run(fixture(t));
  assert.equal(r.status, 3);
  assert.equal(r.report.pipeline.status, 'unknown');
  assert.equal(r.report.pipeline.openGates, null);
});

test('collects recorded gates and feedback without changing source bytes or emitting unrelated fields', t => {
  const root = fixture(t); complete(root);
  put(root, '.secrets/key.env', 'private-credential');
  const before = fs.readFileSync(path.join(root, '.review-loop/items.json'));
  const r = run(root);
  assert.equal(r.status, 0);
  assert.deepEqual(r.report.pipeline.openGates, ['core-review']);
  assert.equal(r.report.review.items[0].recordedStatus, 'revise');
  assert.equal(r.report.review.feedback[0].comment, 'Keep sword visible');
  assert.equal(r.report.review.approvalRevalidated, false);
  assert.doesNotMatch(r.stdout, /do-not-emit|private-credential/);
  assert.deepEqual(fs.readFileSync(path.join(root, '.review-loop/items.json')), before);
  assert.equal(fs.readdirSync(root).includes('.hermes'), false);
});

test('malformed JSON and invalid gate schema remain unknown', t => {
  const root = fixture(t); complete(root);
  put(root, 'docs/pipeline/state.json', { openGates: 'approved' });
  put(root, '.review-loop/items.json', '{broken');
  const r = run(root);
  assert.equal(r.status, 3);
  assert.equal(r.report.pipeline.openGates, null);
  assert.equal(r.report.review.items, null);
  assert.ok(r.report.sources.every(x => x.path && x.status));
});

test('rejects malformed review logs instead of silently dropping feedback', t => {
  const root = fixture(t); complete(root);
  put(root, '.review-loop/reviews.jsonl', '{broken\n');
  const r = run(root);
  assert.equal(r.status, 3);
  assert.equal(r.report.review.feedback, null);
});

test('refuses linked state files even inside the project', t => {
  const root = fixture(t); complete(root);
  const file = path.join(root, 'docs/pipeline/state.json');
  fs.renameSync(file, file + '.real');
  try { fs.symlinkSync(file + '.real', file); }
  catch (e) { if (e.code === 'EPERM') { t.skip('Windows symlink privilege unavailable'); return; } throw e; }
  const r = run(root);
  assert.equal(r.status, 3);
  assert.equal(r.report.sources.find(x => x.path === 'docs/pipeline/state.json').status, 'linked-path');
});

test('oversized state files are reported as unknown', t => {
  const root = fixture(t); complete(root);
  put(root, 'docs/pipeline/state.json', ' '.repeat(2 * 1024 * 1024 + 1));
  assert.equal(run(root).status, 3);
});

test('invalid project and unsupported flags are errors, without executing commands', t => {
  const root = fixture(t);
  assert.equal(run(path.join(root, 'missing')).status, 1);
  assert.equal(run(root, ['--exec', 'anything']).status, 1);
});

test('refuses a linked parent directory without reading outside project state', t => {
  const root = fixture(t); complete(root);
  const other = fixture(t);
  put(other, 'state.json', { openGates: ['outside-should-not-be-read'] });
  const dir = path.join(root, 'docs/pipeline');
  fs.rmSync(dir, { recursive: true });
  fs.symlinkSync(other, dir, process.platform === 'win32' ? 'junction' : 'dir');
  const r = run(root);
  assert.equal(r.status, 3);
  assert.equal(r.report.sources.find(x => x.path === 'docs/pipeline/state.json').status, 'linked-path');
  assert.doesNotMatch(r.stdout, /outside-should-not-be-read/);
});
