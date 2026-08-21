#!/usr/bin/env node
// comfy-run.mjs - ComfyUI 에 워크플로를 제출하고 결과 이미지를 받아온다.
//   node comfy-run.mjs <workflow.api.json> [--out <dir>] [--host 127.0.0.1:8188]
//                      [--set <노드id>.<입력>=<값>]...  [--seed <n>] [--batch <n>]
//
// 의존성 없음(Node 내장 fetch). 사람이 브라우저를 열 필요가 없다 — 이게 캐릭터 축 자동화의 전제다.
//
// 워크플로 JSON 은 ComfyUI 웹UI 에서 **"Save (API Format)"** 으로 뽑은 것이어야 한다.
// 일반 Save 로 받은 파일은 구조가 달라 /prompt 가 400 으로 거부한다 — 제일 흔한 실수다.

import fs from 'node:fs';
import path from 'node:path';
import { colorName } from '../../../scripts/lib-palette.mjs';

const args = process.argv.slice(2);
const wfPath = args[0];
if (!wfPath || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node comfy-run.mjs <workflow.api.json> [--out dir] [--host 127.0.0.1:8188]');
  console.error('       [--set 6.text="a cat"] [--seed 12345] [--batch 4]');
  console.error('       [--style <profile.json>]  ref-analyze 가 만든 스타일 프로필 주입');
  console.error('       [--keep-loaded]  배치 후 모델을 내리지 않는다(기본은 내린다)');
  process.exit(2);
}
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const HOST = opt('--host', '127.0.0.1:8188');
const OUT = opt('--out', 'comfy-out');
const SEED = opt('--seed', null);
const BATCH = Number(opt('--batch', 1));
const BASE = `http://${HOST}`;

const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

// ── 스타일 프로필 주입 ────────────────────────────────────────────────────────
// profile.json 하나가 생성 기준이자 채점 기준이다(style-score.mjs 가 같은 파일을 본다).
// 여기서 프롬프트에 넣는 문구와 채점에서 재는 값이 갈라지면 판정 근거가 사라진다.
const STYLE = opt('--style', null);
let styleInfo = null;
if (STYLE) {
  const prof = JSON.parse(fs.readFileSync(STYLE, 'utf8'));
  const hints = prof.promptHints || {};
  // hex 는 모델이 못 알아듣는다 — 색 이름으로 바꿔 넣는다
  const colors = (prof.palette || []).slice(0, 4).map((c) => colorName(c.hex));
  const posFrag = [
    colors.length ? `color palette: ${colors.join(', ')}` : null,
    hints.saturation, hints.value, hints.outline,
  ].filter(Boolean).join(', ');
  // 프로필이 "굵은 검은 외곽선을 안 쓴다"고 하면 그걸 네거티브로도 못 박는다
  const negFrag = [
    /no heavy black outline/.test(hints.outline || '') ? 'thick black outline, heavy ink lines' : null,
    prof.target?.singleSubject ? 'character sheet, multiple characters, multiple views, collage' : null,
  ].filter(Boolean).join(', ');

  // KSampler 를 찾아 positive/negative 가 실제로 어느 노드인지 따라간다
  // (노드 id 를 6/7 로 가정하면 다른 워크플로에서 조용히 엉뚱한 곳에 붙는다)
  const ks = Object.entries(wf).find(([, n]) => /KSampler/.test(n.class_type));
  if (!ks) throw new Error('워크플로에 KSampler 가 없다 — --style 을 어디에 붙일지 모른다');
  const posId = ks[1].inputs.positive?.[0];
  const negId = ks[1].inputs.negative?.[0];
  if (posId && wf[posId]?.inputs?.text !== undefined && posFrag) {
    wf[posId].inputs.text = `${wf[posId].inputs.text}, ${posFrag}`;
  }
  if (negId && wf[negId]?.inputs?.text !== undefined && negFrag) {
    wf[negId].inputs.text = `${wf[negId].inputs.text}, ${negFrag}`;
  }
  styleInfo = { name: prof.name, refs: prof.refs, file: STYLE, positive: posFrag, negative: negFrag };
  console.log(`스타일 "${prof.name}" 적용 (레퍼런스 ${prof.refs}장)`);
  console.log(`  + ${posFrag}`);
}

// --set 6.text=... 형태의 덮어쓰기. 프롬프트·시드를 코드에서 바꿔 배치를 돌리기 위한 창구.
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--set') continue;
  const m = /^([^.]+)\.([^=]+)=([\s\S]*)$/.exec(args[i + 1] || '');
  if (!m) throw new Error(`--set 형식이 틀렸다: ${args[i + 1]} (예: 6.text="...")`);
  const [, node, input, raw] = m;
  if (!wf[node]) throw new Error(`워크플로에 없는 노드 id: ${node}`);
  let v = raw;
  if (/^-?\d+(\.\d+)?$/.test(raw)) v = Number(raw);
  wf[node].inputs[input] = v;
}

