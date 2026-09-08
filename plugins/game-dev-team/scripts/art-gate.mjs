#!/usr/bin/env node
// art-gate.mjs - 아트 상태를 한 번에 판정한다. **두 하네스의 공동 컨트롤 표면.**
//
//   node scripts/art-gate.mjs [--config art-gate.json] [--out dir]
//   node scripts/art-gate.mjs --init                     # 설정 파일 뼈대 생성
//
// 왜 이게 필요한가: 아트를 Claude Code 와 Codex 양쪽에서 만지려면 **누가 만졌든 같은 판정을
// 내는 하나의 표면**이 있어야 한다. 각 세션이 도구를 따로따로 골라 돌리면 "어느 쪽 판정이
// 최신인가"를 사람이 추적해야 하고, 그건 결국 추적되지 않는다.
//
// 이 스크립트는 아트 게이트의 하위 도구를 정해진 순서로 전부 돌려 **하나의 판정 + 5섹션
// 리포트**를 낸다. 두 하네스가 같은 명령을 돌리므로 결과가 비교 가능하다.
//
// 종료 코드: 0 충족 · 1 미달 · 3 측정 불가 (CI 게이트로 쓸 수 있다)
//
// 설계 원칙: **이 스크립트는 판정 로직을 갖지 않는다.** 하위 도구의 종료 코드를 모으기만 한다.
// 판정 기준을 두 곳에 두면 갈라진다.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const CONFIG_NAME = 'art-gate.json';
const TEMPLATE = {
  _note: '아트 게이트 설정. 없는 항목은 건너뛴다(건너뛴 항목은 [공백]에 남는다).',
  palette: 'art/palette.json',
  pairs: null,
  strings: null,
  uiSpec: null,
  assets: null,
  baseline: null,
  styleProfile: null,
  generated: null,
};

if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node scripts/art-gate.mjs [--config art-gate.json] [--out dir] [--harness <이름>]');
  console.log('       node scripts/art-gate.mjs --init');
  console.log('');
  console.log('설정 항목 (없으면 그 검사를 건너뛰고 [공백]에 남긴다):');
  console.log('  palette       palette.json            -> CVD 판정');
  console.log('  pairs         cvd-pairs.json          -> CVD 색쌍 명시 (없으면 state/primary/accent 이름에서 자동 유도 — 그 그룹이 없는 팔레트는 측정 불가가 된다)');
  console.log('  strings+uiSpec 문자열 + UI 스펙        -> 텍스트 오버플로 판정');
  console.log('  assets+baseline 에셋 폴더 + 베이스라인 -> 에셋 회귀 판정');
  console.log('  generated+styleProfile 생성물 + 프로필 -> 스타일 규격 채점');
  console.log('  assets        에셋 폴더                -> 텍스처 예산 실측');
  console.log('  feel          feel.json                -> 연출 상수 감사 (polish)');
  console.log('  fxManifest    fx-gen manifest.json     -> 광과민성 플래시 안전 판정 (polish)');
  console.log('  sprites       프레임 폴더               -> 스프라이트 정합성 판정');
  process.exit(2);
}

if (args.includes('--init')) {
  const dest = opt('--config', CONFIG_NAME);
  if (fs.existsSync(dest)) {
    console.error(`이미 있다: ${dest} (덮어쓰지 않는다)`);
    process.exit(2);
  }
  fs.writeFileSync(dest, JSON.stringify(TEMPLATE, null, 2) + '\n');
  console.log(`\n생성: ${dest}`);
  console.log('경로를 프로젝트에 맞게 채운 뒤 다시 돌려라. null 인 항목은 건너뛴다.');
  console.log('**이 파일을 커밋해라** — 두 하네스가 같은 설정으로 같은 판정을 내는 근거다.');
  process.exit(0);
}

