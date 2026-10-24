// Authority is shared by both local tools; this does not sandbox evaluator code.
import path from 'node:path';

export const TEAM_AUTHORITIES = Object.freeze({
  tasks: '.team-work/state.json',
  experiments: 'out/experiments/',
  approvals: ['docs/pipeline/state.json', 'PIPELINE_STATE.md', '.review-loop/'],
  sharedRules: '.review-loop/rules.json',
  autoPaidRetry: false,
  autoSkillPromotion: false,
});

const protectedPaths = ['.team-work', '.review-loop', '.hermes', '.agents', '.claude', '.codex',
  'skills', 'docs/pipeline', 'AGENTS.md', 'CLAUDE.md', 'ORCHESTRATION.md', 'PIPELINE_STATE.md',
  'VISUAL_DESIGN.md', 'palette.json'];
const within = (a, b) => { const r = path.relative(a, b); return r === '' || (r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r)); };
export function assertCandidateWorkspace(root, workspace, others = []) {
  if (others.some(other => within(other, workspace) || within(workspace, other))) {
    throw new Error('candidate workspaces overlap each other');
  }
  for (const relative of protectedPaths) {
    const target = path.resolve(root, relative);
    if (within(target, workspace) || within(workspace, target)) {
      throw new Error(`candidate overlaps protected team authority: ${relative}`);
    }
  }
}
