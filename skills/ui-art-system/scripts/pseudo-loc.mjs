#!/usr/bin/env node
// pseudo-loc.mjs - 의사 로케일로 텍스트 오버플로를 미리 잡는다.
//
//   node pseudo-loc.mjs <strings.json> [--spec ui-spec.json] [--expand 0.35] [--out dir]
//   node pseudo-loc.mjs <strings.json> --write pseudo.json    # 의사 로케일 파일만 생성
//
// 텍스트 오버플로는 게임 로컬라이제이션 버그 1위이고, 의사 로케일이 그 종류의 ~80%를 잡는다.
// 번역이 오기 전에, 설계 단계에서 잡을 수 있다는 게 이 기법의 요점이다.
//
// **한국어 프로젝트에서 위험 방향이 반대라는 점이 중요하다.**
// 한국어·중국어·일본어는 같은 뜻을 더 적은 글자로 표현하는 **짧은** 언어다. 독일어·러시아어는
// 20~35%, 핀란드어·헝가리어는 그 이상 팽창한다. 즉 한국어로 폭을 맞추면 영어에서 이미 빠듯하고
// 독일어에서 터진다. ui-art-system 은 "한국어·영어가 모두 들어가는지 확인한다"고만 적어뒀는데
// 확인할 도구가 없었다 - 이 스크립트가 그 칸을 채운다.

import fs from 'node:fs';
import path from 'node:path';
import { textTable } from '../../../scripts/lib-stats.mjs';

const args = process.argv.slice(2);
const src = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!src || src.startsWith('--')) {
  console.error('usage: node pseudo-loc.mjs <strings.json> [--spec ui-spec.json] [--expand 0.35] [--out dir] [--write pseudo.json]');
  console.error('  strings.json: { "key": "텍스트" } 또는 { "key": { "ko": "...", "en": "..." } }');
  console.error('  --spec:       ui-spec.json — 슬롯 폭을 읽어 넘침을 계산 판정한다');
  console.error('  --expand:     팽창률 (기본 0.35 = +35%. 독일어 상한대는 0.5)');
  process.exit(2);
}

const EXPAND = Number(opt('--expand', 0.35));
const OUT = opt('--out', null);
const notes = [];

// ── 문자열 로드 ──────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
/** { key: { ko, en } } 로 정규화 */
const strings = {};
for (const [k, v] of Object.entries(raw)) {
  if (k.startsWith('_')) continue;
  if (typeof v === 'string') strings[k] = { base: v };
  else if (v && typeof v === 'object') strings[k] = { ...v };
}
if (!Object.keys(strings).length) { console.error('문자열을 못 찾았다.'); process.exit(3); }

// ── 폭 계산 ──────────────────────────────────────────────────────────────────
// 고정폭이 아닌 실제 폰트 폭은 폰트에 따라 다르다. 여기서는 **문자 부류별 상대 전각(em) 폭**으로
// 근사한다 - 정확한 픽셀이 아니라 "어느 문자열이 위험한가"를 가리는 게 목적이다.
//
//   한글·한자·가나 = 1.0em (전각)   라틴 대문자/숫자 = 0.60em
//   라틴 소문자 = 0.52em             좁은 글자(iljt.,) = 0.28em   공백 = 0.26em
function emWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === ' ') w += 0.26;
    else if (/[iljt.,:;'`!|()\[\]]/.test(ch)) w += 0.28;
    else if (/[A-Z0-9]/.test(ch)) w += 0.60;
    else if (/[a-z]/.test(ch)) w += 0.52;
    else if (c >= 0x1100 && c <= 0x11ff) w += 1.0;        // 한글 자모
    else if (c >= 0x3000 && c <= 0x9fff) w += 1.0;        // CJK
    else if (c >= 0xac00 && c <= 0xd7a3) w += 1.0;        // 한글 음절
    else if (c >= 0xff00 && c <= 0xff60) w += 1.0;        // 전각
    else w += 0.55;
  }
  return w;
}

// ── 의사 로케일 생성 ─────────────────────────────────────────────────────────
// 목표 두 가지: (1) 길이를 목표 팽창률만큼 늘린다  (2) 하드코딩된 문자열을 눈에 띄게 만든다.
// 액센트 치환은 "번역되지 않은 문자열"을 즉시 알아보게 한다 - 화면에 평범한 텍스트가 남아
// 있으면 그건 코드에 박힌 것이다.
const ACCENT = {
  a: 'à', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ',
  l: 'ł', m: 'ɱ', n: 'ñ', o: 'ô', p: 'þ', q: 'ǫ', r: 'ř', s: 'š', t: 'ţ', u: 'û', v: 'ṽ',
  w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'À', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ',
  L: 'Ł', M: 'Ṁ', N: 'Ñ', O: 'Ô', P: 'Þ', Q: 'Ǫ', R: 'Ř', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ',
  W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};
