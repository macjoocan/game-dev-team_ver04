#!/usr/bin/env node
// Fixed-source, local-only handoff. No provider calls, approval writes or command runner.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LIMIT = 2 * 1024 * 1024;
const text = x => typeof x === 'string' ? x.slice(0, 1000) : null;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const fields = (x, keys) => Object.fromEntries(keys.map(k => [k, text(x[k])]));

export function collectHandoff(project) {
  const root = fs.realpathSync(path.resolve(project));
  if (!fs.statSync(root).isDirectory()) throw new Error('Invalid project');
  const sources = [];
  function read(relative, format, required = true) {
    const source = { path: relative, required, status: 'unknown', sha256: null };
    sources.push(source);
    try {
      let current = root;
      for (const segment of relative.split('/')) {
        current = path.join(current, segment);
        if (fs.lstatSync(current).isSymbolicLink()) {
          source.status = 'linked-path'; return null;
        }
      }
      const st = fs.statSync(current);
      if (!st.isFile()) { source.status = 'not-file'; return null; }
      if (st.size > LIMIT) { source.status = 'too-large'; return null; }
      const bytes = fs.readFileSync(current);
      if (bytes.length > LIMIT) { source.status = 'too-large'; return null; }
      source.sha256 = createHash('sha256').update(bytes).digest('hex');
      const raw = bytes.toString('utf8').replace(/^\uFEFF/, '');
      let value;
      if (format === 'json') value = JSON.parse(raw);
      else if (format === 'jsonl') value = raw.split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s));
      else value = true; // Documents: fingerprint only, never copy contents.
      source.status = 'read';
      return value;
    } catch (e) {
      source.status = e.code === 'ENOENT' ? 'missing' : e instanceof SyntaxError ? 'invalid-json' : 'unreadable';
      return null;
    }
  }
  function schema(relative, valid) {
    if (!valid) {
      const source = sources.find(s => s.path === relative);
      if (source.status === 'read') source.status = 'invalid-schema';
    }
    return valid;
  }
  const statePath = 'docs/pipeline/state.json';
  const state = read(statePath, 'json');
  const validGates = schema(statePath, object(state) && Array.isArray(state.openGates)
    && state.openGates.every(x => (typeof x === 'string' && x.trim()) || (object(x) && typeof x.id === 'string' && x.id.trim())));
  const itemsPath = '.review-loop/items.json';
  const items = read(itemsPath, 'json');
  const validItems = schema(itemsPath, object(items) && Array.isArray(items.items)
    && items.items.every(x => object(x) && typeof x.key === 'string' && typeof x.status === 'string'));
  const rulesPath = '.review-loop/rules.json';
  const rules = read(rulesPath, 'json');
  const validRules = schema(rulesPath, object(rules) && Array.isArray(rules.rules) && rules.rules.every(object));
  const feedbackPath = '.review-loop/reviews.jsonl';
  const feedback = read(feedbackPath, 'jsonl');
  const validFeedback = schema(feedbackPath, Array.isArray(feedback)
    && feedback.every(x => object(x) && typeof x.itemKey === 'string' && typeof x.decision === 'string'));
  for (const doc of ['AGENTS.md', 'ORCHESTRATION.md', 'PIPELINE_STATE.md', 'VISUAL_DESIGN.md']) read(doc, 'document', false);
  let commit = null;
  try {
    // Refuse a parent repository when --project is an unversioned subdirectory.
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    if (fs.realpathSync(top) === root) {
      commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    }
  } catch { /* Missing Git is unknown, independent of source collection. */ }
  return {
    schemaVersion: 1, purpose: 'local-handoff', project: root, collectedAt: new Date().toISOString(),
    collectionStatus: sources.some(s => s.required && s.status !== 'read') ? 'unknown' : 'collected',
    git: { commit, status: commit ? 'recorded' : 'unknown', workingTreeVerified: false },
    pipeline: { status: validGates ? 'recorded' : 'unknown', openGates: validGates ? state.openGates.map(x => typeof x === 'string' ? text(x) : fields(x, ['id', 'title', 'status'])) : null },
    review: {
      status: validItems && validRules && validFeedback ? 'recorded' : 'unknown',
      approvalRevalidated: false,
      itemCount: validItems ? items.items.length : null,
      items: validItems ? items.items.map(x => ({ ...fields(x, ['key', 'title', 'type']), recordedStatus: text(x.status) })) : null,
      rules: validRules ? rules.rules.map(x => fields(x, ['id', 'title', 'text', 'status', 'sourceReviewId', 'approvedBy', 'createdAt'])) : null,
      feedbackCount: validFeedback ? feedback.length : null,
      feedback: validFeedback ? feedback.slice(-20).map(x => fields(x, ['itemKey', 'decision', 'comment', 'createdAt'])) : null,
    },
    sources,
    boundaries: { paidSubmissionEnabled: false, networkRequests: 0, approvalWrites: false, atomicSnapshot: false, commandsExecuted: ['git rev-parse (metadata only)'] },
    next: [
      'Read project AGENTS.md and ORCHESTRATION.md before acting.',
      'Resolve unknown state and open gates with the responsible person; collection is not gate approval.',
      'Read the shared review-loop summary before work; it can reconcile stale artifact hashes.',
      'Do not resubmit paid jobs on restart. Reconcile their existing provider job IDs separately.',
    ],
  };
}

export function runHandoffCli(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('node team-handoff.mjs --project <directory>\nJSON to stdout only. Exit 0 collected / 3 incomplete or unknown / 1 usage or project error.');
  } else if (args.length !== 2 || args[0] !== '--project') {
    console.error('Usage: node team-handoff.mjs --project <directory>'); process.exitCode = 1;
  } else {
    try {
      const report = collectHandoff(args[1]);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.collectionStatus === 'collected' ? 0 : 3;
    } catch {
      console.error('Project directory cannot be read.'); process.exitCode = 1;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runHandoffCli();
