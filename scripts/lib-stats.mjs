// lib-stats.mjs - 검증 수치에 오차를 붙인다. 의존성 0.
//
// 왜 필요한가: ORCHESTRATION §5 는 "판수를 안 밝힌 '충분히 돌렸다'"를 위조 패턴으로 규정한다.
// 그런데 판수를 밝히는 것만으로는 부족하다 - 100판의 52% 와 3000판의 52% 는 다른 주장이고,
// 사람은 그 차이를 눈으로 못 잰다. 승률 100판이면 95% 구간이 대략 +-9pp, 2845판이면 +-1.8pp 다.
// 즉 "목표 구간 30~50%" 안에 들었다는 판정 자체가 표본이 작으면 의미가 없다.
//
// 이 파일은 그 오차를 계산해 판정을 "구간 대 구간" 비교로 바꾼다. 그러면 게이트가
// **오차 폭이 목표 구간보다 좁은가**를 요구할 수 있고, 그게 안 되면 미달이 아니라 측정 불가다.

// ── 비율(승률·클리어율·전환율)의 신뢰구간 ────────────────────────────────────

/**
 * Wilson score interval. 비율의 95% 신뢰구간.
 *
 * 정규근사(p +- z*sqrt(p(1-p)/n))를 쓰지 않는 이유: p 가 0 이나 1 에 가까울 때 구간이
 * [-0.02, 0.05] 처럼 범위를 벗어나고, 표본이 작으면 실제 신뢰수준이 95% 에 한참 못 미친다.
 * 게임 밸런스는 "승률 0% / 100% 근접"이 바로 이상 징후로 다뤄지는 영역이라 그 구간에서
 * 틀리는 추정량은 못 쓴다. Wilson 은 [0,1] 을 벗어나지 않고 작은 표본에서도 버틴다.
 *
 * @param {number} successes 성공 횟수 (예: 이긴 판수)
 * @param {number} n 전체 시행 횟수
 * @param {number} [z=1.96] 1.96 = 95%, 2.576 = 99%
 * @returns {{p:number, lo:number, hi:number, margin:number, n:number}} 비율은 0~1
 */
export function wilson(successes, n, z = 1.96) {
  const k = Number(successes) || 0;
  const N = Number(n) || 0;
  if (N <= 0) return { p: NaN, lo: NaN, hi: NaN, margin: NaN, n: 0 };
  const p = k / N;
  const z2 = z * z;
  const denom = 1 + z2 / N;
  const center = (p + z2 / (2 * N)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / N + z2 / (4 * N * N));
  const lo = Math.max(0, center - half);
  const hi = Math.min(1, center + half);
  // margin 은 실제 구간의 반폭이다. Wilson 구간은 비대칭이라 center 기준 half 와 다를 수 있다.
  return { p, lo, hi, margin: (hi - lo) / 2, n: N };
}

/**
 * 목표 오차(margin of error)를 만족하는 최소 표본 수.
 *
 * "1000판 이상"은 임의의 관습이다. 이 함수를 쓰면 판수가 목표에서 역산된 값이 된다 -
 * 왜 그만큼 돌렸는지 설명할 수 있는 수치가 된다.
 *
 * @param {number} margin 원하는 반폭. 0.02 = +-2pp
 * @param {number} [p=0.5] 예상 비율. 모르면 0.5 (가장 보수적 = 표본이 가장 많이 필요)
 * @param {number} [z=1.96]
 * @returns {number} 필요한 최소 시행 횟수
 */
export function requiredN(margin, p = 0.5, z = 1.96) {
  const m = Number(margin);
  if (!(m > 0)) return Infinity;
  const q = Math.min(Math.max(p, 0), 1);
  // 정규근사로 초기 추정 후, Wilson 구간이 실제로 목표를 만족하는 최소 n 을 찾는다.
  let n = Math.max(1, Math.ceil((z * z * q * (1 - q)) / (m * m)));
  for (let i = 0; i < 10000; i++) {
    if (wilson(Math.round(q * n), n, z).margin <= m) return n;
    n = Math.ceil(n * 1.05) + 1;
  }
  return n;
}

/**
 * 판정: 실측 구간이 목표 구간 안에 완전히 들어가는가.
 *
 * 여기가 이 파일의 핵심이다. 점추정(52%)만 보면 목표(30~50%) 밖이라 "미달"로 보이지만,
 * 구간이 [44%, 60%] 이면 그 판정은 표본이 부족해서 못 내리는 것이다 - 미달이 아니라
 * **측정 불가**다. 되돌릴 곳이 기획(수치 재조정)이 아니라 개발(판수 늘리기)이다.
 *
 * @param {{lo:number,hi:number}} ci wilson() 결과
 * @param {[number,number]} target 목표 구간 [lo, hi] (0~1)
 * @returns {{verdict:'충족'|'미달'|'측정 불가', why:string}}
 */
