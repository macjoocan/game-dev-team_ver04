import { judgeAgainstTarget, wilson } from './lib-stats.mjs';
export const aggregate = codes => codes.includes(1) ? 1 : codes.length === 0 || codes.some(c => c !== 0) ? 3 : 0;
export function metricResults(contract, entry) {
  return (contract.metrics || []).map(m => {
    const value = entry.steps.find(s => s.id === m.check)?.normalized?.metrics[m.id];
    const code = !Number.isFinite(value) ? 3 : m.threshold === undefined || m.direction === 'observe' ? 0
      : (m.direction === 'min' ? value >= m.threshold : value <= m.threshold) ? 0 : 1;
    return { id: m.id, check: m.check, value: value ?? null, required: m.required === true, code };
  });
}
const result = (code, why, metrics = {}) => ({ code, why, metrics });
export function normalize(check, proc, data, subjectHash) {
  if (proc.timedOut || proc.interrupted || proc.error || proc.signal) return result(3, proc.error || 'process interrupted/timeout/signal');
  if (check.adapter === 'evidence') {
    if (!data || !data.id || !data.type || !data.reviewer || !Number.isFinite(Date.parse(data.at)) || data.subjectHash !== subjectHash
      || !data.raw || ![0, 1, 3].includes(data.code)) return result(3, 'missing or stale human evidence');
    return result(data.code, 'provided evidence; identity not authenticated');
  }
  if (check.adapter === 'exit') return result(proc.exitCode === 0 ? 0 : (check.failureCodes || []).includes(proc.exitCode) ? 1 : 3, `exit ${proc.exitCode}`);
  if (!data || ![0, 1, 3].includes(proc.exitCode)) return result(3, 'missing result or process error');
  if (check.adapter === 'balance-sim') {
    if (proc.exitCode === 3 || data.placeholder || !data.meta || !data.a || !check.conditions
      || Object.entries(check.conditions).some(([k, v]) => data.meta[k] !== v)) return result(3, 'placeholder or mismatched balance conditions');
    const n = data.a.n;
    const rawWins = data.a.wins ?? (Number.isFinite(data.a.winRate?.p) ? data.a.winRate.p * n : NaN);
    const wins = Math.round(rawWins);
    if (!Number.isSafeInteger(n) || n < 1 || n !== data.meta.runs || !Number.isSafeInteger(wins) || wins < 0 || wins > n
      || Math.abs(wins - rawWins) > 1e-6 || !Array.isArray(data.targets?.winRate) || data.targets.winRate.length !== 2
      || !check.target || check.target.some((v, i) => v !== data.targets.winRate[i])) return result(3, 'invalid balance sample/fixed target');
    const ci = wilson(wins, n);
    const judge = judgeAgainstTarget(ci, data.targets.winRate);
    const code = { '충족': 0, '미달': 1, '측정 불가': 3 }[judge.verdict] ?? 3;
    if (proc.exitCode !== code) return result(3, 'balance exit/CI verdict conflict');
    return result(code, judge.why, { winRate: wins / n, winRateLo: ci.lo, winRateHi: ci.hi, runs: n, lengthMean: data.a.lengthMean });
  }
  if (!['pass', 'fail', 'unknown'].includes(data.verdict) || !data.metrics || typeof data.metrics !== 'object'
    || Object.values(data.metrics).some(v => typeof v !== 'number' || !Number.isFinite(v))) return result(3, 'invalid check JSON');
  const code = { pass: 0, fail: 1, unknown: 3 }[data.verdict];
  if (proc.exitCode !== code) return result(3, 'exit/verdict conflict');
  return result(code, data.reason || data.verdict, data.metrics);
}
