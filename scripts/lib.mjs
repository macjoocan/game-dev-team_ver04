// game-dev-team 훅 공용 유틸.
// 원칙: 훅은 절대 사용자 세션을 깨지 않는다. 무슨 일이 있어도 exit 0.

import fs from 'node:fs';
import path from 'node:path';

export async function readInput() {
  try {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 훅 JSON을 내보내고 종료. obj가 없으면 조용히 종료. */
export function emit(obj) {
  try {
    if (obj) process.stdout.write(JSON.stringify(obj));
  } catch {
    /* 출력 실패해도 무시 */
  }
  process.exit(0);
}

export function silent() {
  process.exit(0);
}

export function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
}

/**
 * 파이프라인 상태 폴더.
 *
 * 정본은 `docs/pipeline/` 이지만 **`.claude/docs/pipeline/` 도 본다.**
 * 프로젝트가 문서를 `.claude/` 아래로 옮기는 일이 실제로 있었고(hex-danmaku, 2026-09-08),
 * 그러면 세션 시작 훅이 상태를 못 찾아 **게이트가 조용히 증발한다** — 에러도 안 난다.
 * 훅은 원래 "없으면 조용히 넘어간다"라서 이 실패가 눈에 안 띈다.
 *
 * 새로 만들 때는 정본 경로를 쓴다. 여기 fallback 은 이미 옮긴 프로젝트를 위한 것이다.
 */
export function pipelineDir(input) {
  const root = projectDir(input);
  const canonical = path.join(root, 'docs', 'pipeline');
  if (fs.existsSync(path.join(canonical, 'state.json'))) return canonical;
  const moved = path.join(root, '.claude', 'docs', 'pipeline');
  if (fs.existsSync(path.join(moved, 'state.json'))) return moved;
  return canonical;
}

/**
 * 프로젝트 디렉터리가 이 플러그인 자신인가.
 *
 * 플러그인 레포에서 세션을 열고 다른 게임 프로젝트를 작업하면
 * CLAUDE_PROJECT_DIR이 플러그인 루트를 가리킨다. 그 상태로 로그를 쓰면
 * 남의 게임 기획·수치가 이 공개 레포에 쌓인다. 그럴 땐 아무것도 쓰지 않는다.
 */
export function isOwnRepo(input) {
  try {
    const root = process.env.CLAUDE_PLUGIN_ROOT;
    if (!root) return false;
    const a = path.resolve(projectDir(input)).toLowerCase();
    const b = path.resolve(root).toLowerCase();
    return a === b || a.startsWith(b + path.sep);
  } catch {
    return false;
  }
}

/** docs/pipeline/state.json 을 읽는다. 없거나 깨졌으면 null. */
export function readState(input) {
  try {
    const p = path.join(pipelineDir(input), 'state.json');
    if (!fs.existsSync(p)) return null;
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    return s && typeof s === 'object' ? s : null;
  } catch {
    return null;
  }
}

/** 배열이면 문자열 배열로 정규화, 아니면 빈 배열. */
export function asList(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

/** 훅 본체를 감싸 어떤 예외도 exit 0으로 흡수한다. */
export function run(main) {
  main().catch(() => process.exit(0));
  process.on('uncaughtException', () => process.exit(0));
  process.on('unhandledRejection', () => process.exit(0));
}
