// 플러그인 무결성 검사 — 참조와 실체를 기계적으로 대조한다.
//
// v0.8.0에서 "에이전트가 존재하지 않는 스킬 4개를 참조하고 있었다"는 결함이 나왔다(REVIEW.md B-2).
// frontmatter의 `skills:`/`tools:`는 틀려도 조용히 무시되기 때문에, 사람이 눈으로 보는 한
// 같은 결함이 반복된다. 이 스크립트가 그 대조를 대신한다.
//
// 훅과 달리 이건 **차단하는 게이트**다. CI와 릴리즈 전에 돌리고, 실패하면 exit 1.
//   node scripts/validate-plugin.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const errors = [];
const warns = [];
const err = (where, msg) => errors.push({ where, msg });
const warn = (where, msg) => warns.push({ where, msg });

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
const dirs = (p) =>
  exists(p) ? fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
const mdFiles = (p) =>
  exists(p) ? fs.readdirSync(p).filter((f) => f.endsWith('.md')) : [];

/**
 * 최소 YAML frontmatter 파서.
 * 이 레포가 실제로 쓰는 문법만 다룬다: 스칼라, 접힌 블록(`>`), `- ` 리스트.
 * 의존성 0을 유지하려고 직접 짰다 — 범용 YAML이 필요해지면 그때 파서를 넣어라.
 */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = {};
  const lines = m[1].split(/\r?\n/);
  let key = null;
  let mode = null; // 'fold' | 'list'

  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue;

    if (mode === 'fold' && /^\s+\S/.test(line)) {
      out[key] += (out[key] ? ' ' : '') + line.trim();
      continue;
    }
    if (mode === 'list' && /^\s*-\s+/.test(line)) {
      out[key].push(line.replace(/^\s*-\s+/, '').trim());
      continue;
    }

    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) {
      mode = null;
      continue;
    }
    key = kv[1];
    const val = kv[2].trim();
    if (val === '>' || val === '|' || val === '>-' || val === '|-') {
      out[key] = '';
      mode = 'fold';
    } else if (val === '') {
      out[key] = [];
      mode = 'list';
    } else {
      out[key] = val;
      mode = null;
    }
  }
  return out;
}

// ── 1. 스킬 ───────────────────────────────────────────────────────────────
const skillDirs = dirs(path.join(ROOT, 'skills')).sort();
const skillNames = new Set(skillDirs);

for (const d of skillDirs) {
  const p = path.join(ROOT, 'skills', d, 'SKILL.md');
  if (!exists(p)) {
    err(`skills/${d}`, 'SKILL.md 가 없다. 스킬 디렉터리는 SKILL.md 를 반드시 가진다.');
    continue;
  }
  const fm = frontmatter(read(p));
  if (!fm) {
    err(rel(p), 'frontmatter(--- 블록)가 없다.');
    continue;
  }
  if (!fm.name) err(rel(p), 'frontmatter 에 `name` 이 없다.');
  else if (fm.name !== d) err(rel(p), `frontmatter name(\`${fm.name}\`)이 디렉터리명(\`${d}\`)과 다르다.`);
  if (!fm.description) err(rel(p), 'frontmatter 에 `description` 이 없다 — 없으면 스킬이 트리거되지 않는다.');
  else if (String(fm.description).length < 40)
    warn(rel(p), 'description 이 너무 짧다. 트리거 문구가 들어가야 자동 호출된다.');
}

// ── 2. 에이전트 ───────────────────────────────────────────────────────────
const KNOWN_TOOLS = new Set([
  'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob',
  'WebSearch', 'WebFetch', 'Task', 'Agent', 'NotebookEdit', 'TodoWrite',
]);

const agentFiles = mdFiles(path.join(ROOT, 'agents')).sort();
for (const f of agentFiles) {
  const p = path.join(ROOT, 'agents', f);
  const fm = frontmatter(read(p));
  const base = f.replace(/\.md$/, '');
  if (!fm) {
    err(rel(p), 'frontmatter 가 없다.');
    continue;
  }
  if (!fm.name) err(rel(p), 'frontmatter 에 `name` 이 없다.');
  else if (fm.name !== base) err(rel(p), `frontmatter name(\`${fm.name}\`)이 파일명(\`${base}\`)과 다르다.`);
  if (!fm.description) err(rel(p), 'frontmatter 에 `description` 이 없다.');

  // 핵심 검사: 존재하지 않는 스킬 참조. 조용히 무시되는 결함이라 기계로만 잡힌다.
  for (const s of Array.isArray(fm.skills) ? fm.skills : []) {
    if (!skillNames.has(s)) {
      err(rel(p), `존재하지 않는 스킬을 참조한다: \`${s}\`. 번들하거나 참조를 지워라.`);
    }
  }

  const tools = String(fm.tools || '').split(',').map((t) => t.trim()).filter(Boolean);
  for (const t of tools) {
    if (!KNOWN_TOOLS.has(t)) warn(rel(p), `알 수 없는 툴 이름: \`${t}\` (오타면 조용히 무시된다).`);
  }
  // 산출물을 파일로 남기라고 지시받은 에이전트가 쓸 수단이 없으면 그 지시는 죽은 지시다.
  const body = read(p).replace(/^---[\s\S]*?---/, '');
  if (/작성한다|남긴다|기록한다|문서로/.test(body) && tools.length && !tools.includes('Write')) {
    warn(rel(p), '본문이 문서 작성을 지시하는데 `tools:` 에 Write 가 없다.');
  }
}

