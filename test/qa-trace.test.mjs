import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const checker = path.resolve('skills/gdd-completeness-checker/scripts/trace-check.mjs');
const draft = path.resolve('skills/gdd-completeness-checker/scripts/trace-draft.mjs');
test('초안 생성, 정본 변경, 실행 근거 및 커밋 확인', () => {
 const dir = mkdtempSync(path.join(tmpdir(), 'qa-trace-'));
 try {
  const git = (...args) => spawnSync('git',args,{cwd:dir,encoding:'utf8'});
  assert.equal(git('init').status,0);
  git('-c','user.name=Test','-c','user.email=test@example.com','commit','--allow-empty','-m','test');
  const build=git('rev-parse','HEAD').stdout.trim();
  const spec=path.join(dir,'design.md'), file=path.join(dir,'trace.json');
  writeFileSync(spec,'| ID | 규칙 | 수용 기준 |\n| --- | --- | --- |\n| R1 | once | no duplicate |\n');
  assert.equal(spawnSync(process.execPath,[draft,spec,file]).status,0);
  assert.equal(spawnSync(process.execPath,[draft,spec,file]).status,3);
  const d=JSON.parse(readFileSync(file)); const r=d.requirements[0]; r.reviewed=true;
  const requirementHash=sha(JSON.stringify([r.rule,r.acceptance]));
  const c={id:'T1',requirementId:'R1',steps:'reconnect',expected:'once',status:'pass',build,evidence:'result.json',requirementHash};
  const evidence=JSON.stringify({caseId:c.id,build,status:'pass',requirementHash});
  writeFileSync(path.join(dir,'result.json'),evidence); c.evidenceHash=sha(evidence); d.cases=[c];
  const run=()=>{writeFileSync(file,JSON.stringify(d));return spawnSync(process.execPath,[checker,file],{encoding:'utf8'});};
  assert.equal(run().status,0);
  writeFileSync(path.join(dir,'result.json'),'{}'); assert.equal(run().status,3);
  writeFileSync(path.join(dir,'result.json'),evidence);
  c.build='missing'; assert.equal(run().status,3); c.build=build;
  writeFileSync(spec,'| ID | 규칙 | 수용 기준 |\n| --- | --- | --- |\n| R1 | twice | no duplicate |\n');
  const changed=run(); assert.equal(changed.status,3); assert.match(changed.stdout,/T1: 요구사항 또는 정본 변경/);
  c.status='not_run'; assert.equal(run().status,3);
 } finally { rmSync(dir,{recursive:true,force:true}); }
});
