#!/usr/bin/env node
// cvd-check.mjs - 색각이상(CVD)에서 색 신호가 살아 있는지 판정한다.
//
//   node cvd-check.mjs <palette.json> [--pairs pairs.json] [--out dir]
//   node cvd-check.mjs <palette.json> --image screen.png --out dir   # 이미지 4종 시뮬 출력
//
// visual-qa 는 접근성 렌즈에 "색만으로 주는 신호"를 이미 넣어놨는데 판정할 도구가 없었다.
// 이 스크립트가 그 칸을 채운다.
//
// **왜 원본에 WCAG 만 재면 안 되나**: WCAG 명암비는 3색형 관찰자 기준으로 정의된 값이라
// CVD 로 그대로 변환되지 않는다. 올바른 순서는 **시뮬레이션한 뒤 재는 것**이다.
// 그리고 명암비는 밝기 차이만 보므로 "빨강 vs 초록"처럼 밝기가 같고 색만 다른 쌍의 붕괴를
// 못 잡는다 - 그게 정확히 적/녹색맹이 겪는 문제다. 그래서 CIE Lab 색차(dE)를 함께 본다.
//
// 판정은 색에 대한 것이고, **형태·아이콘 대체 신호가 있는지는 사람이 본다**(visual-qa 렌즈).

import fs from 'node:fs';
import path from 'node:path';
import {
  parseHex, toHex, simulateCvd, contrastRatio, deltaE76, checkPair,
  flattenPalette, CVD_TYPES, CVD_LABEL, CVD_PREVALENCE, DELTA_E_MIN, WCAG_LARGE,
} from '../../../scripts/lib-color.mjs';
import { textTable } from '../../../scripts/lib-stats.mjs';

const args = process.argv.slice(2);
const src = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!src || src.startsWith('--')) {
  console.error('usage: node cvd-check.mjs <palette.json> [--pairs pairs.json] [--out dir] [--image a.png]');
  console.error('  palette.json: art-direction 의 팔레트 (@ 토큰의 정본)');
  console.error('  --pairs:      의미가 다른 색쌍 목록. 없으면 위험 쌍을 자동 유도한다');
  console.error('  --image:      PNG 를 CVD 4종으로 시뮬해 --out 에 낸다 (눈으로 확인용)');
  process.exit(2);
}

// 입력이 없으면 **측정 불가(3)** 다. 예외로 죽으면 exit 1 이 되고, art-gate 는 1 을 "미달"로 읽는다 —
// 설정 파일의 경로 오타가 "색각이상 미달"로 보고된 실측 사례가 있다(2026-09-08).
function readJsonOrUnmeasurable(file, what) {
  if (!fs.existsSync(file)) { console.error(`${what} 파일이 없다: ${file}\n판정: 측정 불가 — 경로를 확인해라.`); process.exit(3); }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error(`${what} 파일을 JSON 으로 읽지 못했다: ${file} (${e.message})\n판정: 측정 불가.`); process.exit(3); }
}
const palette = readJsonOrUnmeasurable(src, '팔레트');
const flat = flattenPalette(palette);
if (!Object.keys(flat).length) { console.error('팔레트에서 색을 못 찾았다.'); process.exit(3); }

const OUT = opt('--out', null);
const notes = [];

