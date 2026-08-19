// PreToolUse(Write|Edit) — 게임 로직 코드에 밸런스 수치가 하드코딩되는지 감시한다.
//
// 이 플러그인의 규칙 "밸런스 수치는 로직에 하드코딩하지 말고 데이터 테이블로 분리"
// (developer.md / qa.md / meta-economy-designer.md)를 실제 게이트로 만든다.
// 차단하지 않는다 — 경고만. 최종 판단은 사람과 모델의 몫.

import path from 'node:path';
import { readInput, emit, silent, run } from './lib.mjs';

// 검사 대상 소스 확장자. 데이터/마크업은 애초에 대상이 아니다.
const SOURCE_EXT = new Set([
  '.cs', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.gd', '.cpp', '.cc', '.h', '.hpp', '.py', '.lua',
  '.rs', '.java', '.kt', '.swift',
  // 단일 파일 웹 프로토타입은 게임 로직이 <script> 안에 그대로 있다
  '.html', '.htm', '.svelte', '.vue',
]);

// 밸런스 수치가 "있어야 마땅한" 곳 — 여기서는 잡지 않는다.
const EXEMPT_DIR = /(^|[\\/])(sim|tests?|__tests__|spec|data|config|balance|tuning|Resources|ScriptableObjects|Editor)([\\/]|$)/i;
const EXEMPT_FILE = /(data|config|balance|table|tuning|constants?|settings|preset|economy|ledger|\.test|\.spec)/i;

// `<식별자> [: 타입] = <숫자>` 또는 `<식별자>: <숫자>` 형태의 대입을 찾는다.
// 비교(`==`, `>=` 등)는 lookbehind/lookahead로 걸러낸다.
const ASSIGN = new RegExp(
  String.raw`([A-Za-z_][A-Za-z0-9_.]*)\s*` +
    String.raw`(?::\s*[A-Za-z_][A-Za-z0-9_<>\[\], ]*?)?\s*` +
    String.raw`(?::|(?<![=!<>+\-*/%])=(?!=))\s*` +
    String.raw`(-?\d+(?:\.\d+)?)[fFdDmMLu]?\b`,
  'g'
);

// 식별자 한 토큰이 정확히 이것이면 밸런스 수치로 본다.
// (부분 일치가 아니라 토큰 일치 — `costumeId`가 `cost`로 오인되지 않게)
const KEYWORD = new Set([
  'hp', 'health', 'damage', 'dmg', 'atk', 'attack', 'defense', 'armor',
  'crit', 'cooldown', 'speed', 'gold', 'gem', 'exp', 'mana', 'stamina',
  'ammo', 'pity', 'heal', 'price', 'cost', 'probability', 'multiplier',
  'radius', 'duration', 'threshold',
]);

// 인접 두 토큰을 붙였을 때 이것이면 밸런스 수치로 본다.
// (`rate`·`chance` 단독은 frameRate 같은 오탐이 많아 쌍으로만 인정)
const KEYWORD_PAIR = new Set([
  'droprate', 'dropchance', 'critrate', 'critchance', 'critdamage',
  'movespeed', 'spawnrate', 'firerate', 'winrate', 'hitrate',
  'basedamage', 'maxhp', 'healamount', 'expgain', 'goldgain',
]);

// 의미 없는 값(플래그·초기화)은 밸런스가 아니다.
const TRIVIAL = new Set(['0', '1', '-1', '0.0', '1.0', '-1.0']);

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#|--)/;

/** `m_MaxHP`, `drop_rate`, `self.hp` → ['m','max','hp'] 처럼 소문자 토큰으로 쪼갠다. */
function tokenize(identifier) {
  return identifier
    .split(/[_.]/)
    .flatMap((part) =>
      part.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
    )
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

function isBalanceIdentifier(identifier) {
  const tokens = tokenize(identifier);
  if (tokens.some((t) => KEYWORD.has(t))) return true;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (KEYWORD_PAIR.has(tokens[i] + tokens[i + 1])) return true;
  }
  return false;
}

function isExempt(filePath) {
  if (!filePath) return true;
  const ext = path.extname(filePath).toLowerCase();
  if (!SOURCE_EXT.has(ext)) return true;
  if (EXEMPT_DIR.test(filePath)) return true;
  if (EXEMPT_FILE.test(path.basename(filePath, ext))) return true;
  return false;
}

function scan(text) {
  const hits = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (COMMENT_LINE.test(line)) continue;
    ASSIGN.lastIndex = 0;
    let m;
    while ((m = ASSIGN.exec(line)) !== null) {
      if (TRIVIAL.has(m[2])) continue;
      if (!isBalanceIdentifier(m[1])) continue;
      hits.push({ line: i + 1, name: m[1], value: m[2], snippet: line.trim().slice(0, 100) });
      if (hits.length >= 20) return hits;
    }
  }
  return hits;
}

run(async () => {
  const input = await readInput();
  const tool = input.tool_name;
  if (tool !== 'Write' && tool !== 'Edit') silent();

  const ti = input.tool_input || {};
  if (isExempt(ti.file_path)) silent();

  // Write 는 전체 내용, Edit 는 새로 들어가는 조각만 본다.
  const isWrite = tool === 'Write';
  const text = isWrite ? ti.content : ti.new_string;
  if (!text || typeof text !== 'string') silent();

  const hits = scan(text);
  if (hits.length === 0) silent();

  const shown = hits.slice(0, 6);
  const where = isWrite ? 'L' : '변경분 L';
  const list = shown.map((h) => `  - ${where}${h.line}  ${h.name} = ${h.value}   // ${h.snippet}`).join('\n');
  const more = hits.length > shown.length ? `\n  ... 외 ${hits.length - shown.length}건` : '';
  const file = path.basename(ti.file_path);

  emit({
    systemMessage: `⚠ [game-dev-team] ${file}: 밸런스 수치 하드코딩 의심 ${hits.length}건`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        `[game-dev-team 게이트] \`${ti.file_path}\` 에 밸런스 수치가 로직에 직접 박히는 것으로 보인다:\n` +
        `${list}${more}\n\n` +
        `이 프로젝트 규칙: 밸런스 수치(HP·데미지·확률·가격 등)는 로직에 하드코딩하지 않고 ` +
        `데이터 객체/테이블 한 곳에 모은다 — balance-sim/econ-sim이 수치를 스윕하려면 분리돼 있어야 한다.\n` +
        `데이터 테이블로 뺄 수 있으면 빼고, 이번 변경에서 정당한 예외(프로토타입 스파이크, 상수가 아닌 계산값 등)라면 ` +
        `왜 예외인지 한 줄로 사람에게 밝혀라. 이 훅은 차단하지 않는다.`,
    },
  });
});
