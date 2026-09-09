// SessionStart — 파이프라인 현재 단계·열린 게이트·반복 예산을 세션 시작 시 주입한다.
//
// docs/pipeline/state.json 이 없으면 아무것도 하지 않는다(게임 프로젝트가 아니면 소음 0).
// 형식은 skills/pipeline-brief/SKILL.md 에 문서화돼 있다.

import fs from 'node:fs';
import path from 'node:path';
import { readInput, emit, silent, run, readState, pipelineDir, projectDir, asList } from './lib.mjs';

const STAGES = {
  0: '컨셉 발굴', 1: '기획+게임성지표', 2: '태스크 분해', 3: '프로토',
  4: '게임성 검증(balance-sim)', 5: '본구현', 6: '정확성 QA', 7: '아트/P1 코어연출',
  8: '메타·수익화', 9: '경제 검증(econ-sim)', 10: '메타 구현', 11: 'P2 파이널 연출',
};

// 마지막 n 줄만 필요하므로 파일 전체를 읽지 않는다 — 꼬리 쪽 일부만 읽는다.
const TAIL_BYTES = 64 * 1024;

function auditTail(dir, n) {
  let fd = null;
  try {
    const p = path.join(dir, 'audit.log');
    if (!fs.existsSync(p)) return [];
    const size = fs.statSync(p).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const len = size - start;
    if (len <= 0) return [];
    const buf = Buffer.alloc(len);
    fd = fs.openSync(p, 'r');
    fs.readSync(fd, buf, 0, len, start);
    const text = buf.toString('utf8');
    // 앞이 잘려 깨진 첫 줄은 버린다
    const lines = (start > 0 ? text.slice(text.indexOf('\n') + 1) : text).split('\n').filter(Boolean);
    return lines.slice(-n);
  } catch {
    return [];
  } finally {
    try { if (fd !== null) fs.closeSync(fd); } catch { /* 무시 */ }
  }
}

run(async () => {
  const input = await readInput();
  const state = readState(input);
  if (!state) silent();

  const lines = [];

  const stage = state.stage;
  const stageName = state.stageName || (stage != null ? STAGES[stage] : null);
  if (stage != null || stageName) {
    lines.push(`현재 단계: ${stage != null ? `${stage}` : '?'} ${stageName ? `— ${stageName}` : ''}`.trim());
  }

  const gates = asList(state.openGates);
  if (gates.length) {
    lines.push('', '**사람 승인 대기 게이트** (승인 없이 다음 단계로 넘어가지 않는다):');
    gates.forEach((g) => lines.push(`  - ${g}`));
  }

  const lb = state.loopBudget;
  if (lb && typeof lb === 'object' && lb.max != null) {
    const used = Number(lb.used) || 0;
    const max = Number(lb.max) || 0;
    const exhausted = used >= max;
    lines.push(
      '',
      `반복 예산${lb.name ? ` (${lb.name})` : ''}: ${used}/${max}` +
        (exhausted ? ' — **소진됨. 사람에게 계속/피봇/보류를 물어야 한다.**' : '')
    );
  }

  const blockers = asList(state.blockers);
  if (blockers.length) {
    lines.push('', '블로커:');
    blockers.forEach((b) => lines.push(`  - ${b}`));
  }

  if (!lines.length) silent();

  const tail = auditTail(pipelineDir(input), 5);
  if (tail.length) {
    lines.push('', '최근 에이전트 활동:');
    tail.forEach((t) => lines.push(`  ${t}`));
  }

  if (state.updated) lines.push('', `(state.json 갱신: ${state.updated})`);

  // 설치본이 소스보다 뒤처졌으면 알린다. **묻지 않으면 아무도 모른다** —
  // 실측(2026-09-09): hex-danmaku 가 5일 동안 12버전 뒤처진 플러그인(0.17.0)을 쓰고 있었다.
  // 도구가 "없다"고 말하지 않으므로 세션은 정상으로 보인다. 최신이면 아무 말도 안 한다.
  try {
    const { staleReport } = await import('./check-plugin-version.mjs');
    const stale = staleReport(projectDir(input));
    if (stale) lines.push('', '**플러그인 버전 주의**', stale);
  } catch { /* 버전 확인 실패는 파이프라인 상태 주입을 막지 않는다 */ }

  emit({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        '## game-dev-team 파이프라인 상태\n' +
        lines.join('\n') +
        '\n\n출처: `docs/pipeline/state.json`. 상태가 실제와 다르면 이 파일을 먼저 고쳐라.',
    },
  });
});
