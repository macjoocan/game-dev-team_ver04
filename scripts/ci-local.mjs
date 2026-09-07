#!/usr/bin/env node
// CI 워크플로를 로컬에서 GitHub Actions 와 같은 조건으로 돌린다.
//
// 왜 필요한가: GitHub Actions 는 run: 블록을 `bash -e` 로 실행한다.
// 이 레포에는 "exit 3(측정 불가)을 기대하는" 검사가 여럿 있어서,
// 맨 `bash` 로 스텝을 재현하면 통과하는데 CI 에서는 그 자리에서 죽는다.
// v0.27.1 에서 실제로 이 차이 때문에 CI 가 세션 내내 빨간 상태였고,
// 로컬 재현이 맨 bash 였기 때문에 아무도 못 봤다.
//
// 사용:
//   node scripts/ci-local.mjs              모든 스텝 실행(실패해도 계속 — 한 번에 전부 본다)
//   node scripts/ci-local.mjs --ci         첫 실패에서 중단(GitHub 과 동일한 동작)
//   node scripts/ci-local.mjs --only 7     n 번째 run 스텝만
//   node scripts/ci-local.mjs --list       스텝 목록만 출력
//
// 종료 코드: 0 전부 통과 / 1 하나 이상 실패

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF = path.join(REPO, '.github', 'workflows', 'validate.yml');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

if (!fs.existsSync(WF)) {
  console.error(`워크플로 파일이 없다: ${path.relative(REPO, WF)}`);
  process.exit(1);
}

// --- 최소 파서. steps 아래 `- name:` / `run:` 만 본다(YAML 라이브러리 없이 동작해야 하므로). ---
function parseSteps(text) {
  const lines = text.split(/\r?\n/);
  const steps = [];
  let cur = null;      // { name, body[] }
  let blockIndent = 0; // run: | 블록 본문의 들여쓰기
  let inBlock = false;

  for (const raw of lines) {
    if (inBlock) {
      const indent = raw.length - raw.trimStart().length;
      if (raw.trim() === '') { cur.body.push(''); continue; }
      if (indent >= blockIndent) { cur.body.push(raw.slice(blockIndent)); continue; }
      inBlock = false; // 블록 종료 — 아래 일반 처리로 떨어진다
    }
    const mName = raw.match(/^\s*-\s+name:\s*(.+?)\s*$/);
    if (mName) { if (cur && cur.body.length) steps.push(cur); cur = { name: mName[1], body: [] }; continue; }
    const mUses = raw.match(/^\s*-\s+uses:\s*(.+?)\s*$/);
    if (mUses) { if (cur && cur.body.length) steps.push(cur); cur = null; continue; }

    const mRunBlock = raw.match(/^(\s*)run:\s*\|\s*$/);
    if (mRunBlock && cur) {
      inBlock = true;
      blockIndent = mRunBlock[1].length + 2; // `run:` 보다 한 단 안쪽
      continue;
    }
    const mRunInline = raw.match(/^\s*run:\s*(\S.*?)\s*$/);
    if (mRunInline && cur) { cur.body.push(mRunInline[1]); continue; }
  }
  if (cur && cur.body.length) steps.push(cur);
  return steps;
}

const steps = parseSteps(fs.readFileSync(WF, 'utf8'));
if (!steps.length) {
  console.error('run: 스텝을 하나도 못 찾았다 — 파서가 워크플로 형식과 안 맞는다.');
  process.exit(1);
}

if (has('--list')) {
  console.log(`# ${path.relative(REPO, WF)} — run 스텝 ${steps.length}개\n`);
  steps.forEach((s, i) => console.log(`${String(i + 1).padStart(2)}. ${s.name}  (${s.body.length}줄)`));
  process.exit(0);
}

const only = opt('--only', null);
const stopFirst = has('--ci');
const targets = only ? [steps[Number(only) - 1]].filter(Boolean) : steps;
if (only && !targets.length) {
  console.error(`--only ${only} 은 범위를 벗어났다 (1..${steps.length})`);
  process.exit(1);
}

const box = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-local-'));
const results = [];

console.log(`# 로컬 CI (bash -e · GitHub Actions 와 동일 조건)`);
console.log(`# 레포 ${REPO}`);
console.log(`# 스텝 ${targets.length}개 · 실패 시 ${stopFirst ? '중단(--ci)' : '계속'}\n`);

for (let i = 0; i < targets.length; i++) {
  const st = targets[i];
  const n = only ? Number(only) : i + 1;
  const sh = path.join(box, `step${n}.sh`);
  // GitHub 은 `bash -e {0}` 로 스크립트 파일을 실행한다. 여기도 똑같이 파일로 넘긴다.
  fs.writeFileSync(sh, st.body.join('\n') + '\n', 'utf8');

  process.stdout.write(`[${n}/${steps.length}] ${st.name}\n`);
  const t0 = Date.now();
  const r = spawnSync('bash', ['-e', sh], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', GITHUB_ACTIONS: 'true' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - t0;

  if (r.error) {
    console.log(`  X bash 를 실행할 수 없다: ${r.error.message}`);
    console.log(`    (Windows 라면 Git Bash 가 PATH 에 있어야 한다)`);
    process.exit(1);
  }
  const ok = r.status === 0;
  results.push({ n, name: st.name, ok, code: r.status, ms });

  if (ok) {
    const tail = (r.stdout || '').trimEnd().split('\n').filter(Boolean).pop() || '';
    console.log(`  O 통과 ${ms}ms  ${tail}`);
  } else {
    console.log(`  X 실패 exit ${r.status} (${ms}ms)`);
    const out = ((r.stdout || '') + (r.stderr || '')).trimEnd();
    const shown = out.split('\n').slice(-25);
    for (const l of shown) console.log(`    | ${l}`);
    if (stopFirst) break;
  }
}

try { fs.rmSync(box, { recursive: true, force: true }); } catch {}

const failed = results.filter((r) => !r.ok);
console.log(`\n# 결과: ${results.length - failed.length}/${results.length} 통과`);
if (failed.length) {
  for (const f of failed) console.log(`#   실패 ${f.n}. ${f.name} (exit ${f.code})`);
  console.log(`#\n# 주의: 로컬 통과가 CI 통과를 보장하지는 않는다.`);
  console.log(`#   여기는 ${process.platform}, CI 는 ubuntu-latest 다 (경로·도구 버전이 다를 수 있다).`);
  process.exit(1);
}
console.log(`# 주의: 여기는 ${process.platform}, CI 는 ubuntu-latest 다 — 플랫폼 차이는 여전히 남는다.`);
