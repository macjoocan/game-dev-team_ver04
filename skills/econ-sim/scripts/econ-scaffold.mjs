#!/usr/bin/env node
// econ-scaffold.mjs - 프로젝트에 경제 검증 하네스 골격을 만든다.
//   node econ-scaffold.mjs [--out econ-sim] [--force]
//
// balance-sim 의 sim-scaffold.mjs 와 같은 구조·같은 계약 방식이고, 통계 층(lib-stats.mjs)과
// 시드 층(rng.mjs)을 공유한다. 다른 것은 **무엇을 판정하는가**다:
//
//   balance-sim : 재미가 있나 (승률·픽률·난이도 곡선)
//   econ-sim    : 경제가 성립하고 **공정한가** (리텐션·완주율·페이투윈 격차·재화 수지)
//
// 핵심 설계: **평균 1명을 시뮬하지 않는다.** 페르소나별로 따로 돌려 곡선을 비교한다.
// 평균으로 뭉개면 무과금과 과금자의 격차가 사라지고, "무과금도 완주 가능한가"라는
// 게이트 질문에 답할 수 없다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(HERE, 'templates');
const PLUGIN_ROOT = path.resolve(HERE, '..', '..', '..');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node econ-scaffold.mjs [--out econ-sim] [--force]');
  console.log('  --out    생성 위치 (기본 econ-sim)');
  console.log('  --force  이미 있는 파일도 덮어쓴다');
  process.exit(2);
}
const OUT = opt('--out', 'econ-sim');
const FORCE = args.includes('--force');

const fromTemplates = ['personas.mjs', 'economy.mjs', 'econ-targets.mjs', 'econ-run.mjs', 'README.md'];
// 시드·통계 층은 balance-sim 과 공유한다 - 두 하네스가 같은 규칙으로 재현·판정해야 한다.
const shared = {
  'lib-stats.mjs': path.join(PLUGIN_ROOT, 'scripts', 'lib-stats.mjs'),
  'rng.mjs': path.join(PLUGIN_ROOT, 'skills', 'balance-sim', 'scripts', 'templates', 'rng.mjs'),
};

const missing = [
  ...fromTemplates.map((f) => path.join(TEMPLATES, f)),
  ...Object.values(shared),
].filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error('플러그인 파일이 없다:\n  ' + missing.join('\n  '));
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

const written = [];
const skipped = [];
const copy = (name, src) => {
  const dest = path.join(OUT, name);
  if (fs.existsSync(dest) && !FORCE) { skipped.push(name); return; }
  fs.copyFileSync(src, dest);
  written.push(name);
};

for (const f of fromTemplates) copy(f, path.join(TEMPLATES, f));
for (const [name, src] of Object.entries(shared)) copy(name, src);

console.log('');
if (written.length) console.log('생성 (' + written.length + '): ' + written.join(' · '));
if (skipped.length) console.log('건너뜀 (이미 있음): ' + skipped.join(' · ') + '   — 덮어쓰려면 --force');
console.log('-> ' + path.resolve(OUT));
console.log('');
console.log('다음: ' + path.join(OUT, 'economy.mjs') + ' 의 simulatePlayer 를 실제 경제 로직으로 바꿔라.');
console.log('     그 전까지 나오는 수치는 자리표시자이므로 판정은 "측정 불가"다.');
console.log('     그리고 ' + path.join(OUT, 'personas.mjs') + ' 의 행동 파라미터를 게임에 맞춰라 —');
console.log('     페르소나가 실제 유저와 다르면 곡선 전체가 틀린다.');
console.log('');
console.log('확인: node ' + path.join(OUT, 'econ-run.mjs') + ' --seed 7 --cohort 500 --days 30');
console.log('상세: ' + path.join(OUT, 'README.md'));
