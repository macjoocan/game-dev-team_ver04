#!/usr/bin/env node
// check-plugin-version.mjs - 설치된 플러그인이 소스보다 뒤처졌는지 알린다.
//   node scripts/check-plugin-version.mjs            # 사람이 직접
//   (SessionStart 훅에서 자동 호출 — 뒤처졌을 때만 말한다)
//
// 왜 필요한가 — **설치본은 스냅샷이다.** 소스를 고치고 push 해도 이미 설치된 프로젝트는
// 안 바뀐다. 그리고 아무도 알려주지 않는다. 실측(2026-09-09):
//   user 스코프    0.27.2  (소스는 0.29.0)
//   project(Hex)   0.17.0  ← **12 버전 뒤처짐.** 5일 동안 아무도 몰랐다
// 그 상태의 hex-danmaku 는 art-gate·cast-distinct·sprite-qa·walk-composite·종료코드 계약이
// 전부 없는 플러그인을 쓰고 있었다. 세션은 정상으로 보인다 — 도구가 "없다"고 말하지 않는다.
//
// 그래서 **묻지 않아도 말해주는 쪽**으로 만든다. 훅은 뒤처졌을 때만 한 줄 낸다(평소 소음 0).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PLUGIN = 'game-dev-team';

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** 설치 기록에서 이 프로젝트에 실제로 적용되는 항목들을 고른다. */
export function installedVersions(projectDir) {
  const reg = readJSON(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'));
  if (!reg?.plugins) return [];
  const out = [];
  for (const [id, entries] of Object.entries(reg.plugins)) {
    if (!id.startsWith(PLUGIN + '@')) continue;
    for (const e of entries || []) {
      // project/local 스코프는 그 프로젝트에서만 유효하다 — 남의 프로젝트 기록으로 경고하면 안 된다
      if (e.projectPath && projectDir && path.resolve(e.projectPath) !== path.resolve(projectDir)) continue;
      out.push({ scope: e.scope, version: e.version, projectPath: e.projectPath });
    }
  }
  return out;
}

/** 마켓플레이스 소스(디렉터리)의 현재 버전. GitHub 소스면 알 수 없으므로 null. */
export function sourceVersion() {
  const known = readJSON(path.join(os.homedir(), '.claude', 'plugins', 'known_marketplaces.json'));
  const src = known?.[PLUGIN]?.source ?? known?.marketplaces?.[PLUGIN]?.source;
  const dir = src?.source === 'directory' ? src.path : known?.[PLUGIN]?.installLocation;
  if (!dir) return null;
  const m = readJSON(path.join(dir, '.claude-plugin', 'plugin.json'));
  return m?.version ?? null;
}

const cmp = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
};

export function staleReport(projectDir) {
  const src = sourceVersion();
  if (!src) return null;                       // 소스 버전을 모르면 조용히 넘어간다
  const stale = installedVersions(projectDir).filter((i) => cmp(i.version, src) < 0);
  if (!stale.length) return null;
  const lines = [`플러그인이 소스(${src})보다 뒤처졌다 — **설치본은 스냅샷이라 push 만으로는 안 바뀐다.**`];
  for (const s of stale) {
    const where = s.projectPath ? ` (${s.projectPath})` : '';
    lines.push(`  - ${s.scope}${where}: ${s.version}  ->  \`claude plugin update ${PLUGIN}@${PLUGIN} --scope ${s.scope}\``);
  }
  lines.push('갱신 뒤 재시작해야 적용된다. 마켓플레이스 소스가 바뀌었으면 `claude plugin marketplace update` 를 먼저.');
  return lines.join('\n');
}

// 직접 실행: 항상 결과를 낸다(훅과 달리 조용하지 않다)
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('check-plugin-version.mjs')) {
  const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const src = sourceVersion();
  const inst = installedVersions(dir);
  if (!src) {
    console.log('소스 버전을 알 수 없다(마켓플레이스가 디렉터리 소스가 아니다). 판정: 측정 불가');
    process.exit(3);
  }
  console.log(`소스 버전: ${src}`);
  if (!inst.length) { console.log('이 프로젝트에 설치된 기록이 없다.'); process.exit(3); }
  for (const i of inst) console.log(`  ${i.scope}${i.projectPath ? ` (${i.projectPath})` : ''}: ${i.version}`);
  const rep = staleReport(dir);
  if (rep) { console.log('\n' + rep); process.exit(1); }
  console.log('\n전부 최신이다.');
}
