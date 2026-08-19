// PreToolUse(Bash: git commit) — 게이트 미승인 상태로 커밋이 나가는지 확인한다.
//
// 차단하지 않는다. "지금 열린 게이트가 있는데 커밋하려 한다"는 사실을 사람과 모델에게 보여줄 뿐.

import { execFileSync } from 'node:child_process';
import { readInput, emit, silent, run, readState, projectDir, asList } from './lib.mjs';

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

run(async () => {
  const input = await readInput();
  if (input.tool_name !== 'Bash') silent();

  const cmd = String(input.tool_input?.command || '');
  if (!/\bgit\s+(-\S+\s+)*commit\b/.test(cmd)) silent();

  const cwd = projectDir(input);
  const warnings = [];

  const gates = asList(readState(input)?.openGates);
  if (gates.length) {
    warnings.push(
      `열린 승인 게이트 ${gates.length}건이 남아 있다:\n` + gates.map((g) => `  - ${g}`).join('\n')
    );
  }

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (branch && /^(main|master|develop)$/.test(branch)) {
    warnings.push(`기본 브랜치(\`${branch}\`)에 직접 커밋하려 한다. 작업 브랜치를 먼저 파는 게 맞는지 확인.`);
  }

  if (/(^|\s)(--no-verify|-n)(\s|$)/.test(cmd)) {
    warnings.push('`--no-verify`로 훅을 건너뛰려 한다. 사람이 명시적으로 요청한 게 아니면 하지 마라.');
  }

  if (!warnings.length) silent();

  emit({
    systemMessage: `⚠ [game-dev-team] 커밋 전 확인 ${warnings.length}건`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        '[game-dev-team 커밋 게이트] 커밋 전에 아래를 사람에게 알리고 진행 여부를 확인해라. 훅은 차단하지 않는다.\n\n' +
        warnings.map((w, i) => `${i + 1}. ${w}`).join('\n'),
    },
  });
});
