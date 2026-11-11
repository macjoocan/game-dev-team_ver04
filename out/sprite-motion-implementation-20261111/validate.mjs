import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const out = 'out/sprite-motion-implementation-20261111';
const results = [];
function run(id, args) {
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  fs.writeFileSync(path.join(out, `${id}.stdout.log`), r.stdout || '');
  fs.writeFileSync(path.join(out, `${id}.stderr.log`), r.stderr || '');
  results.push({ id, command: [process.execPath, ...args], exitCode: r.status, error: r.error?.message,
    stdout: `${out}/${id}.stdout.log`, stderr: `${out}/${id}.stderr.log` });
  console.log(`${id}: ${r.status}`);
}
run('tests', ['--test', 'test/sprite-motion-qa.test.mjs', 'test/motion-clip-tools.test.mjs', 'test/motion-court.test.mjs', 'samples/silver-stage-01/game.test.mjs']);
run('plugin', ['scripts/validate-plugin.mjs']);
const before = spawnSync('git', ['show', '4ceb944:skills/sprite-pipeline/scripts/sprite-qa.mjs'], { encoding: 'utf8' });
if (before.status !== 0) throw new Error(before.stderr || 'Cannot load base source');
const beforePath = `${out}/before-sprite-qa.mjs`;
fs.writeFileSync(beforePath, before.stdout.replaceAll('../../../scripts/', pathToFileURL(path.resolve('scripts')).href + '/'));
for (const [id, source] of [['silver-c', 'out/experiments/local-motion-20261106/c-alpha'],
  ['rigid', 'out/experiments/gpt-walk-20261106/rigid/frames']]) {
  run(`${id}-sprite`, ['skills/sprite-pipeline/scripts/sprite-qa.mjs', source, '--out', `${out}/${id}`]);
  run(`${id}-motion`, ['skills/sprite-pipeline/scripts/motion-qa.mjs', source, '--gait', 'walk', '--out', `${out}/${id}`]);
  run(`${id}-before`, [beforePath, source, '--out', `${out}/${id}-before`]);
}
run('art-gate', ['scripts/art-gate.mjs', '--out', `${out}/final-art-gate`]);
const sources = ['skills/sprite-pipeline/scripts/lib-sprite-sequence.mjs', 'skills/sprite-pipeline/scripts/motion-qa.mjs',
  'skills/sprite-pipeline/scripts/sprite-qa.mjs', 'test/sprite-motion-qa.test.mjs'];
const sourceHashes = Object.fromEntries(sources.map(f => [f, createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
fs.writeFileSync(`${out}/validation.json`, JSON.stringify({ baseCommit: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
  uncommittedImplementation: true, generatedAt: new Date().toISOString(), sourceHashes,
  baselineSource: { commit: '4ceb944', sha256: createHash('sha256').update(before.stdout).digest('hex'), adaptation: 'Only import paths changed to absolute file URLs' }, results }, null, 2));