export function judgeAgainstTarget(ci, target) {
  const [tLo, tHi] = target;
  if (!Number.isFinite(ci.lo) || !Number.isFinite(ci.hi)) {
    return { verdict: '측정 불가', why: '표본이 없다' };
  }
  const targetWidth = tHi - tLo;
  if (ci.hi - ci.lo > targetWidth) {
    return {
      verdict: '측정 불가',
      why: `오차 폭(+-${pct(ci.margin)})이 목표 구간 폭(${pct(targetWidth)})보다 넓다 — 판수를 ${requiredN(targetWidth / 2, ci.p)}회 이상으로`,
    };
  }
  if (ci.lo >= tLo && ci.hi <= tHi) return { verdict: '충족', why: `구간 전체가 목표 안에 있다` };
  if (ci.hi < tLo) return { verdict: '미달', why: `목표 하한(${pct(tLo)})보다 확실히 낮다` };
  if (ci.lo > tHi) return { verdict: '미달', why: `목표 상한(${pct(tHi)})보다 확실히 높다` };
  return {
    verdict: '측정 불가',
    why: `구간이 목표 경계를 걸친다 (${pct(ci.lo)}~${pct(ci.hi)} vs 목표 ${pct(tLo)}~${pct(tHi)}) — 판수를 늘려야 판정된다`,
  };
}

// ── A/B (기능 ON/OFF) 비교 ───────────────────────────────────────────────────

/**
 * 대응표본 차이의 신뢰구간 (paired difference).
 *
 * balance-sim SKILL.md 가 이미 "같은 봇, 같은 시드로 기능 OFF vs ON 을 비교"하라고 한다.
 * 그게 통계에서 말하는 공통 난수(common random numbers)이고, 분산 감소 기법이다.
 * 같은 시드끼리 짝지어 차이를 보면 게임 자체의 편차가 상쇄돼 훨씬 적은 판수로 효과를 잡는다.
 *
 * 짝을 안 지으면(각각 독립 표본) 같은 결론을 내는 데 몇 배의 판수가 필요하다.
 *
 * @param {number[]} before 기능 OFF 결과 (시드 순서)
 * @param {number[]} after 기능 ON 결과 (같은 시드 순서)
 * @param {number} [z=1.96]
 * @returns {{n:number, meanDiff:number, lo:number, hi:number, significant:boolean, relative:number}}
 */
export function pairedDiff(before, after, z = 1.96) {
  const n = Math.min(before.length, after.length);
  if (n < 2) return { n, meanDiff: NaN, lo: NaN, hi: NaN, significant: false, relative: NaN };
  const d = [];
  for (let i = 0; i < n; i++) d.push(Number(after[i]) - Number(before[i]));
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const variance = d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  const lo = mean - z * se;
  const hi = mean + z * se;
  const baseMean = before.slice(0, n).reduce((a, b) => a + Number(b), 0) / n;
  return {
    n,
    meanDiff: mean,
    lo,
    hi,
    // 구간이 0 을 포함하지 않으면 "효과가 있다"고 말할 수 있다. 포함하면 못 한다.
    significant: (lo > 0 && hi > 0) || (lo < 0 && hi < 0),
    relative: baseMean !== 0 ? mean / Math.abs(baseMean) : NaN,
  };
}

// ── 분포 ─────────────────────────────────────────────────────────────────────

/** 연속값의 히스토그램. 사망 구간·런 길이 분포처럼 "어디서 끝나나"를 보는 데 쓴다. */
export function histogram(values, bins = 10) {
  const v = values.map(Number).filter(Number.isFinite);
  if (!v.length) return { bins: [], min: NaN, max: NaN, n: 0 };
  const min = Math.min(...v);
  const max = Math.max(...v);
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const x of v) counts[Math.min(bins - 1, Math.floor((x - min) / width))]++;
  return {
    n: v.length,
    min,
    max,
    bins: counts.map((c, i) => ({
      lo: min + i * width,
      hi: min + (i + 1) * width,
      count: c,
      ratio: c / v.length,
    })),
  };
}