// ── 설정 ─────────────────────────────────────────────────────────────────────
const configPath = opt('--config', CONFIG_NAME);
if (!fs.existsSync(configPath)) {
  console.error(`설정 파일이 없다: ${configPath}`);
  console.error('만들려면: node scripts/art-gate.mjs --init');
  process.exit(3);
}
let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error(`설정 파싱 실패: ${e.message}`);
  process.exit(3);
}

const OUT = opt('--out', null);

// ── 환경 기록 — 누가 어디서 돌렸나 ──────────────────────────────────────────
// 공동 컨트롤에서 가장 먼저 필요한 정보다. 두 세션의 판정을 비교할 때 근거가 된다.
//
// `CLAUDE_PLUGIN_ROOT` 를 쓰면 안 된다 — 그건 **훅 실행 시에만** 주입되고 일반 세션에는 없다
// (실측 확인). 일반 세션에 상시 있는 건 `CLAUDECODE` 다.
// 탐지가 틀리면 판정 비교의 근거가 틀리므로, `--harness` 로 명시 override 를 받는다.
function detectHarness() {
  const explicit = opt('--harness', null);
  if (explicit) return explicit;
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) return 'Claude Code';
  if (process.env.CODEX_HOME || process.env.CODEX_SANDBOX || process.env.CODEX_MANAGED_BY_NPM) return 'Codex';
  return '알 수 없음 (--harness 로 명시해라)';
}
const harness = detectHarness();
const git = (a) => {
  try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
};
const commit = git(['rev-parse', '--short', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const dirty = (git(['status', '--porcelain']) || '').length > 0;

// ── 하위 도구 실행 ───────────────────────────────────────────────────────────
const skill = (...p) => path.join(ROOT, 'skills', ...p);

/** 하위 스크립트를 돌려 { code, out } 을 얻는다. 판정은 종료 코드가 정본이다. */
function runTool(label, scriptPath, toolArgs) {
  if (!fs.existsSync(scriptPath)) {
    return { label, status: '측정 불가', why: `도구가 없다: ${path.relative(ROOT, scriptPath)}`, out: '' };
  }
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, [scriptPath, ...toolArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    code = typeof e.status === 'number' ? e.status : 1;
    out = (e.stdout || '') + (e.stderr || '');
  }
  const status = code === 0 ? '충족' : code === 3 ? '측정 불가' : '미달';
  const cmd = `node ${path.relative(ROOT, scriptPath).split(path.sep).join('/')} ${toolArgs.join(' ')}`;
  return { label, status, code, out, cmd };
}

const results = [];
const skipped = [];

// 1) 색각이상 — 팔레트를 고칠 때마다 돌려야 하는 검사
if (cfg.palette) {
  // 팔레트 그룹명이 state/primary/accent 가 아니면(예: ui.*/entity.*) cvd-check 가 쌍을 유도하지 못해 측정 불가가 된다.
  // 실사용(hex-danmaku, 2026-09-08)에서 그랬다 — 프로젝트는 pairs 로 의미 쌍을 명시한다.
  const a = [cfg.palette];
  if (cfg.pairs) a.push('--pairs', cfg.pairs);
  results.push(runTool('색각이상(CVD)', skill('visual-qa', 'scripts', 'cvd-check.mjs'), a));
} else {
  skipped.push('색각이상 — `palette` 미설정. 색 신호가 색각이상에서 살아 있는지 판정하지 못했다');
}

// 2) 텍스트 오버플로 — 슬롯 폭이 있어야 계산 판정이 된다
if (cfg.strings && cfg.uiSpec) {
  results.push(runTool('텍스트 오버플로', skill('ui-art-system', 'scripts', 'pseudo-loc.mjs'),
    [cfg.strings, '--spec', cfg.uiSpec]));
} else {
  skipped.push('텍스트 오버플로 — `strings`+`uiSpec` 미설정. 한국어로 맞춘 폭이 영어·독일어에서 터지는지 모른다');
}

// 3) 에셋 회귀 — 재생성이 규격을 바꿨는지
if (cfg.assets && cfg.baseline) {
  results.push(runTool('에셋 회귀', skill('asset-pipeline', 'scripts', 'asset-baseline.mjs'),
    ['check', cfg.assets, '--baseline', cfg.baseline]));
} else if (cfg.assets) {
  skipped.push('에셋 회귀 — `baseline` 미설정. `asset-baseline.mjs snap` 으로 먼저 만들어라');
} else {
  skipped.push('에셋 회귀 — `assets`+`baseline` 미설정');
}

// 4) 스타일 규격 채점 — 생성물이 프로필·팔레트 안에 있나
if (cfg.generated && cfg.styleProfile) {
  const a = [cfg.generated, '--profile', cfg.styleProfile];
  if (cfg.palette) a.push('--palette', cfg.palette);
  results.push(runTool('스타일 규격', skill('art-direction', 'scripts', 'style-score.mjs'), a));
} else {
  skipped.push('스타일 규격 — `generated`+`styleProfile` 미설정 (프로필은 `ref-analyze` 가 만든다)');
}

// 5) 텍스처 예산 — 실서비스 출구 게이트
if (cfg.assets) {
  results.push(runTool('텍스처 예산', skill('asset-budget', 'scripts', 'scan-textures.mjs'), [cfg.assets]));
} else {
  skipped.push('텍스처 예산 — `assets` 미설정. 용량·텍스처 메모리를 실측하지 못했다');
}

// 6) 연출 상수 — 논리 모순·예산 초과·접근성 누락
if (cfg.feel) {
  results.push(runTool('연출 상수', skill('polish', 'scripts', 'feel-audit.mjs'), [cfg.feel]));
} else {
  skipped.push('연출 상수 — `feel` 미설정. hit-stop·흔들림 예산과 모션 감소 경로를 판정하지 못했다');
}

// 7) 광과민성 플래시 — **안전 게이트**. 미달은 출하 차단 사유다.
if (cfg.fxManifest) {
  results.push(runTool('플래시 안전(WCAG 2.3.1)', skill('polish', 'scripts', 'flash-check.mjs'), [cfg.fxManifest]));
} else {
  skipped.push('플래시 안전 — `fxManifest` 미설정. **광과민성 발작 위험을 판정하지 못했다** (WCAG 2.3.1 / 콘솔 심의 대상)');
}

// 8) 스프라이트 정합성 — 캔버스·정체성 드리프트·떨림·알파·축소 판독성
if (cfg.sprites) {
  const a = [cfg.sprites];
  if (cfg.spriteAtlas) a.push('--atlas', cfg.spriteAtlas);
  results.push(runTool('스프라이트 정합성', skill('sprite-pipeline', 'scripts', 'sprite-qa.mjs'), a));
} else {
  skipped.push('스프라이트 정합성 — `sprites` 미설정. 프레임 간 정체성 드리프트·떨림을 판정하지 못했다');
}

// ── 판정 집계 ────────────────────────────────────────────────────────────────
// 미달(측정했고 결함이 있다)이 측정 불가보다 먼저다 — 확정된 결함이 더 조치 가능하다.
// 단, 측정 불가는 **모르는 결함을 숨기고 있다**는 뜻이라 리포트에서 같이 눈에 띄게 둔다.
const fails = results.filter((r) => r.status === '미달');
const unknowns = results.filter((r) => r.status === '측정 불가');
const verdict = fails.length ? '미달' : unknowns.length ? '측정 불가' : results.length ? '충족' : '측정 불가';

// ── 리포트 ───────────────────────────────────────────────────────────────────
const L = [];
L.push('', '# 아트 게이트 판정', '');
L.push(`하네스 **${harness}** · 브랜치 \`${branch || '?'}\` · 커밋 **${commit || '(git 없음)'}${dirty ? ' +미커밋변경' : ''}**`);
L.push(`설정 \`${configPath}\` · 검사 ${results.length}개 실행 · ${skipped.length}개 건너뜀`);
L.push('');

L.push('## [주장]');
L.push(`아트 게이트: **${verdict}**` +
  (fails.length ? ` — 미달 ${fails.length}건` : '') +
  (unknowns.length ? `${fails.length ? ' · ' : ' — '}측정 불가 ${unknowns.length}건` : ''));
L.push('');
if (results.length) {
  L.push('| 검사 | 판정 |', '|---|---|');
  for (const r of results) L.push(`| ${r.label} | **${r.status}** |`);
  L.push('');
}
if (verdict === '미달') {
  L.push('> **미달은 기획·아트 방향으로 되돌린다.** 무엇을 고칠지는 아래 각 검사 출력에 있다.');
} else if (verdict === '측정 불가') {
  L.push('> **측정 불가는 방향이 아니라 도구·설정으로 되돌린다.** 미달로 착각해 팔레트를 흔들지 마라 —');
  L.push('> 원인은 아트가 아니라 검사가 안 돌았다는 것이다.');
}
L.push('');

L.push('## [증거]');
L.push('아래는 각 하위 도구의 **출력 그대로**다. 요약하지 않는다 — 요약은 증거가 아니다.');
L.push('');
for (const r of results) {
  L.push(`### ${r.label} — ${r.status}`);
  if (r.cmd) L.push('```', r.cmd, '```');
  if (r.why) L.push(r.why);
  if (r.out) {
    const body = r.out.trim();
    L.push('<details><summary>출력</summary>', '', '```', body.length > 12000 ? body.slice(0, 12000) + '\n... (잘림)' : body, '```', '', '</details>');
  }
  L.push('');
}

L.push('## [기준]');
L.push(`설정 파일 \`${configPath}\`. 각 도구의 판정 기준은 도구 안에 있다 —`);
L.push('이 스크립트는 종료 코드만 모으고 판정 로직을 갖지 않는다(기준을 두 곳에 두면 갈라진다).');
L.push('');

L.push('## [공백]');
if (skipped.length) {
  L.push('**검사하지 않은 축** — 여기 있는 건 "문제없음"이 아니라 "모른다"다:');
  for (const s of skipped) L.push(`- ${s}`);
} else {
  L.push('- 설정된 검사는 전부 돌았다.');
}
L.push('- **보기 좋은가는 판정하지 않는다.** 규격·접근성·예산만 본다 — 시각 검수는 `visual-qa` 의');
L.push('  사람 렌즈(실제 화면·최소 해상도·바쁜 전투 화면 스크린샷)가 한다.');
L.push('- **화면 수준 비주얼 회귀는 범위 밖이다.** 에셋 파일이 같아도 화면에서 겹칠 수 있다.');
L.push('- 색 신호가 붕괴해도 **형태·아이콘 대체 신호**가 있으면 실사용에서 문제없을 수 있다 —');
L.push('  그 판정은 사람이 한다.');
if (dirty) L.push('- **미커밋 변경이 있는 상태로 판정했다.** 재현하려면 커밋 후 다시 돌려라.');
if (!commit) L.push('- git 저장소가 아니라 대상 커밋을 기록하지 못했다 — 다음 회차와 비교할 수 없다.');
L.push('');

L.push('## [잔여 위험]');
L.push('- (통과했지만 남는 위험을 여기 적는다. 비워두면 "위험이 없다"는 주장이 된다.)');
L.push('');

const report = L.join('\n');
console.log(report);

if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'art-gate-report.md'), report);
  fs.writeFileSync(path.join(OUT, 'art-gate.json'), JSON.stringify({
    meta: { harness, branch, commit, dirty, config: configPath, at: new Date().toISOString() },
    verdict,
    results: results.map(({ out, ...r }) => r),
    skipped,
  }, null, 2));
  console.log(`-> ${OUT}/art-gate-report.md · art-gate.json`);
}

if (verdict === '미달') process.exit(1);
if (verdict === '측정 불가') process.exit(3);
