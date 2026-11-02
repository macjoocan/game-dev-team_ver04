import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Only explicit table rows are extracted; prose interpretation remains human work.
const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('사용법: node trace-draft.mjs <기획.md> <trace.json>'); process.exit(3); }
let content;
try { content = fs.readFileSync(input, 'utf8'); } catch { console.error('측정 불가: 기획서를 읽을 수 없습니다.'); process.exit(3); }
const lines = content.split(/\r?\n/), requirements = [], seen = new Set();
for (let i = 0; i < lines.length; i++) {
  if (!/^\s*\|\s*ID\s*\|\s*규칙\s*\|\s*수용 기준\s*\|\s*$/.test(lines[i])) continue;
  if (!/^\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*$/.test(lines[i+1] || '')) continue;
  i += 2;
  for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
    const parts = lines[i].trim().slice(1,-1).split('|').map(x => x.trim());
    if (parts.length !== 3 || !parts.every(Boolean) || seen.has(parts[0])) { console.error(`측정 불가: ${i+1}행의 빈 값 또는 중복 ID`); process.exit(3); }
    seen.add(parts[0]);
    requirements.push({id:parts[0], rule:parts[1], acceptance:parts[2], source:`${path.relative(path.dirname(path.resolve(output)), path.resolve(input)).split(path.sep).join('/')}:${i+1}`, sourceHash:crypto.createHash('sha256').update(lines[i].trim()).digest('hex'), reviewed:false});
  }
  i--;
}
if (!requirements.length) { console.error('측정 불가: 명시된 요구사항 표가 없습니다.'); process.exit(3); }
try { fs.writeFileSync(output, JSON.stringify({requirements,cases:[]}, null, 2)+'\n', {flag:'wx'}); } catch (e) { console.error(`측정 불가: 출력 파일 생성 실패 (${e.code || '오류'})`); process.exit(3); }
console.log(`초안 ${requirements.length}건: ${output} — 사람이 정본과 사례를 검토해야 합니다.`);