/** 백분위. p 는 0~1. */
export function quantile(values, p) {
  const v = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const i = (v.length - 1) * Math.min(Math.max(p, 0), 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (i - lo);
}

export function mean(values) {
  const v = values.map(Number).filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

// ── 난이도 곡선 ──────────────────────────────────────────────────────────────

/**
 * 이탈 집계를 진행 퍼널로 바꾼다.
 *
 * 왜 필요한가: "그 스테이지에서 죽은 판수"만으로는 난이도를 알 수 없다. 뒤쪽 스테이지는
 * **도달한 사람이 적어서** 사망자도 적다. 난이도의 올바른 지표는 **조건부 통과율** -
 * "그 스테이지에 도달한 판 중 몇 %가 넘었나"다.
 *
 * 그리고 그걸 계산하려면 **진행 순서를 알아야 한다.** 순서를 모르면 이 함수를 쓸 수 없다
 * (빈도순으로 늘어놓고 곡선을 판정하면 전부 허위 판정이 나온다).
 *
 * @param {string[]} order 진행 순서대로의 스테이지 이름
 * @param {Map<string,number>|Array<{id:string,count:number}>} exits 스테이지별 "여기서 끝난" 판수
 * @param {number} total 전체 판수
 * @returns {Array<{name:string, reached:number, cleared:number}>}
 */
export function exitsToFunnel(order, exits, total) {
  const map = exits instanceof Map ? exits : new Map((exits || []).map((e) => [e.id, e.count]));
  const rows = [];
  let reached = total;
  for (const name of order) {
    const died = map.get(name) || 0;
    rows.push({ name, reached, cleared: Math.max(0, reached - died) });
    reached = Math.max(0, reached - died);
  }
  return rows;
}

/**
 * 난이도 곡선의 형태를 판정한다.
 *
 * 입력은 **조건부 통과율**이다 - 도달한 판(reached) 중 넘은 판(cleared). 진행 순서대로 넣어야 한다.
 *
 * 판정 기준 네 가지. "모든 스테이지가 35~75% 안에 있어야 한다"는 틀린 기준이다 -
 * 초반 스테이지의 통과율이 높은 건 정상이고(램프), 그걸 결함으로 잡으면 소음만 난다.
 *
 *  1) **좌절 벽**: 어느 스테이지든 통과율이 하한 밑으로 확실히 떨어지면 벽이다.
 *  2) **램프 사망**: 후반부(뒤 1/3) 통과율이 상한을 확실히 넘으면 난이도가 안 오르고 있다.
 *  3) **스파이크**: 인접 스테이지 간 통과율이 허용 낙차 이상 급락 = 갑자기 생긴 벽.
 *  4) **역전**: 뒤 스테이지가 앞보다 확실히 쉬움 = 난이도 순서가 뒤집혔다.
 *
 * flow channel(도전 vs 숙련): 통과율이 너무 높으면 지루함, 너무 낮으면 좌절.
 * 구간이 경계를 걸치면 결함이 아니라 **표본 부족**이다 - 그 구분을 못 하면 잡음을 오진한다.
 *
 * @param {Array<{name:string, cleared:number, reached?:number, runs?:number}>} stages 진행 순서대로
 * @param {object} [opt]
 * @param {[number,number]} [opt.band=[0.35,0.75]] 통과율 정상 대역 (하한=좌절선, 상한=후반 지루함선)
 * @param {number} [opt.spike=0.25] 인접 스테이지 간 허용 낙차
 * @param {string[]} [opt.exceptions=[]] 의도된 예외로 등재된 스테이지 이름
 */
export function curveShape(stages, opt = {}) {
  const band = opt.band || [0.35, 0.75];
  const spikeLimit = opt.spike ?? 0.25;
  const exceptions = new Set(opt.exceptions || []);
  const bandWidth = band[1] - band[0];

  const rows = stages.map((s, i) => {
    const n = s.reached ?? s.runs ?? 0;
    const ci = wilson(s.cleared, n);
    return {
      name: String(s.name),
      index: i,
      reached: n,
      ...ci,
      exception: exceptions.has(String(s.name)),
      // 후반부 = 뒤쪽 1/3. 여기서 통과율이 높으면 난이도 램프가 죽은 것이다.
      late: i >= Math.floor((stages.length * 2) / 3),
    };
  });

  const findings = [];
  const unmeasurable = [];

  for (const r of rows) {
    if (r.exception) continue;
    if (!Number.isFinite(r.p) || r.reached === 0) {
      unmeasurable.push(r.name);
      findings.push({ stage: r.name, kind: '미도달', msg: '도달한 판이 0 이다 — 앞 스테이지에서 전부 끝난다' });
      continue;
    }
    // 오차가 대역 폭보다 넓으면 이 스테이지는 판정 자체가 안 된다.
    if (r.hi - r.lo > bandWidth) {
      unmeasurable.push(r.name);
      findings.push({
        stage: r.name,
        kind: '표본부족',
        msg: `도달 ${r.reached}판, 오차 +-${pct(r.margin)}가 대역 폭(${pct(bandWidth)})보다 넓다 — 판정 불가. 도달 판수 ${requiredN(bandWidth / 2, r.p)}회 이상 필요`,
      });
      continue;
    }
    if (r.hi < band[0]) {
      findings.push({ stage: r.name, kind: '좌절벽', msg: `통과율 ${pct(r.p)} (${pct(r.lo)}~${pct(r.hi)}) — 좌절선 ${pct(band[0])} 아래. 여기서 플레이어가 막힌다` });
    } else if (r.late && r.lo > band[1]) {
      findings.push({ stage: r.name, kind: '램프사망', msg: `후반부인데 통과율 ${pct(r.p)} (${pct(r.lo)}~${pct(r.hi)}) — 상한 ${pct(band[1])} 초과. 난이도가 안 오르고 있다` });
    }
  }

  // 인접 낙차·역전: 구간이 겹치지 않을 만큼 확실할 때만 지적한다.
  const inversions = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (a.exception || b.exception) continue;
    if (!Number.isFinite(a.p) || !Number.isFinite(b.p)) continue;
    if (a.p - b.p > spikeLimit && b.hi < a.lo) {
      findings.push({
        stage: b.name,
        kind: '스파이크',
        msg: `${a.name} -> ${b.name} 통과율 ${pct(a.p - b.p)} 급락 (허용 ${pct(spikeLimit)}) — 의도된 보스면 예외로 등재해라`,
      });
    }
    if (b.lo > a.hi) inversions.push(`${a.name}(${pct(a.p)}) -> ${b.name}(${pct(b.p)})`);
  }

  const realFindings = findings.filter((f) => f.kind !== '표본부족' && f.kind !== '미도달');
  return {
    rows,
    findings,
    inversions,
    unmeasurable,
    // 판정 불가한 스테이지가 있으면 측정 불가가 먼저다 - 결함 유무를 말할 수 없는 상태다.
    verdict:
      unmeasurable.length > 0
        ? '측정 불가'
        : realFindings.length === 0 && inversions.length === 0
          ? '충족'
          : '미달',
  };
}

/**
 * 스테이지 이름을 자연 순서로 정렬한다 (stage2 < stage10).
 * 진행 순서를 **추론**하는 것이므로 쓰는 쪽에서 추론임을 밝혀야 한다.
 */
export function naturalSort(names) {
  return [...names].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }),
  );
}