const PAD = 'xẋŵ';

/** 의사 로케일 문자열. 앞뒤 대괄호로 잘림도 보이게 한다(끝 대괄호가 안 보이면 잘린 것). */
export function pseudo(s, expand = EXPAND) {
  const body = String(s).replace(/[A-Za-z]/g, (c) => ACCENT[c] || c);
  // {0}·%s·{name} 같은 치환 토큰은 건드리지 않는다 - 깨지면 런타임 오류가 된다
  const target = emWidth(s) * (1 + expand);
  let padded = body;
  let i = 0;
  while (emWidth(padded) < target) padded += PAD[i++ % PAD.length];
  return '[' + padded + ']';
}

// 치환 토큰 보존 검사
const TOKEN = /(\{\w*\}|%[sdif]|%\d+\$[sdif]|<[^>]+>)/g;
function tokensOf(s) { return (String(s).match(TOKEN) || []).sort().join('|'); }

// ── 슬롯 폭 (선택) ──────────────────────────────────────────────────────────
// ui-spec.json 에서 텍스트가 들어가는 슬롯의 폭을 읽는다.
let slots = null;
const specPath = opt('--spec', null);
if (specPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  slots = {};
  for (const s of spec.sprites || []) {
    if (!s.name) continue;
    // 9-slice 보더 안쪽이 실제 텍스트 영역이다. 없으면 pad 를 쓴다.
    const insetL = s.nineSlice?.left ?? s.pad ?? 0;
    const insetR = s.nineSlice?.right ?? s.pad ?? 0;
    slots[s.name] = { w: s.w, h: s.h, textW: Math.max(0, s.w - insetL - insetR) };
  }
  notes.push('슬롯 폭을 `' + path.basename(specPath) + '` 의 9-slice 보더 안쪽으로 계산했다.');
} else {
  notes.push('`--spec ui-spec.json` 이 없어 **넘침을 판정하지 못했다** — 길이 배수만 냈다.');
}

// 문자열 키가 슬롯 이름과 어떻게 대응되는지: strings.json 의 `_slots` 매핑 또는 키 접두사
const slotMap = raw._slots || null;
const fontEm = Number(opt('--font-em', 28)); // 기본 폰트 크기(px). 슬롯 폭 대비 계산에 쓴다

// ── 판정 ─────────────────────────────────────────────────────────────────────
const rows = [];
const overflow = [];
const tokenBroken = [];

for (const [key, langs] of Object.entries(strings)) {
  const base = langs.ko ?? langs.base ?? langs.en ?? Object.values(langs)[0];
  const en = langs.en ?? null;
  const ps = pseudo(base, EXPAND);

  if (tokensOf(base) !== tokensOf(ps)) tokenBroken.push(key);

  const wBase = emWidth(base);
  const wEn = en ? emWidth(en) : null;
  const wPs = emWidth(ps);

  const slotName = slotMap?.[key] || null;
  const slot = slotName && slots ? slots[slotName] : null;
  let fit = '-';
  if (slot) {
    const availEm = slot.textW / fontEm;
    fit = wPs <= availEm ? '들어감' : '**넘침**';
    if (wPs > availEm) overflow.push({ key, slotName, need: wPs, avail: availEm });
  }

  rows.push({
    key, base, en, ps,
    wBase, wEn, wPs,
    ratio: wBase > 0 ? wPs / wBase : 0,
    enRatio: wEn && wBase > 0 ? wEn / wBase : null,
    slotName, fit,
  });
}

const verdict = specPath
  ? (overflow.length ? '미달' : '충족')
  : '측정 불가';

// ── 출력 ─────────────────────────────────────────────────────────────────────
const out = [];
out.push('', '# 의사 로케일 텍스트 오버플로 판정', '');
out.push(`문자열 ${rows.length}개 · 팽창률 +${(EXPAND * 100).toFixed(0)}%` + (specPath ? ` · 슬롯 ${Object.keys(slots).length}개` : ''));
out.push('');
out.push('## [주장]');
out.push(`판정: **${verdict}**` + (overflow.length ? ` — 넘치는 문자열 ${overflow.length}개` : specPath ? '' : ' — 슬롯 폭이 없어 넘침을 계산할 수 없다'), '');

