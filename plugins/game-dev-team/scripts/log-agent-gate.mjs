// SubagentStop — 역할 에이전트가 끝날 때마다 감사 로그를 남긴다.
//
// 게이트 승인이 "언제 무슨 근거로" 이뤄졌는지 나중에 되짚을 수 있어야 한다.
// docs/pipeline/audit.log 에 한 줄씩. 출력은 없다(세션에 소음 추가 금지).

import fs from 'node:fs';
import path from 'node:path';
import { readInput, silent, run, pipelineDir, isOwnRepo } from './lib.mjs';

const MAX_SUMMARY = 180;
// 감사 로그는 append-only 라 프로젝트가 길어지면 무한히 자란다. 상한을 두고 오래된 줄을 버린다.
// (게이트 근거를 되짚는 게 목적이라 최근 이력만 있으면 충분하다)
const MAX_LINES = 2000;
const ROTATE_AT_BYTES = 512 * 1024;

run(async () => {
  const input = await readInput();
  const agent = input.agent_type;
  if (!agent || !String(agent).includes('game-dev-team')) silent();

  // 플러그인 레포 자신에는 쓰지 않는다 — 다른 프로젝트의 작업 기록이 여기 쌓이면 안 된다.
  if (isOwnRepo(input)) silent();

  const role = String(agent).split(':').pop();
  const summary = String(input.last_assistant_message || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SUMMARY);

  const dir = pipelineDir(input);
  fs.mkdirSync(dir, { recursive: true });

  const line = [
    new Date().toISOString(),
    role,
    String(input.agent_id || '').slice(0, 8),
    summary || '(무응답)',
  ].join('\t');

  const logPath = path.join(dir, 'audit.log');
  fs.appendFileSync(logPath, line + '\n', 'utf8');

  // 상한을 넘으면 뒤쪽 MAX_LINES 줄만 남긴다. 실패해도 로그일 뿐이니 조용히 넘어간다.
  try {
    if (fs.statSync(logPath).size > ROTATE_AT_BYTES) {
      const kept = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-MAX_LINES);
      fs.writeFileSync(logPath, kept.join('\n') + '\n', 'utf8');
    }
  } catch { /* 회전 실패는 무시 — 다음 실행에서 다시 시도한다 */ }

  silent();
});
