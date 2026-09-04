#!/usr/bin/env node
// lora-eval.mjs - 학습된 LoRA 를 에폭 × 강도 × 프롬프트 격자로 뽑아 한 장(contact sheet)에 모은다.
//   node lora-eval.mjs --lora <file.safetensors | 에폭 파일들이 있는 폴더> --token <트리거>
//                      [--workflow <lora 워크플로.api.json>] [--strengths 0,0.6,0.8,1] [--seeds 1000,1001]
//                      [--prompts prompts.txt] [--out eval] [--host 127.0.0.1:8188] [--cell 256]
//
// 왜 필요한가: LoRA 는 "학습이 끝났다"가 아니라 **어느 에폭·어느 강도가 맞는지 고르는 것**이 결과다.
// 과적합 신호는 정량으로 못 잡는다(포즈가 굳는다·배경이 학습 배경으로 돈다·프롬프트가 안 먹는다).
// 그래서 사람이 한눈에 비교할 격자를 기계가 만든다. 사람 판단은 이 한 장에서만 한다.
//
// 생성은 comfy-run.mjs 를 그대로 재사용한다(시드 기록·측정 불가 판정 동일). 의존성 없음.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node lora-eval.mjs --lora <file|dir> --token <트리거> [--workflow wf.api.json]');
  console.error('       [--strengths 0,0.6,0.8,1] [--seeds 1000,1001] [--prompts prompts.txt] [--out eval] [--cell 256]');
  process.exit(2);
}
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const LORA = opt('--lora', null);
const TOKEN = opt('--token', 'gdt_char');
const WF = opt('--workflow', path.join(here, '../references/workflows/sdxl-character-lora.api.json'));
const STRENGTHS = opt('--strengths', '0,0.6,0.8,1').split(',').map(Number);
const SEEDS = opt('--seeds', '1000,1001').split(',').map(Number);
const OUT = opt('--out', 'lora-eval');
const HOST = opt('--host', '127.0.0.1:8188');
const CELL = Number(opt('--cell', 256));
if (!LORA) { console.error('--lora 가 없다.'); process.exit(2); }

// 기본 프롬프트 4종: 정체성 유지가 깨지기 쉬운 축(앵글·포즈·표정)을 하나씩 바꾼다.
// 학습 데이터에 없던 조합이어야 의미가 있다 — 있던 포즈만 다시 뽑으면 과적합을 못 본다.
const DEFAULT_PROMPTS = [
  'front view, standing neutral pose, neutral expression',
  'side view, walking, looking ahead',
  'jumping with both arms up, big happy smile',
  'sitting on the ground, three-quarter view, sleepy expression',
];
const PROMPTS = opt('--prompts', null)
  ? fs.readFileSync(opt('--prompts'), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  : DEFAULT_PROMPTS;

// LoRA 파일 목록: 폴더면 에폭 파일 전부(이름순 = 에폭순), 파일이면 그 하나
const loraFiles = fs.statSync(LORA).isDirectory()
  ? fs.readdirSync(LORA).filter((f) => f.endsWith('.safetensors')).sort().map((f) => path.join(LORA, f))
  : [LORA];
if (!loraFiles.length) { console.error(`${LORA} 에 .safetensors 가 없다.`); process.exit(2); }

// ComfyUI 는 models/loras 안의 파일명으로만 LoRA 를 찾는다. 밖에 있으면 복사해 넣는다.
const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));
const loraNode = Object.entries(wf).find(([, n]) => n.class_type === 'LoraLoader');
if (!loraNode) { console.error(`${WF} 에 LoraLoader 노드가 없다. sdxl-character-lora.api.json 을 쓰거나 노드를 추가해라.`); process.exit(2); }
const posNodeId = (() => {
  const ks = Object.entries(wf).find(([, n]) => /KSampler/.test(n.class_type));
  return ks?.[1].inputs.positive?.[0];
})();
if (!posNodeId) { console.error('워크플로에서 positive 프롬프트 노드를 못 찾았다.'); process.exit(2); }
const basePrompt = String(wf[posNodeId].inputs.text || '').replace(/^gdt_char,\s*/, '');

// lora-train.mjs 와 같은 탐색 규칙. 드라이브 문자 후보는 Windows 에서만 본다.
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const COMFY = [
  process.env.COMFYUI_DIR,
  ...(process.platform === 'win32'
    ? ['D:/ComfyUI/ComfyUI_windows_portable/ComfyUI', 'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI']
    : [path.join(HOME, 'ComfyUI'), '/opt/ComfyUI']),
].filter(Boolean).find((p) => fs.existsSync(p));
const lorasDir = COMFY ? path.join(COMFY, 'models/loras') : null;
function ensureInComfy(file) {
  const name = path.basename(file);
  if (!lorasDir) { console.log(`ComfyUI 루트를 모른다(COMFYUI_DIR). ${name} 이 models/loras 에 이미 있다고 가정한다.`); return name; }
  const dest = path.join(lorasDir, name);
  if (!fs.existsSync(dest)) { fs.copyFileSync(file, dest); console.log(`  models/loras 로 복사: ${name}`); }
  return name;
}

