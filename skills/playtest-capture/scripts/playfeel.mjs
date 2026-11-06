#!/usr/bin/env node
// 사람의 실제 피드백만 기록한다. 기록 성공(0)은 게이트 통과가 아니다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseLog, readLog, withLogLock, findLog } from './lib-playfeel.mjs';

const args = process.argv.slice(2), command = args.shift();
const options = {};
while (args.length) {
  const key = args.shift(), value = args.shift();
  if (!['--felt', '--project'].includes(key) || value === undefined || Object.hasOwn(options, key)) { console.error('usage: playfeel.mjs record --felt "실제 피드백" [--project dir] | log [--project dir]'); process.exit(2); }
  options[key] = value;
}
if (!['record', 'log'].includes(command) || (command === 'record' && !options['--felt']?.trim())) {
  console.error('usage: playfeel.mjs record --felt "실제 피드백" [--project dir] | log [--project dir]'); process.exit(2);
}
const git = (cwd, a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', windowsHide: true });
try {
  const cwd = path.resolve(options['--project'] || process.cwd());
  if (!fs.statSync(cwd).isDirectory()) throw new Error('프로젝트 폴더가 아니다');
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  const project = options['--project'] ? cwd : top.status === 0 ? top.stdout.trim() : cwd;
  const file = options['--project'] ? path.join(project, 'playfeel.md') : findLog(cwd) || path.join(project, 'playfeel.md');
  if (command === 'log') {
    const text = readLog(file), state = parseLog(text);
    console.log(text || '아직 플레이 기록이 없다.');
    console.log(`마지막 사람 플레이 이후 시뮬 ${state.used}/2회`);
  } else {
    const diff = git(project, ['diff', '--no-ext-diff', '--no-textconv', '--unified=0', 'HEAD', '--', '.', ':!playfeel.md']);
    const lines = diff.status === 0 ? diff.stdout.split(/\r?\n/).filter(l => /^[+-](?![+-])/.test(l) && /\d/.test(l)) : [];
    const commit = git(project, ['rev-parse', '--short', 'HEAD']);
    withLogLock(file, () => {
      const old = readLog(file), { round } = parseLog(old);
      const numeric = lines.slice(0, 80).map(l => '    [수치 변경] ' + JSON.stringify(l)).join('\n');
      fs.appendFileSync(file, (old ? '\n' : '# 플레이 체감 기록\n\n') + `#${round + 1} ${new Date().toISOString()} commit=${commit.status === 0 ? commit.stdout.trim() : 'unknown'}\n` +
        '    [사람] ' + JSON.stringify(options['--felt'].trim()) + '\n' +
        (numeric ? numeric + '\n' : '    [수치 변경] HEAD 대비 추적 파일의 수치 변경 없음 또는 Git 미확인\n') +
        (lines.length > 80 ? '    [공백] 수치 변경 80줄 이후 생략\n' : ''));
    });
    console.log(`플레이 기록 저장: ${file}. 시뮬 예산 0/2회. 사람 승인과 표본 충분성은 별도다.`);
  }
} catch (e) { console.error(`측정 불가: ${e.message}`); process.exit(3); }