// ── 3. 훅 ────────────────────────────────────────────────────────────────
const hooksPath = path.join(ROOT, 'hooks', 'hooks.json');
let hookCount = 0;
if (!exists(hooksPath)) {
  warn('hooks/hooks.json', '훅 설정이 없다.');
} else {
  let cfg = null;
  try {
    cfg = JSON.parse(read(hooksPath));
  } catch (e) {
    err('hooks/hooks.json', `JSON 파싱 실패: ${e.message}`);
  }
  for (const [event, entries] of Object.entries(cfg?.hooks || {})) {
    for (const entry of entries || []) {
      for (const h of entry.hooks || []) {
        hookCount++;
        for (const a of h.args || []) {
          const m = /^\$\{CLAUDE_PLUGIN_ROOT\}\/(.+)$/.exec(String(a));
          if (m && !exists(path.join(ROOT, m[1]))) {
            err('hooks/hooks.json', `${event}: 존재하지 않는 스크립트를 가리킨다 → ${m[1]}`);
          }
        }
      }
    }
  }
}

// ── 4. 매니페스트 ─────────────────────────────────────────────────────────
const pluginPath = path.join(ROOT, '.claude-plugin', 'plugin.json');
const marketPath = path.join(ROOT, '.claude-plugin', 'marketplace.json');
let pluginName = null;
if (!exists(pluginPath)) {
  err('.claude-plugin/plugin.json', '플러그인 매니페스트가 없다.');
} else {
  try {
    const pj = JSON.parse(read(pluginPath));
    pluginName = pj.name;
    if (!pj.name) err('plugin.json', '`name` 이 없다.');
    if (!pj.version) err('plugin.json', '`version` 이 없다.');
    else if (!/^\d+\.\d+\.\d+/.test(pj.version)) err('plugin.json', `version 이 semver 가 아니다: ${pj.version}`);
  } catch (e) {
    err('plugin.json', `JSON 파싱 실패: ${e.message}`);
  }
}
if (exists(marketPath)) {
  try {
    const mj = JSON.parse(read(marketPath));
    for (const p of mj.plugins || []) {
      if (pluginName && p.name !== pluginName) {
        err('marketplace.json', `플러그인 이름이 plugin.json(\`${pluginName}\`)과 다르다: \`${p.name}\``);
      }
      const src = String(p.source || '');
      if (src.startsWith('./') && !exists(path.join(ROOT, src))) {
        err('marketplace.json', `source 경로가 없다: ${src}`);
      }
    }
  } catch (e) {
    err('marketplace.json', `JSON 파싱 실패: ${e.message}`);
  }
}

// ── 5. 커맨드 (있을 때만) ─────────────────────────────────────────────────
const cmdFiles = mdFiles(path.join(ROOT, 'commands')).sort();
for (const f of cmdFiles) {
  const p = path.join(ROOT, 'commands', f);
  const fm = frontmatter(read(p));
  if (!fm?.description) err(rel(p), 'frontmatter 에 `description` 이 없다 — 커맨드 목록에 설명이 안 뜬다.');
}

// ── 6. README ↔ 실체 ──────────────────────────────────────────────────────
// 문서가 개수를 말하면 그 개수는 검증 가능한 주장이다. 늘려놓고 문서를 안 고치는 게 흔한 사고.
const readmePath = path.join(ROOT, 'README.md');
if (exists(readmePath)) {
  const readme = read(readmePath);

  const sm = /###\s*스킬\s*(\d+)\s*개/.exec(readme);
  if (!sm) warn('README.md', '"스킬 N개" 헤딩을 못 찾았다 — 개수 대조를 건너뛴다.');
  else if (Number(sm[1]) !== skillDirs.length)
    err('README.md', `"스킬 ${sm[1]}개"라고 적혀 있는데 실제는 ${skillDirs.length}개다.`);

  const hm = /###\s*훅\s*(\d+)\s*개/.exec(readme);
  if (hm && Number(hm[1]) !== hookCount)
    err('README.md', `"훅 ${hm[1]}개"라고 적혀 있는데 hooks.json 의 훅은 ${hookCount}개다.`);

  const cm = /###\s*커맨드\s*(\d+)\s*개/.exec(readme);
  if (cm && Number(cm[1]) !== cmdFiles.length)
    err('README.md', `"커맨드 ${cm[1]}개"라고 적혀 있는데 실제는 ${cmdFiles.length}개다.`);

  const am = /###\s*역할\s*에이전트\s*(\d+)\s*개/.exec(readme);
  if (am && Number(am[1]) !== agentFiles.length)
    err('README.md', `"역할 에이전트 ${am[1]}개"라고 적혀 있는데 실제는 ${agentFiles.length}개다.`);

  // 스킬 목록 불릿이 실재하는 스킬을 가리키는가 + 빠진 스킬은 없는가.
  const listed = new Set();
  for (const m of readme.matchAll(/^-\s+\*\*`([a-z0-9-]+)`\*\*/gm)) listed.add(m[1]);
  for (const n of listed) {
    if (!skillNames.has(n)) err('README.md', `존재하지 않는 스킬을 목록에 적었다: \`${n}\``);
  }
  for (const n of skillDirs) {
    if (!listed.has(n)) warn('README.md', `스킬 \`${n}\` 이 README 목록에 없다.`);
  }
}

