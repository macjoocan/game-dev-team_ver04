#!/usr/bin/env node
// run-tests.mjs - test/ 의 테스트를 **전부** 찾아 돌린다.
//
//   node scripts/run-tests.mjs            # 전부
//   node scripts/run-tests.mjs --list     # 무엇을 돌릴지만 출력
//   node scripts/run-tests.mjs --node     # .mjs 만
//   node scripts/run-tests.mjs --python   # .py 만
//
// 종료 코드: 0 전부 통과 · 1 하나라도 실패 · 2 사용법
//
// 왜 러너인가 — CI 가 파일 이름을 손으로 나열했고, 그 사이 test/ 에 4개가 더 생겼는데
// **한 번도 안 돌았다**(REVIEW.md B-20). 통과하고 있었으니 아무도 몰랐다.
// 처음엔 "워크플로가 각 파일을 덮는가"를 validate-plugin 이 텍스트로 검사하게 했는데
// 두 번 연속 거짓 통과했다:
//   1차 — 스텝 `name:` 에 남은 `(test/*.test.mjs)` 가 커버리지로 잡혔다
//   2차 — `echo "FAIL: test/*.test.mjs ..."` 의 글롭이 잡혔다
// 둘 다 "언급된 문자열"과 "파일을 고르는 문자열"을 구분하지 못해서다. 같은 규칙이 두 번
// 깨지면 문구가 아니라 구조를 바꿔야 한다 — 그래서 **나열할 목록 자체를 없앴다.**
// 디렉터리가 곧 목록이고, 새 테스트는 파일을 놓는 순간 포함된다.
//
// 의존성 없음(Node 내장만). python 테스트는 python3 가 있을 때만 돈다.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = path.join(ROOT, 'test');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
if (has('-h') || has('--help')) {
  console.log('usage: node scripts/run-tests.mjs [--list] [--node] [--python]');
  process.exit(2);
}

if (!fs.existsSync(TEST_DIR)) {
  console.error(`test/ 가 없다: ${path.relative(ROOT, TEST_DIR)}`);
  process.exit(1);
}

const all = fs.readdirSync(TEST_DIR).sort();
const nodeTests = all.filter((f) => /\.test\.(mjs|js)$/.test(f)).map((f) => `test/${f}`);
const pyTests = all.filter((f) => /\.test\.py$/.test(f)).map((f) => `test/${f}`);

// 빈 결과는 "테스트가 없다"가 아니라 "못 찾았다"일 수 있다. 조용히 통과시키지 않는다.
if (!nodeTests.length && !pyTests.length) {
  console.error(`FAIL: test/ 에 테스트 파일이 하나도 없다 (${all.length}개 파일을 봤다).`);
  console.error('  이름 규칙은 *.test.mjs · *.test.js · *.test.py 다.');
  process.exit(1);
}

const wantNode = !has('--python');
const wantPy = !has('--node');

console.log(`# 테스트 러너 — test/ 에서 발견: node ${nodeTests.length} · python ${pyTests.length}`);
for (const f of [...(wantNode ? nodeTests : []), ...(wantPy ? pyTests : [])]) console.log(`  ${f}`);

if (has('--list')) process.exit(0);

let failed = 0;

if (wantNode && nodeTests.length) {
  console.log(`\n## node --test (${nodeTests.length})`);
  const r = spawnSync(process.execPath, ['--test', ...nodeTests], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error(`FAIL: node 테스트 (exit ${r.status})`);
    failed += 1;
  }
}

if (wantPy && pyTests.length) {
  console.log(`\n## python (${pyTests.length})`);
  // python3 먼저, 없으면 python. 둘 다 없으면 **측정 불가**로 알리고 실패시킨다 —
  // 조용히 건너뛰면 "python 테스트가 통과했다"고 오해하게 된다.
  const exe = ['python3', 'python'].find(
    (c) => spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0,
  );
  if (!exe) {
    console.error('FAIL: python 을 찾지 못해 python 테스트를 돌리지 못했다 (측정 불가).');
    console.error(`  건너뛴 파일: ${pyTests.join(' · ')}`);
    failed += 1;
  } else {
    for (const f of pyTests) {
      const r = spawnSync(exe, [f], { cwd: ROOT, stdio: 'inherit' });
      if (r.status !== 0) {
        console.error(`FAIL: ${f} (exit ${r.status})`);
        failed += 1;
      }
    }
  }
}

const total = (wantNode ? nodeTests.length : 0) + (wantPy ? pyTests.length : 0);
if (failed) {
  console.error(`\n# 결과: 실패 ${failed}건 / 대상 ${total}개`);
  process.exit(1);
}
console.log(`\n# 결과: ${total}개 전부 통과`);