// ── 검사할 쌍 결정 ───────────────────────────────────────────────────────────
// 명시된 쌍이 있으면 그것만. 없으면 **의미가 충돌하면 위험한 쌍**을 유도한다.
let pairs = null;
const pairsPath = opt('--pairs', null);
if (pairsPath) {
  const cfg = readJsonOrUnmeasurable(pairsPath, '색쌍(--pairs)');
  pairs = cfg.pairs;
} else {
  pairs = [];
  const keys = Object.keys(flat);
  const pick = (re) => keys.filter((k) => re.test(k));

  // 1) state 그룹 내부 전체 - success/danger/warning 은 서로 구분돼야 의미가 산다
  const states = pick(/(^|\.)state\./i);
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) pairs.push({ a: states[i], b: states[j], why: '상태 신호끼리' });
  }
  // 2) danger vs 나머지 주요 색 - 위험을 못 알아보는 게 가장 치명적이다
  const danger = keys.filter((k) => /danger|fail|error|negative/i.test(k));
  const majors = keys.filter((k) => /(primary|accent)\.(base|light|dark)$/i.test(k));
  for (const d of danger) for (const m of majors) pairs.push({ a: d, b: m, why: '위험 vs 주요' });
  // 3) primary vs accent - 주 액션과 보조 액션
  const p = keys.find((k) => /primary\.base$/i.test(k));
  const ac = keys.find((k) => /accent\.base$/i.test(k));
  if (p && ac) pairs.push({ a: p, b: ac, why: '주 액션 vs 보조' });
  // 4) 희귀도 등급이 있으면 인접 등급끼리
  const rar = pick(/rarity|grade|tier/i).sort();
  for (let i = 1; i < rar.length; i++) pairs.push({ a: rar[i - 1], b: rar[i], why: '인접 희귀도' });

  notes.push('색쌍을 팔레트 이름에서 **자동 유도**했다 — 의미가 다른 쌍을 정확히 알려면 `--pairs pairs.json` 을 써라.');
}

pairs = (pairs || []).filter((pr) => flat[pr.a] && flat[pr.b]);
if (!pairs.length) {
  console.error('검사할 색쌍이 없다. --pairs 로 명시하거나 팔레트에 state/primary/accent 그룹을 두어라.');
  process.exit(3);
}

// ── 판정 ─────────────────────────────────────────────────────────────────────
const results = pairs.map((pr) => {
  const r = checkPair(flat[pr.a], flat[pr.b], { minDeltaE: DELTA_E_MIN, minContrast: 0 });
  return { ...pr, hexA: flat[pr.a], hexB: flat[pr.b], ...r };
});

// ── 유병률 가중 ─────────────────────────────────────────────────────────────
// 실사용(hex-danmaku)에서 나온 결함: 붕괴 7건 중 5건이 **전색맹 전용**이었는데
// 유병률 가중이 없어서 흔한 유형(녹색맹 남성 6%)의 진짜 2건이 그 안에 묻혔다.
// 전색맹은 <0.01% 다. 같은 무게로 보고하면 우선순위를 사람이 다시 매겨야 하고,
// 그러면 이 도구의 판정을 쓰지 않게 된다.
const COMMON = new Set(['protanopia', 'deuteranopia']);   // 남성 약 8% 합계
const RARE = new Set(['tritanopia', 'achromatopsia']);    // 매우 드묾

for (const r of results) {
  const failing = r.rows.filter((x) => x.type !== 'normal' && !x.ok).map((x) => x.type);
  const normalRow = r.rows.find((x) => x.type === 'normal');
  r.failsNormal = !normalRow.ok;                          // 정상 시야에서도 안 구분된다
  r.failsCommon = failing.some((t) => COMMON.has(t));
  r.failsRareOnly = failing.length > 0 && failing.every((t) => RARE.has(t));
  r.failing = failing;
  // 정상 시야 붕괴 > 흔한 색약 붕괴 > 드문 유형만
  r.severity = r.failsNormal ? 3 : r.failsCommon ? 2 : r.failsRareOnly ? 1 : 0;
}

const sevNormal = results.filter((r) => r.severity === 3);
const sevCommon = results.filter((r) => r.severity === 2);
const sevRare = results.filter((r) => r.severity === 1);
const collapsed = results.filter((r) => !r.ok);

// 드문 유형만 붕괴하면 `조건부` 다 — 고칠 값은 있지만 출하를 막을 근거는 아니다.
const verdict = (sevNormal.length || sevCommon.length) ? '미달'
  : sevRare.length ? '조건부' : '충족';