// ── 7. Codex 매니페스트 버전 일치 (있을 때만) ─────────────────────────────
// 이 레포는 Claude(.claude-plugin)와 Codex(.codex-plugin)를 겸용한다.
// 버전 bump를 한쪽만 하는 사고가 실제로 있었다(리뷰 기록) — 기계로 잡는다.
const codexPath = path.join(ROOT, '.codex-plugin', 'plugin.json');
if (exists(codexPath) && exists(pluginPath)) {
  try {
    const cj = JSON.parse(read(codexPath));
    const pj = JSON.parse(read(pluginPath));
    if (cj.version !== pj.version) {
      err('.codex-plugin/plugin.json', `버전 불일치: claude=${pj.version} vs codex=${cj.version} — 둘 다 bump해라.`);
    }
  } catch (e) {
    err('.codex-plugin/plugin.json', `JSON 파싱 실패: ${e.message}`);
  }
}

// ── 8. 미러 드리프트 (plugins/game-dev-team 이 있을 때만) ────────────────
// 루트가 정본, plugins/는 Codex 로컬 마켓플레이스용 미러. sync-plugin.ps1 을 안 돌리고
// 커밋하면 두 설치본이 조용히 갈라진다. PowerShell 없는 CI에서도 잡히도록 여기서 대조한다.
import crypto from 'node:crypto';
const MIRROR = path.join(ROOT, 'plugins', 'game-dev-team');
if (exists(MIRROR)) {
  const CANON_DIRS = ['agents', 'skills', 'hooks', 'commands', 'scripts', '.claude-plugin', '.codex-plugin'];
  const CANON_FILES = ['README.md', 'USAGE.md', 'ORCHESTRATION.md', 'REVIEW.md', 'AGENTS.md', 'CLAUDE.md'];
  const hashFile = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const treeMap = (base, relDir) => {
    const out = new Map();
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else out.set(path.relative(base, p).split(path.sep).join('/'), hashFile(p));
      }
    };
    const abs = path.join(base, relDir);
    if (fs.existsSync(abs)) walk(abs);
    return out;
  };
  const driftItems = new Set();
  for (const d of CANON_DIRS) {
    const a = treeMap(ROOT, d);
    const b = treeMap(MIRROR, d);
    if (a.size !== b.size) { driftItems.add(d); continue; }
    for (const [k, v] of a) if (b.get(k) !== v) { driftItems.add(d); break; }
  }
  for (const f of CANON_FILES) {
    const a = path.join(ROOT, f), b = path.join(MIRROR, f);
    const ha = exists(a) ? hashFile(a) : null;
    const hb = exists(b) ? hashFile(b) : null;
    if (ha !== hb) driftItems.add(f);
  }
  if (driftItems.size) {
    err('plugins/game-dev-team', `미러 드리프트: ${[...driftItems].join(', ')} — scripts/sync-plugin.ps1 로 재생성해라.`);
  }
}

// ── 결과 ─────────────────────────────────────────────────────────────────
const line = (x) => `  ${x.where}: ${x.msg}`;

if (warns.length) {
  console.log(`\n⚠  경고 ${warns.length}건`);
  warns.forEach((w) => console.log(line(w)));
}
if (errors.length) {
  console.log(`\n✗  오류 ${errors.length}건`);
  errors.forEach((e) => console.log(line(e)));
  console.log(
    `\n검사 실패. 에이전트 ${agentFiles.length} · 스킬 ${skillDirs.length} · 훅 ${hookCount} · 커맨드 ${cmdFiles.length}\n`
  );
  process.exit(1);
}

console.log(
  `\n✓  검사 통과 — 에이전트 ${agentFiles.length} · 스킬 ${skillDirs.length} · 훅 ${hookCount} · 커맨드 ${cmdFiles.length}` +
    (warns.length ? ` (경고 ${warns.length}건)` : '') +
    '\n'
);