// 서버 확인 — 없으면 측정 불가로 끝낸다(comfy-run 과 같은 판정)
try { await fetch(`http://${HOST}/system_stats`).then((r) => r.json()); }
catch { console.error(`ComfyUI 에 붙지 못했다 (${HOST}). 판정: **측정 불가**.`); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
const comfyRun = path.join(here, 'comfy-run.mjs');
const cells = [];   // { row, col, file, lora, strength, prompt, seed }
const rows = [];    // 행 = lora × strength
for (const lf of loraFiles) {
  const loraName = ensureInComfy(lf);
  for (const s of STRENGTHS) {
    // 강도 0 은 베이스라인이다. 첫 LoRA 파일에서만 한 번 뽑는다(어차피 LoRA 가 안 먹는다)
    if (s === 0 && lf !== loraFiles[0]) continue;
    rows.push({ lora: s === 0 ? '(base)' : path.basename(lf, '.safetensors'), strength: s });
    const row = rows.length - 1;
    let col = 0;
    for (const p of PROMPTS) for (const seed of SEEDS) {
      const cellDir = path.join(OUT, 'cells', `r${row}_c${col}`);
      const text = `${TOKEN}, ${p}, ${basePrompt}`;
      const r = spawnSync(process.execPath, [
        comfyRun, WF, '--host', HOST, '--out', cellDir, '--seed', String(seed), '--batch', '1', '--keep-loaded',
        '--set', `${loraNode[0]}.lora_name=${loraName}`,
        '--set', `${loraNode[0]}.strength_model=${s}`,
        '--set', `${loraNode[0]}.strength_clip=${s}`,
        '--set', `${posNodeId}.text=${text}`,
      ], { encoding: 'utf8' });
      if (r.status !== 0) { console.error(r.stdout, r.stderr); console.error(`셀 r${row}c${col} 생성 실패 — 중단.`); process.exit(1); }
      const img = fs.readdirSync(cellDir).find((f) => f.endsWith('.png'));
      cells.push({ row, col, file: path.join(cellDir, img), lora: rows[row].lora, strength: s, prompt: p, seed });
      process.stdout.write(`  [${rows[row].lora} @${s}] ${p.split(',')[0]} seed ${seed} ✓\n`);
      col++;
    }
  }
}

// 다 끝났으니 모델을 내린다(comfy-run 은 --keep-loaded 로 돌렸다)
try { await fetch(`http://${HOST}/free`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }); } catch { /* 결과는 이미 저장됐다 */ }

// ── contact sheet ─────────────────────────────────────────────────────────────
// 셀 크기 통일(면적 평균 축소) 후 격자로 붙인다. 행 = LoRA×강도, 열 = 프롬프트×시드.
function shrink(img, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = Math.floor(y * sy); yy < Math.min(img.height, Math.ceil((y + 1) * sy)); yy++)
      for (let xx = Math.floor(x * sx); xx < Math.min(img.width, Math.ceil((x + 1) * sx)); xx++) {
        const i = (yy * img.width + xx) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
      }
    const o = (y * w + x) * 4;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return out;
}
const first = readPNG(cells[0].file);
const cw = CELL, ch = Math.round(CELL * first.height / first.width);
const GAP = 4, nCols = PROMPTS.length * SEEDS.length, nRows = rows.length;
const W = nCols * (cw + GAP) + GAP, H = nRows * (ch + GAP) + GAP;
const sheet = Buffer.alloc(W * H * 4);
for (let i = 0; i < sheet.length; i += 4) { sheet[i] = 40; sheet[i + 1] = 40; sheet[i + 2] = 44; sheet[i + 3] = 255; }
for (const c of cells) {
  const img = readPNG(c.file);
  const px = shrink(img, cw, ch);
  const ox = GAP + c.col * (cw + GAP), oy = GAP + c.row * (ch + GAP);
  for (let y = 0; y < ch; y++) px.copy(sheet, ((oy + y) * W + ox) * 4, y * cw * 4, (y + 1) * cw * 4);
}
const sheetPath = path.join(OUT, 'eval-sheet.png');
writePNG(sheetPath, W, H, sheet);

const log = {
  createdAt: new Date().toISOString(), workflow: path.basename(WF), token: TOKEN, host: HOST,
  rows: rows.map((r, i) => ({ row: i, ...r })),
  cols: PROMPTS.flatMap((p) => SEEDS.map((seed) => ({ prompt: p, seed }))).map((c, i) => ({ col: i, ...c })),
  cells: cells.map((c) => ({ ...c, file: path.relative(OUT, c.file).replace(/\\/g, '/') })),
  sheet: 'eval-sheet.png',
};
fs.writeFileSync(path.join(OUT, 'eval-log.json'), JSON.stringify(log, null, 2));

console.log(`\n격자 ${nRows}행(LoRA×강도) × ${nCols}열(프롬프트×시드) → ${sheetPath}`);
console.log('행 순서:'); rows.forEach((r, i) => console.log(`  r${i}: ${r.lora} @ ${r.strength}`));
console.log('\n보는 법 — 위 행(base)과 비교해서:');
console.log('  · 정체성이 붙는 가장 낮은 강도/이른 에폭을 고른다 (보통 0.6~0.8, 마지막 에폭이 아닐 때가 많다)');
console.log('  · 과적합 신호: 프롬프트를 바꿔도 포즈가 안 바뀜 · 배경이 학습 배경색으로 돔 · 화풍이 학습 이미지에 고정');
console.log('  · 고른 (파일, 강도)를 asset-pipeline manifest 의 lora 항목에 적는다 — 이게 이 캐릭터의 정체성 정의다');
