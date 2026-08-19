// SessionStart — 파이프라인 현재 단계·열린 게이트·반복 예산을 세션 시작 시 주입한다.
//
// docs/pipeline/state.json 이 없으면 아무것도 하지 않는다(게임 프로젝트가 아니면 소음 0).
// 형식은 skills/pipeline-brief/SKILL.md 에 문서화돼 있다.

import fs from 'node:fs';
import path from 'node:path';
import { readInput, emit, silent, run, readState, pipelineDir, asList } from './lib.mjs';

const STAGES = {
  0: '컨셉 발굴', 1: '기획+게임성지표', 2: '태스크 분해', 3: '프로토',
  4: '게임성 검증(balance-sim)', 5: '본구현', 6: '정확성 QA', 7: '아트/P1 코어연출',
  8: '메타·수익화', 9: '경제 검증(econ-sim)', 10: '메타 구현', 11: 'P2 파이널 연출',
};

function auditTail(dir, n) {
  try {
    const p = path.join(dir, 'audit.log');
    if (!fs.existsSync(p)) return [];
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).slice(-n);
  } catch {
    return [];
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
