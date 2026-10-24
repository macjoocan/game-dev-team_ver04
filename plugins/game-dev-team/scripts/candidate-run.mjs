#!/usr/bin/env node
// Explicit, local candidate comparison. Does not launch LLMs or grant approval.
import fs from 'node:fs';
import path from 'node:path';
import { loadContract, digest, requireThat } from './candidate-contract.mjs';
import { run, report, record, writeJSON } from './candidate-executor.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const help = `Usage (Node 20+):
  node scripts/candidate-run.mjs init --domain planning|development --out DIR [--demo]
  node scripts/candidate-run.mjs check EXPERIMENT.json
  node scripts/candidate-run.mjs run EXPERIMENT.json [--resume]
  node scripts/candidate-run.mjs report EXPERIMENT.json
  node scripts/candidate-run.mjs record EXPERIMENT.json --candidate ID --reason TEXT
Codes: 0 fulfilled / 1 confirmed failure / 3 unmeasurable or invalid.
--demo is synthetic and uses no model/API. init without --demo creates a pending template.
Run only trusted command configurations. Shell is disabled; this is not a sandbox.`;

function init() {
  const domain = option('--domain'); const out = option('--out');
  requireThat(['planning', 'development'].includes(domain) && out, '--domain and --out required');
  const root = path.resolve(out);
  requireThat(!fs.existsSync(path.join(root, 'experiment.json')), 'experiment.json already exists');
  const demo = args.includes('--demo');
  fs.mkdirSync(root, { recursive: true });
  if (!demo) {
    writeJSON(path.join(root, 'experiment.json'), { version: 1, id: 'replace-me', projectRoot: '.', domain,
      axis: 'artifact', purpose: '', pending: true, baseline: 'baseline', references: [],
      lessonIntake: { searched: ['docs/experiments/lessons/', 'relevant skill lessons'], uses: [] },
      conditions: { notApplicable: 'replace with actual comparison conditions' }, budget: { maxAttempts: 6, maxDurationMs: 60000 },
      candidates: [], checks: [], metrics: [] });
    console.log(`Pending template: ${root}/experiment.json`); return;
  }
  const targets = '# SYNTHETIC FIXTURE ONLY\nThis is not a real game. Win target: 35–55%. Development: pass the fixture assertion.\n';
  const evaluator = `import fs from 'node:fs';
import path from 'node:path';
const [domain, output] = process.argv.slice(2);
const input = JSON.parse(fs.readFileSync('input.json','utf8'));
fs.mkdirSync(output,{recursive:true});
const data = domain === 'planning'
 ? {meta:{seed:42,runs:1000,policy:'greedy'},targets:{winRate:[0.35,0.55]},a:{n:1000,wins:input.pass?450:900,lengthMean:30}}
 : {verdict:input.pass?'pass':'fail',metrics:{fixtureValue:input.pass?1:0},reason:'synthetic assertion'};
fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(data));
console.log('SYNTHETIC FIXTURE ONLY',domain,input.pass);
process.exitCode=input.pass?0:1;
`;
  // Exclusive writes protect unrelated user files in an existing output directory.
  fs.writeFileSync(path.join(root, 'TARGETS.md'), targets, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'verify.mjs'), evaluator, { flag: 'wx' });
  const candidates = ['baseline', 'alternative'].map((id, i) => {
    fs.mkdirSync(path.join(root, id), { recursive: true });
    fs.writeFileSync(path.join(root, id, 'input.json'), JSON.stringify({ pass: i === 1 }), { flag: 'wx' });
    return { id, cwd: id, difference: i ? 'synthetic passing candidate' : 'synthetic failing baseline', subject: 'input.json',
      inputs: [{ path: 'input.json', sha256: digest(path.join(root, id, 'input.json')) }] };
  });
  const check = { id: 'verify', required: true, adapter: domain === 'planning' ? 'balance-sim' : 'json',
    executable: '$NODE', args: ['{project}/verify.mjs', domain, '{output}'], timeoutMs: 10000, retrySafe: true,
    result: '{output}/result.json', files: [{ path: 'verify.mjs', sha256: digest(path.join(root, 'verify.mjs')) }] };
  if (domain === 'planning') { check.conditions = { seed: 42, runs: 1000, policy: 'greedy' }; check.target = [0.35, 0.55]; }
  writeJSON(path.join(root, 'experiment.json'), { version: 1, id: 'demo', projectRoot: '.', domain, axis: 'artifact',
    purpose: 'SYNTHETIC FIXTURE ONLY — demonstrate candidate evidence', baseline: 'baseline', demoTarget: targets,
    references: [{ path: 'TARGETS.md', sha256: digest(path.join(root, 'TARGETS.md')) }],
    lessonIntake: { searched: ['synthetic fixture; no prior lessons'], uses: [] },
    conditions: domain === 'planning' ? { seed: 42, runs: 1000, policy: 'greedy', synthetic: true } : { synthetic: true, runtime: 'captured in run provenance' },
    budget: { maxAttempts: 6, maxDurationMs: 60000 }, candidates, checks: [check],
    metrics: [{ id: domain === 'planning' ? 'winRate' : 'fixtureValue', check: 'verify', unit: 'ratio', direction: 'observe', source: 'TARGETS.md (synthetic)' }] });
  console.log(`SYNTHETIC demo: ${root}/experiment.json`);
}
try {
  if (!args.length || args.includes('--help') || args.includes('-h')) console.log(help);
  else if (args[0] === 'init') init();
  else {
    requireThat(['check', 'run', 'report', 'record'].includes(args[0]), 'unknown command');
    requireThat(args[1] && !args[1].startsWith('--'), 'experiment path required');
    const ctx = loadContract(args[1]);
    if (args[0] === 'check') console.log(`Contract valid: ${ctx.contract.id} · ${ctx.signature}`);
    else if (args[0] === 'run') {
      const r = await run(ctx, { resume: args.includes('--resume') }); report(ctx);
      console.log(`Run: ${r.dir}\nCode: ${r.code}`); process.exitCode = r.code;
    } else if (args[0] === 'report') {
      const r = report(ctx); console.log(`${r.dir}/report.md\nCode: ${r.code}`); process.exitCode = r.code;
    } else { const d = record(ctx, option('--candidate'), option('--reason')); console.log(`Selection proposed: ${d.candidate}; approval not granted`); }
  }
} catch (e) { console.error(`Unmeasurable: ${e.message}`); process.exitCode = 3; }
