#!/usr/bin/env node
// sim-scaffold.mjs - 프로젝트에 게임성 검증 하네스 골격을 만든다.
//   node sim-scaffold.mjs [--out sim] [--force]
//
// 왜 이게 필요한가: 이 플러그인은 "재미를 감이 아니라 데이터로 판정한다"를 전제로 하는데
// 정작 하네스는 매 프로젝트가 처음부터 만들어야 했다. 규율은 주고 능력은 안 주는 상태였다.
// 실전(hex-danmaku)에서도 tools/balance-sim.mjs 를 새로 만들었다.
//
// 그런데 플러그인이 게임 로직을 알 수는 없다. 그래서 **계약만 정하고 나머지를 다 가져간다**:
//
//   프로젝트가 구현:  simulateRun({ rng, config, policy }) -> RunResult
//   스캐폴드가 소유:  시드 · 배치 · 집계 · 신뢰구간 · 판정 · 리포트 · 커밋 스탬핑
//
// 생성된 sim/ 은 **자기완결적**이다(lib-stats.mjs 를 복사해 넣는다). 플러그인 없이도
// 프로젝트 CI 에서 돈다 - 하네스는 세션보다 오래 살아야 한다.
//
// 템플릿은 templates/ 의 실제 파일이다(문자열로 품고 있지 않다). 그래서 CI 가 템플릿 자체를
// 문법 검사할 수 있고, 편집할 때 하이라이팅도 된다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(HERE, 'templates');
const PLUGIN_ROOT = path.resolve(HERE, '..', '..', '..');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node sim-scaffold.mjs [--out sim] [--force]');
  console.log('  --out    생성 위치 (기본 sim)');
  console.log('  --force  이미 있는 파일도 덮어쓴다 (기본: 건너뛴다)');
  process.exit(2);
}
const OUT = opt('--out', 'sim');
const FORCE = args.includes('--force');

// 템플릿 + 플러그인에서 복사할 공용 라이브러리
const fromTemplates = ['rng.mjs', 'policies.mjs', 'game.mjs', 'targets.mjs', 'run.mjs', 'curve-check.mjs', 'README.md'];
const fromPlugin = { 'lib-stats.mjs': path.join(PLUGIN_ROOT, 'scripts', 'lib-stats.mjs') };

const missing = [
  ...fromTemplates.map((f) => path.join(TEMPLATES, f)),
  ...Object.values(fromPlugin),
].filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error('플러그인 파일이 없다:\n  ' + missing.join('\n  '));
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

const written = [];
const skipped = [];
const copy = (name, srcPath) => {
  const dest = path.join(OUT, name);
  if (fs.existsSync(dest) && !FORCE) { skipped.push(name); return; }
  fs.copyFileSync(srcPath, dest);
  written.push(name);
};

for (const f of fromTemplates) copy(f, path.join(TEMPLATES, f));
for (const [name, src] of Object.entries(fromPlugin)) copy(name, src);

console.log('');
if (written.length) console.log('생성 (' + written.length + '): ' + written.join(' · '));
if (skipped.length) console.log('건너뜀 (이미 있음): ' + skipped.join(' · ') + '   — 덮어쓰려면 --force');
console.log('-> ' + path.resolve(OUT));
console.log('');
console.log('다음: ' + path.join(OUT, 'game.mjs') + ' 의 simulateRun 을 실제 런 로직으로 바꿔라.');
console.log('     그 전까지 나오는 수치는 자리표시자이므로 판정은 "측정 불가"다.');
console.log('     밸런스 수치는 defaultConfig 에 박지 말고 프로젝트 데이터 테이블을 import 해라.');
console.log('');
console.log('확인: node ' + path.join(OUT, 'run.mjs') + ' --seed 42 --runs 200');
console.log('상세: ' + path.join(OUT, 'README.md'));
