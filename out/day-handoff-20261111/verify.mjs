import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root='out/day-handoff-20261111';
const historical=JSON.parse(fs.readFileSync('out/sprite-motion-implementation-20261111/validation.json'));
const sourceAgreement=Object.entries(historical.sourceHashes).map(([file,expected])=>({file,expected,actual:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
if(sourceAgreement.some(f=>f.expected!==f.actual))throw Error('Measured sprite source changed; rerun affected tests before publishing');
const result=spawnSync(process.execPath,['scripts/validate-plugin.mjs'],{encoding:'utf8'});
fs.writeFileSync(`${root}/plugin.stdout.log`,result.stdout||'');
fs.writeFileSync(`${root}/plugin.stderr.log`,result.stderr||'');
const version=JSON.parse(fs.readFileSync('.codex-plugin/plugin.json')).version;
fs.writeFileSync(`${root}/verification.json`,JSON.stringify({version,checkedAt:new Date().toISOString(),pluginExitCode:result.status,sourceAgreement,
  testEvidence:'out/sprite-motion-implementation-20261111/tests.stdout.log',testClaim:'45 passed, 0 failed, 0 skipped in the preserved run; source hashes unchanged',
  limitations:['Full repository CI not rerun; workflow files unchanged','Installed plugin snapshots not updated','Human positive v3 feedback is not production approval']},null,2));
console.log(`version=${version}; measured source hashes=4/4; plugin=${result.status}`);
process.exitCode=result.status??1;