if (overflow.length) {
  out.push('## [발견] 넘치는 문자열', '');
  out.push('| 키 | 슬롯 | 필요(em) | 가용(em) | 초과 |', '|---|---|---|---|---|');
  for (const o of overflow) {
    out.push(`| \`${o.key}\` | ${o.slotName} | ${o.need.toFixed(2)} | ${o.avail.toFixed(2)} | ${((o.need / o.avail - 1) * 100).toFixed(0)}% |`);
  }
  out.push('');
  out.push('> 고치는 방법: 슬롯을 넓히거나 · 문자열을 줄이거나 · 줄바꿈/축약을 허용하거나 ·');
  out.push('> 폰트 자동 축소를 켠다. **폭을 한국어 기준으로 맞춰두면 영어·독일어에서 터진다.**');
  out.push('');
}

if (tokenBroken.length) {
  out.push('## [발견] 치환 토큰 손상', '');
  out.push('의사 로케일 변환이 `{0}`·`%s` 같은 토큰을 깨뜨렸다: ' + tokenBroken.map((k) => '`' + k + '`').join(', '));
  out.push('런타임 오류로 이어지므로 변환 규칙을 확인해라.', '');
}

out.push('## [증거]', '```');
out.push(textTable(
  ['키', '원문 폭', '영문 폭', '의사 폭', '배수', '슬롯', '판정'],
  rows.slice(0, 40).map((r) => [
    r.key,
    r.wBase.toFixed(2),
    r.wEn != null ? r.wEn.toFixed(2) + (r.enRatio ? ' (x' + r.enRatio.toFixed(2) + ')' : '') : '-',
    r.wPs.toFixed(2),
    'x' + r.ratio.toFixed(2),
    r.slotName || '-',
    r.fit,
  ]),
));
out.push('```');
if (rows.length > 40) out.push(`> 앞 40개만 표시 (전체 ${rows.length}개)`);
out.push('> 폭은 문자 부류별 상대 전각(em) 근사다 — 정확한 픽셀이 아니라 **어느 문자열이 위험한가**를 가린다.');
out.push('> 한글은 1.0em, 라틴 소문자는 0.52em 로 센다. 그래서 같은 뜻이면 한글이 짧게 나온다.', '');

const enWider = rows.filter((r) => r.enRatio && r.enRatio > 1.15);
if (enWider.length) {
  out.push('### 영문이 원문보다 15% 이상 넓은 문자열', '');
  out.push('이미 영어에서 빠듯하다는 뜻이고, 독일어(+20~35%)에서는 확실히 넘친다.');
  for (const r of enWider.slice(0, 12)) out.push(`- \`${r.key}\` x${r.enRatio.toFixed(2)} — "${r.en}"`);
  out.push('');
}

out.push('## [기준]');
out.push(`팽창률 +${(EXPAND * 100).toFixed(0)}% (독일어·러시아어 상한대는 +50% 로 한 번 더 돌려봐라)`);
out.push(specPath ? `슬롯 폭 출처: \`${specPath}\` · 폰트 ${fontEm}px 가정` : '슬롯 폭 없음');
out.push('');

out.push('## [공백]');
for (const n of notes) out.push('- ' + n);
out.push('- **실제 폰트 메트릭이 아니다.** em 근사이므로 경계선 문자열은 실기기에서 확인해라.');
out.push('- 줄바꿈·자동 축소·말줄임이 켜져 있으면 "넘침"이 실제 문제가 아닐 수 있다 — 그 설정은');
out.push('  이 도구가 모른다. 판정 후 실제 화면에서 `visual-qa` 로 확인한다.');
out.push('- 세로 넘침(줄 수 증가)은 판정하지 않았다. 팽창은 높이도 늘린다.');
out.push('- RTL(아랍어·히브리어) 미러링은 이 도구 범위 밖이다.', '');

out.push('## [잔여 위험]');
out.push('- (통과했지만 남는 위험을 여기 적는다.)', '');

const report = out.join('\n');
console.log(report);

// 의사 로케일 파일 출력
const writePath = opt('--write', null);
if (writePath) {
  const pseudoFile = {};
  for (const r of rows) pseudoFile[r.key] = r.ps;
  fs.writeFileSync(writePath, JSON.stringify(pseudoFile, null, 2));
  console.log(`-> ${writePath} (게임에 넣어 실제 화면에서 확인해라)`);
}
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'pseudo-loc-report.md'), report);
  fs.writeFileSync(path.join(OUT, 'pseudo-loc.json'), JSON.stringify({ verdict, expand: EXPAND, overflow, rows }, null, 2));
  console.log(`-> ${OUT}/pseudo-loc-report.md · pseudo-loc.json`);
}

if (verdict === '미달') process.exit(1);
if (verdict === '측정 불가') process.exit(3);