// ── 이미지 시뮬 (선택) ──────────────────────────────────────────────────────
let imageNote = null;
const imagePath = opt('--image', null);
if (imagePath) {
  if (!OUT) {
    imageNote = '--image 를 쓰려면 --out 도 줘야 한다 (시뮬 결과를 쓸 곳).';
  } else {
    try {
      const { readPNG } = await import('../../../scripts/lib-png-read.mjs');
      const { writePNG } = await import('../../../scripts/lib-png.mjs');
      const img = readPNG(imagePath);
      fs.mkdirSync(OUT, { recursive: true });
      const made = [];
      for (const type of CVD_TYPES) {
        const buf = Buffer.from(img.data);
        for (let i = 0; i < buf.length; i += 4) {
          const s = simulateCvd({ r: buf[i] / 255, g: buf[i + 1] / 255, b: buf[i + 2] / 255 }, type);
          buf[i] = Math.round(s.r * 255);
          buf[i + 1] = Math.round(s.g * 255);
          buf[i + 2] = Math.round(s.b * 255);
        }
        const name = path.basename(imagePath, path.extname(imagePath)) + '.' + type + '.png';
        writePNG(path.join(OUT, name), img.width, img.height, buf);
        made.push(name);
      }
      imageNote = `이미지 시뮬 ${made.length}종: ${made.join(' · ')}`;
    } catch (e) {
      imageNote = `이미지 시뮬 실패: ${e.message} (PNG 전용이다)`;
    }
  }
}

// ── 출력 ─────────────────────────────────────────────────────────────────────
const out = [];
out.push('', '# 색각이상(CVD) 판정', '');
out.push(`팔레트 \`${src}\` · 색 ${Object.keys(flat).length}개 · 검사 쌍 ${results.length}개`);
out.push('');
out.push('## [주장]');
out.push(`판정: **${verdict}**` +
  (sevNormal.length ? ` — **정상 시야에서도 안 구분 ${sevNormal.length}개**` : '') +
  (sevCommon.length ? `${sevNormal.length ? ' · ' : ' — '}흔한 색약 붕괴 ${sevCommon.length}개` : '') +
  (sevRare.length ? `${sevNormal.length || sevCommon.length ? ' · ' : ' — '}드문 유형만 ${sevRare.length}개` : ''), '');
if (collapsed.length) {
  out.push('> **유병률로 우선순위를 매긴다.** 녹색맹·적색맹은 남성 약 8%고 청색맹·전색맹은 <0.01%다.');
  out.push('> 같은 무게로 보고하면 드문 유형이 흔한 유형을 묻어버린다(실사용에서 실제로 그랬다).');
  out.push('');
}

const severityBlock = (list, title, note) => {
  if (!list.length) return;
  out.push(`## [발견] ${title}`, '');
  out.push('| 쌍 | 이유 | 정상 dE | 붕괴 유형 | 최악 dE | 명암비 |', '|---|---|---|---|---|---|');
  for (const r of list) {
    const normal = r.rows.find((x) => x.type === 'normal');
    const types = r.failing.length ? r.failing.map((t) => CVD_LABEL[t]).join(', ') : '정상';
    out.push(`| \`${r.a}\` vs \`${r.b}\` | ${r.why} | ${normal.deltaE.toFixed(1)} | **${types}** | **${r.worst.deltaE.toFixed(1)}** | ${r.worst.contrast.toFixed(2)}:1 |`);
  }
  out.push('');
  if (note) { out.push(note, ''); }
};

severityBlock(sevNormal, '정상 시야에서도 구분되지 않는다 — **가장 먼저 본다**',
  '> 이건 색각이상 문제가 아니라 **모든 플레이어**의 문제다. 두 색이 사실상 같으므로\n' +
  '> 구분이 형태·외곽선·위치에만 의존한다. **그게 게임 크기·이동 중에 충분한지는 사람이 확인해라** —\n' +
  '> 같은 팔레트를 공유하는 게 의도라면(같은 계열 아이템 등) 형태 차이를 `visual-qa` 로 검수하면 된다.');
severityBlock(sevCommon, '흔한 색약(적/녹)에서 붕괴 — **우선 고친다**',
  '> 녹색맹은 남성 약 6%, 적색맹 약 2%다. 실제 플레이어 중에 있다고 보는 게 맞다.');