// 시드는 재현성의 핵심이라 항상 기록한다. 안 주면 결정론적으로 만든다(Math.random 안 씀).
function seedFor(i) {
  if (SEED !== null) return Number(SEED) + i;
  return (Date.now() % 1e9) + i * 7919;
}
const seedNodes = Object.entries(wf).filter(([, n]) => n.inputs && 'seed' in n.inputs).map(([id]) => id);
const noiseNodes = Object.entries(wf).filter(([, n]) => n.inputs && 'noise_seed' in n.inputs).map(([id]) => id);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(seed) {
  for (const id of seedNodes) wf[id].inputs.seed = seed;
  for (const id of noiseNodes) wf[id].inputs.noise_seed = seed;
  const res = await fetch(`${BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: wf, client_id: 'game-dev-team-char-art' }),
  });
  const body = await res.text();
  if (!res.ok) {
    // 400 이면 대개 API Format 이 아니거나 노드 입력이 빠진 것이다. 원문을 그대로 보여준다.
    throw new Error(`/prompt 거부 (${res.status}): ${body.slice(0, 800)}`);
  }
  return JSON.parse(body).prompt_id;
}

async function waitFor(promptId) {
  for (let t = 0; t < 600; t++) {           // 최대 20분
    const r = await fetch(`${BASE}/history/${promptId}`);
    const h = await r.json();
    const entry = h[promptId];
    if (entry) {
      const st = entry.status || {};
      if (st.status_str === 'error' || st.completed === false && st.status_str === 'error') {
        throw new Error(`생성 실패: ${JSON.stringify(st.messages || st).slice(0, 600)}`);
      }
      if (entry.outputs && Object.keys(entry.outputs).length) return entry;
    }
    await sleep(2000);
  }
  throw new Error('타임아웃 — 20분 안에 결과가 없다. 서버 로그를 확인해라.');
}

async function download(img, destDir, prefix) {
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
  const r = await fetch(`${BASE}/view?${q}`);
  if (!r.ok) throw new Error(`이미지 받기 실패: ${img.filename} (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  const dest = path.join(destDir, `${prefix}_${img.filename}`);
  fs.writeFileSync(dest, buf);
  return dest;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
try {
  const stats = await fetch(`${BASE}/system_stats`).then((r) => r.json());
  const dev = stats.devices?.[0];
  console.log(`ComfyUI ${stats.system?.comfyui_version} · ${dev?.name} · VRAM 여유 ${Math.round((dev?.vram_free || 0) / 1048576)}MB`);
} catch {
  console.error(`ComfyUI 에 붙지 못했다 (${BASE}). 서버가 떠 있는지 확인해라.`);
  console.error('판정: 생성 실패가 아니라 **측정 불가** 다 — 되돌아갈 곳은 프롬프트가 아니라 환경이다.');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const runLog = { workflow: path.basename(wfPath), host: HOST, style: styleInfo, runs: [] };

for (let i = 0; i < BATCH; i++) {
  const seed = seedFor(i);
  process.stdout.write(`  [${i + 1}/${BATCH}] seed=${seed} 제출... `);
  const id = await submit(seed);
  const entry = await waitFor(id);
  const files = [];
  for (const out of Object.values(entry.outputs)) {
    for (const img of out.images || []) files.push(await download(img, OUT, `s${seed}`));
  }
  console.log(`완료 (${files.length}장)`);
  // 재현에 필요한 것 전부 남긴다 — 시드가 없으면 6개월 뒤 같은 캐릭터를 못 만든다
  runLog.runs.push({ seed, promptId: id, files: files.map((f) => path.basename(f)) });
}

// 배치가 끝나면 모델을 내린다. SDXL 하나가 커밋 10GB 를 잡고 있어서, 생성이 끝난 뒤에도
// 켜두면 다른 작업의 메모리를 잠식한다(실측: 커밋 14.6GB -> 4.4GB). 서버는 살려 두므로
// 다음 배치는 모델 재로딩(약 90초)만 더 든다. 계속 돌릴 거면 --keep-loaded 를 준다.
if (!args.includes('--keep-loaded')) {
  try {
    const r = await fetch(`${BASE}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
    console.log(r.ok ? '모델 언로드 완료 (--keep-loaded 로 유지 가능)' : `모델 언로드 실패: ${r.status}`);
  } catch (e) {
    // 여기서 실패해도 생성 결과는 이미 저장됐다 — 실행을 실패로 만들지 않는다
    console.log(`모델 언로드 실패(무시): ${e.message}`);
  }
}

fs.writeFileSync(path.join(OUT, 'run-log.json'), JSON.stringify(runLog, null, 2));
console.log(`\n${runLog.runs.length}회 · ${OUT}`);
console.log('run-log.json 에 시드·prompt_id·파일명이 있다. manifest 에 옮겨 적어야 재현된다.');
