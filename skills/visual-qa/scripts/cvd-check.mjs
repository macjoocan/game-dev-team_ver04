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

const palette = JSON.parse(fs.readFileSync(src, 'utf8'));
const flat = flattenPalette(palette);
if (!Object.keys(flat).length) { console.error('팔레트에서 색을 못 찾았다.'); process.exit(3); }

const OUT = opt('--out', null);
const notes = [];

// ── 검사할 쌍 결정 ───────────────────────────────────────────────────────────
// 명시된 쌍이 있으면 그것만. 없으면 **의미가 충돌하면 위험한 쌍**을 유도한다.
let pairs = null;
const pairsPath = opt('--pairs', null);
if (pairsPath) {
  const cfg = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
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

const collapsed = results.filter((r) => !r.ok);
const verdict = collapsed.length ? '미달' : '충족';

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
out.push(`판정: **${verdict}**` + (collapsed.length ? ` — 색만으로 구분되지 않는 쌍 ${collapsed.length}개` : ''), '');

if (collapsed.length) {
  out.push('## [발견] 붕괴하는 색쌍', '');
  out.push('| 쌍 | 이유 | 정상 dE | 최악 유형 | 최악 dE | 명암비 |', '|---|---|---|---|---|---|');
  for (const r of collapsed) {
    const normal = r.rows.find((x) => x.type === 'normal');
    out.push(`| \`${r.a}\` vs \`${r.b}\` | ${r.why} | ${normal.deltaE.toFixed(1)} | **${CVD_LABEL[r.worst.type]}** | **${r.worst.deltaE.toFixed(1)}** | ${r.worst.contrast.toFixed(2)}:1 |`);
  }
  out.push('');
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