severityBlock(sevRare, '드문 유형(청색맹·전색맹)에서만 붕괴 — 우선순위 낮음',
  '> 유병률 <0.01%다. 흔한 유형에서는 구분되므로 **출하를 막을 근거는 아니다.**\n' +
  '> 고대비·색약 모드를 만들 때 같이 손보면 싸다.');

if (collapsed.length) {
  out.push(`> dE < ${DELTA_E_MIN} 이면 의미가 다른 두 색이 **한눈에 구분되지 않는다.**`);
  out.push('> 고치는 방법은 둘 중 하나다:');
  out.push('> 1. **명도를 벌린다** — 색상만 다르면 적/녹색맹에서 붕괴한다. 밝기 차이는 모든 유형에서 남는다.');
  out.push('> 2. **색 아닌 신호를 붙인다** — 형태·아이콘·패턴·텍스트. 접근성 원칙은 "색을 유일한');
  out.push('>    지표로 쓰지 않는다"이고, 이건 팔레트 수정 없이도 해결된다.');
  out.push('');
}

out.push('## [증거]', '```');
out.push(textTable(
  ['쌍', '정상', 'P', 'D', 'T', 'A', '최악', '판정'],
  results.map((r) => {
    const g = (t) => r.rows.find((x) => x.type === t).deltaE.toFixed(1);
    return [
      r.a + ' / ' + r.b, g('normal'), g('protanopia'), g('deuteranopia'),
      g('tritanopia'), g('achromatopsia'), CVD_LABEL[r.worst.type], r.ok ? 'OK' : '붕괴',
    ];
  }),
));
out.push('```');
out.push(`> 숫자는 CIE76 색차(dE). 기준 ${DELTA_E_MIN} 이상. P=적색맹 D=녹색맹 T=청색맹 A=전색맹`);
out.push(`> 유병률: ${Object.entries(CVD_PREVALENCE).map(([k, v]) => CVD_LABEL[k] + ' ' + v).join(' · ')} —`);
out.push('> **녹색맹이 압도적으로 흔하다.** 하나만 고칠 여력이면 D 부터 본다.', '');

if (imageNote) out.push('### 이미지 시뮬', imageNote, '');

out.push('## [기준]');
out.push(pairsPath ? `색쌍 출처: \`${pairsPath}\`` : '색쌍을 자동 유도했다 (팔레트 이름 기반)');
out.push(`구분 기준: CIE76 dE >= ${DELTA_E_MIN} · UI 컴포넌트 명암비 권장 ${WCAG_LARGE}:1`, '');

out.push('## [공백]');
for (const n of notes) out.push('- ' + n);
out.push('- **형태·아이콘 대체 신호가 있는지는 이 도구가 판정하지 않는다.** 색이 붕괴해도 아이콘이');
out.push('  다르면 실사용에서 문제없을 수 있다 — 그 판정은 `visual-qa` 의 사람 검수 몫이다.');
out.push('- 시뮬 행렬은 **완전 이색형 근사**다(심각도 1.0). 실제 개인차는 이보다 넓고, 부분 색약은');
out.push('  더 약하게 겪는다. 즉 이 결과는 **하한 점검**이다 — 여기서 통과해도 안심은 아니다.');
out.push('- 팔레트 색만 봤다. 실제 화면에서 겹치는 색(반투명·그라디언트·배경 위 텍스트)은');
out.push('  `--image` 로 실제 스크린샷을 시뮬해 눈으로 확인해라.');
out.push('- 애니메이션·명멸로 주는 신호는 정지 이미지 판정 밖이다.', '');

out.push('## [잔여 위험]');
out.push('- (통과했지만 남는 위험을 여기 적는다.)', '');

const report = out.join('\n');
console.log(report);

if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'cvd-report.md'), report);
  fs.writeFileSync(path.join(OUT, 'cvd.json'), JSON.stringify({
    palette: src, verdict, pairs: results.map(({ rows, ...r }) => ({ ...r, rows })),
  }, null, 2));
  console.log(`-> ${OUT}/cvd-report.md · cvd.json`);
}

if (verdict === '미달') process.exit(1);
if (verdict === '조건부') process.exit(0);   // 드문 유형만 붕괴 — 출하를 막지 않는다