// ── 표시 ─────────────────────────────────────────────────────────────────────

/** 0~1 비율을 백분율 문자열로. */
export function pct(x, digits = 1) {
  return Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '?';
}

/** `지표 | 목표 | 실측 | 95% CI | 판정` 마크다운 표 한 줄. */
export function metricRow(label, target, ci, verdict) {
  const t = Array.isArray(target) ? `${pct(target[0])}~${pct(target[1])}` : String(target ?? '-');
  return `| ${label} | ${t} | ${pct(ci.p)} | ${pct(ci.lo)}~${pct(ci.hi)} (+-${pct(ci.margin)}) | ${verdict} |`;
}

export const METRIC_TABLE_HEAD = [
  '| 지표 | 목표 | 실측 | 95% CI | 판정 |',
  '|---|---|---|---|---|',
];

/** 고정폭 콘솔 표. */
export function textTable(headers, rows) {
  const all = [headers, ...rows].map((r) => r.map((c) => String(c)));
  const w = headers.map((_, i) => Math.max(...all.map((r) => visualWidth(r[i] || ''))));
  const line = (r) => r.map((c, i) => c + ' '.repeat(Math.max(0, w[i] - visualWidth(c)))).join('  ');
  return [line(all[0]), w.map((n) => '-'.repeat(n)).join('  '), ...all.slice(1).map(line)].join('\n');
}

// 한글은 고정폭 콘솔에서 두 칸을 차지한다. 안 세면 표가 어긋난다.
function visualWidth(s) {
  let n = 0;
  for (const ch of String(s)) n += /[ᄀ-ᇿ　-〿㄰-㆏가-힣＀-｠]/.test(ch) ? 2 : 1;
  return n;
}
