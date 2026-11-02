import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const valid = s => typeof s === 'string' && s.trim().length > 0;
const hash = r => crypto.createHash('sha256').update(JSON.stringify([r.rule, r.acceptance])).digest('hex');
let data;
try { data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); } catch { console.error('측정 불가: 입력 JSON을 읽을 수 없습니다.'); process.exit(3); }
if (!data || !Array.isArray(data.requirements) || !data.requirements.length || !Array.isArray(data.cases)) { console.error('측정 불가: requirements와 cases 배열이 필요합니다.'); process.exit(3); }
const gaps = [], failures = [], reqs = new Map(), ids = new Set();
const root = path.dirname(path.resolve(process.argv[2]));
const digest = s => crypto.createHash('sha256').update(s).digest('hex');
const sourceOk = r => {
  const m = /^(.*):(\d+)$/.exec(r.source);
  if (!m || !valid(r.sourceHash)) return false;
  try { const line = fs.readFileSync(path.resolve(root, m[1]), 'utf8').split(/\r?\n/)[Number(m[2])-1]; return typeof line === 'string' && digest(line.trim()) === r.sourceHash; } catch { return false; }
};
const evidenceOk = c => {
  if (!valid(c.build) || !valid(c.evidence) || !valid(c.evidenceHash)) return false;
  try {
    const raw = fs.readFileSync(path.resolve(root, c.evidence));
    const evidence = JSON.parse(raw);
    const git = spawnSync('git', ['rev-parse', '--verify', `${c.build}^{commit}`], { cwd:root, encoding:'utf8' });
    return git.status === 0 && digest(raw) === c.evidenceHash && evidence.caseId === c.id && evidence.build === git.stdout.trim() && evidence.status === c.status && evidence.requirementHash === c.requirementHash;
  } catch { return false; }
};
for (const r of data.requirements) {
  if (!r || ![r.id, r.source, r.rule, r.acceptance].every(valid)) { gaps.push('요구사항의 ID, 정본, 규칙 또는 수용 기준 누락'); continue; }
  if (reqs.has(r.id)) { gaps.push(`중복 요구사항: ${r.id}`); continue; }
  reqs.set(r.id, r);
  if (r.reviewed !== true) gaps.push(`${r.id}: 사람의 정본 검토 필요`);
  if (!sourceOk(r)) gaps.push(`${r.id}: 정본 행 누락 또는 변경 — 연결된 사례 재검토`);
}
for (const c of data.cases) {
  if (!c || ![c.id, c.requirementId, c.steps, c.expected].every(valid) || !['pass','fail','not_run'].includes(c.status)) { gaps.push('사례 ID, 연결, 절차, 기대 결과 또는 상태 누락'); continue; }
  if (ids.has(c.id)) { gaps.push(`중복 사례: ${c.id}`); continue; }
  ids.add(c.id);
  const r = reqs.get(c.requirementId);
  if (!r) { gaps.push(`${c.id}: 요구사항 연결 오류`); continue; }
  if (c.status === 'fail' && evidenceOk(c)) failures.push(`${c.id}: 실패 기록`);
  if (c.status === 'not_run') gaps.push(`${c.id}: 미실행`);
  if (c.status !== 'not_run' && !evidenceOk(c)) gaps.push(`${c.id}: 근거 파일·해시·사례·대상 커밋 불일치 또는 누락`);
  if (c.requirementHash !== hash(r) || !sourceOk(r)) gaps.push(`${c.id}: 요구사항 또는 정본 변경, 재검토 필요`);
}
for (const [id,r] of reqs) {
  if (!data.cases.some(c => c && c.requirementId === id && valid(c.id))) gaps.push(`${id}: QA 사례 없음`);
  console.log(`${id} requirementHash=${hash(r)}`);
}
for (const x of failures) console.log(`미달: ${x}`);
for (const x of gaps) console.log(`측정 불가: ${x}`);
console.log(`판정: ${failures.length ? '미달' : gaps.length ? '측정 불가' : '충족'} (기록 구조만 검사; 테스트 실행 및 근거 진위는 미검증)`);
process.exit(failures.length ? 1 : gaps.length ? 3 : 0);
