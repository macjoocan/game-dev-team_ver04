import fs from 'node:fs';
import path from 'node:path';

export function parseLog(text) {
  let round = 0, used = 0;
  for (const line of text.split(/\r?\n/)) {
    const n = line.match(/^#(\d+)\s/);
    if (n) round = Math.max(round, Number(n[1]));
    if (/^\s*\[사람\]\s+\S/.test(line)) used = 0;
    else if (/^\s*\[시뮬\]\s+\S/.test(line)) used++;
  }
  return { round, used };
}
export function findLog(start) {
  let dir = path.resolve(start);
  while (true) {
    const file = path.join(dir, 'playfeel.md');
    try { fs.statSync(file); return file; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (fs.existsSync(path.join(dir, '.git'))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
// 잠금은 짧은 읽기/추가 쓰기만 보호한다. 예산의 정본은 playfeel.md 한 파일이다.
export function withLogLock(file, work) {
  const lock = file + '.lock';
  let fd;
  try { fd = fs.openSync(lock, 'wx'); }
  catch (e) { throw new Error(e.code === 'EEXIST' ? '플레이 기록을 다른 작업이 쓰는 중이다. 잠금 소유자를 확인한다' : e.message); }
  try { return work(); }
  finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
export function readLog(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return ''; throw e; }
}
export function reserveSimulation(file, detail) {
  if (!file) return { allowed: true, tracked: false };
  return withLogLock(file, () => {
    const { used } = parseLog(readLog(file));
    if (used >= 2) return { allowed: false, tracked: true, used };
    fs.appendFileSync(file, '\n    [시뮬] ' + JSON.stringify(detail) + '\n');
    return { allowed: true, tracked: true, used: used + 1 };
  });
}
export function finishSimulation(file, detail) {
  if (file) withLogLock(file, () => fs.appendFileSync(file, '    [결과] ' + JSON.stringify(detail) + '\n'));
}
