#!/usr/bin/env node
// 논리적 클리어 불가 검사. 0 충족 / 1 미달 / 2 사용법 / 3 측정 불가.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('-') || (args.length > 1 && (args.length !== 3 || args[1] !== '--out' || !args[2]))) {
  console.error('usage: node clearability-check.mjs <adapter.mjs> [--out dir]');
  process.exit(2);
}
const file = path.resolve(args[0]);
const failures = [], gaps = [], unknown = [], measured = [], evidence = [];
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const id = x => typeof x === 'string' && x.trim().length > 0;
const amount = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
function cycle(edges) {
  const state = new Map();
  for (const start of edges.keys()) {
    if (state.has(start)) continue;
    const stack = [{ id: start, i: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const top = stack.at(-1), next = edges.get(top.id) || [];
      if (top.i === next.length) { state.set(top.id, 2); stack.pop(); continue; }
      const n = next[top.i++];
      if (state.get(n) === 1) return stack.slice(stack.findIndex(x => x.id === n)).map(x => x.id).concat(n);
      if (!state.has(n)) { state.set(n, 1); stack.push({ id: n, i: 0 }); }
    }
  }
  return null;
}
let model;
try {
  const adapter = await import(pathToFileURL(file).href);
  if (adapter.PLACEHOLDER !== false) throw new Error('PLACEHOLDER=false가 아니다. 실제 데이터 연결을 먼저 확인한다');
  if (typeof adapter.model !== 'function') throw new Error('model 함수가 없다');
  model = await adapter.model();
  if (!object(model)) throw new Error('model 반환값은 객체여야 한다');
} catch (e) { unknown.push(`어댑터를 측정하지 못했다: ${e.message}`); }
if (model && object(model)) {
  if (model.supply === undefined && model.require === undefined) gaps.push('공급·요구 미제공 — 자원 수지 미측정');
  else if (!object(model.supply) || !Array.isArray(model.require) || !Object.values(model.supply).every(amount) ||
    !model.require.every(r => object(r) && id(r.id) && object(r.needs) && Object.values(r.needs).every(amount)) ||
    new Set(model.require.map(r => r.id)).size !== model.require.length) unknown.push('공급·요구 형식 오류: 중복 ID 없이 유한한 0 이상 수치가 필요하다');
  else {
    const totals = new Map();
    for (const r of model.require) for (const [k, v] of Object.entries(r.needs)) totals.set(k, (totals.get(k) || 0) + v);
    if (!totals.size) gaps.push('요구 항목이 없어 자원 수지를 측정하지 않았다');
    else if ([...totals].some(([k, v]) => !Object.hasOwn(model.supply, k) || !Number.isFinite(v))) unknown.push('공급에 없는 자원 또는 합계 범위 오류: ' + [...totals].filter(([k, v]) => !Object.hasOwn(model.supply, k) || !Number.isFinite(v)).map(([k]) => k).join(', '));
    else {
      measured.push('자원 수지');
      for (const [k, v] of totals) {
        evidence.push(`${k}: 필수 소비량 합계 ${v}, 공급 ${model.supply[k]}`);
        if (v > model.supply[k]) failures.push(`자원 부족: ${k} 요구 총합 ${v} > 공급 ${model.supply[k]}`);
      }
    }
  }
  if (model.locks === undefined) gaps.push('잠금 그래프 미제공 — 도달성 미측정');
  else if (!Array.isArray(model.locks) || !model.locks.every(x => object(x) && id(x.id) && Array.isArray(x.needs) && x.needs.every(id)) || new Set(model.locks.map(x => x.id)).size !== model.locks.length) unknown.push('잠금 형식 오류: 고유 ID와 needs 배열이 필요하다');
  else if (!model.locks.length) gaps.push('잠금 항목이 없어 도달성을 측정하지 않았다');
  else {
    const edges = new Map(model.locks.map(x => [x.id, x.needs]));
    const missing = [...new Set(model.locks.flatMap(x => x.needs).filter(x => !edges.has(x)))];
    if (missing.length) unknown.push('잠금이 요구하는 미정의 항목: ' + missing.join(', '));
    else {
      measured.push('도달성'); evidence.push(`잠금 ${edges.size}개: needs가 모두 있어야 해제, 빈 needs는 시작점`);
      const found = cycle(edges);
      if (found) failures.push('잠금 순환: ' + found.join(' → '));
    }
  }
  if (model.order === undefined) gaps.push('순서 제약 미제공 — 순서 미측정');
  else if (!Array.isArray(model.order) || !model.order.every(x => Array.isArray(x) && x.length === 2 && x.every(id))) unknown.push('순서 제약은 [선행 ID, 후행 ID] 쌍이어야 한다');
  else if (!model.order.length) gaps.push('순서 제약이 없어 순서를 측정하지 않았다');
  else {
    const edges = new Map();
    for (const [a, b] of model.order) { if (!edges.has(a)) edges.set(a, []); if (!edges.has(b)) edges.set(b, []); edges.get(a).push(b); }
    measured.push('순서 제약'); evidence.push(`순서 제약 ${model.order.length}개`);
    const found = cycle(edges);
    if (found) failures.push('순서 제약 순환: ' + found.join(' → '));
  }
}
if (!measured.length) unknown.push('측정한 축이 없다');
const verdict = failures.length ? '미달' : unknown.length ? '측정 불가' : '충족';
const git = spawnSync('git', ['-C', path.dirname(file), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
const result = { verdict, adapter: file, commit: git.status === 0 ? git.stdout.trim() : null, measured, evidence, failures, gaps: [...gaps, ...unknown] };
const report = ['# 클리어 가능성 판정', '', `## [주장]\n판정: **${verdict}**. 검사한 축에서만 논리적 모순을 판단한다.`,
  `## [증거]\n대상: ${file}\n커밋: ${result.commit || '미확인'}\n${[...evidence, ...failures].join('\n') || '측정값 없음'}`,
  '## [기준]\n필수 소비 자원의 요구 합계 ≤ 공급. 모든 잠금 선행 항목이 정의되고 순환이 없어야 한다. 순서 제약은 비순환이어야 한다.',
  `## [공백]\n${result.gaps.join('\n') || '제공된 세 축 검사 완료. 실제 데이터 매핑의 정확성은 별도 확인한다.'}`,
  '## [잔여 위험]\n재사용 자원·선택 분기는 이 소비량 계약의 대상이 아니다. 부분 검사 통과는 전체 클리어 보장이 아니다. 사람의 반응 속도·재미·체감 난이도와 실제 빌드는 검사하지 않았다.', ''].join('\n\n');
console.log(report);
if (args[2]) {
  try { fs.mkdirSync(args[2], { recursive: true }); fs.writeFileSync(path.join(args[2], 'clearability-report.md'), report); fs.writeFileSync(path.join(args[2], 'clearability.json'), JSON.stringify(result, null, 2) + '\n'); }
  catch (e) { console.error(`측정 불가: 리포트 저장 실패 (${e.message})`); process.exit(3); }
}
process.exit(verdict === '미달' ? 1 : verdict === '측정 불가' ? 3 : 0);
