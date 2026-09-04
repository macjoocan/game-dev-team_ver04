#!/usr/bin/env node
// lora-train.mjs - kohya sd-scripts 로 캐릭터 LoRA 를 학습한다. 8GB VRAM(RTX 5060) 기준 프리셋.
//   node lora-train.mjs <dataset dir> --name <lora이름> [--base sdxl|sd15] [--ckpt <path>]
//                       [--steps 1500] [--dim 16] [--alpha 8] [--lr 1e-4] [--optimizer AdamW8bit|Adafactor|AdamW]
//                       [--sd-scripts <dir>] [--comfy <ComfyUI 루트>] [--out <dir>] [--no-fp8] [--dry-run]
//
// 의존성 없음. 학습기(sd-scripts)와 파이썬 venv 는 별도 설치다 — references/lora-training.md.
// 학습기가 없으면 결과는 "학습 실패"가 아니라 **측정 불가** 다. 되돌아갈 곳은 하이퍼파라미터가 아니라 환경이다.
//
// 하는 일:
//   1) dataset-manifest.json 을 읽어 에폭 수를 계산한다(목표 스텝 / 에폭당 스텝)
//   2) 8GB 프리셋으로 config.toml 을 쓴다 — 왜 그 값인지는 옆에 주석으로 남긴다
//   3) accelerate 로 학습을 띄우고 출력을 화면 + 파일로 동시에 남긴다(OOM 원인 진단용)
//   4) 끝나면 최종 .safetensors 를 ComfyUI models/loras 로 복사하고 train-log.json 을 쓴다
//      — 체크포인트·데이터셋 해시·전체 하이퍼파라미터·소요 시간. 이게 없으면 6개월 뒤 같은 LoRA 를 못 만든다

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const DS = args[0];
if (!DS || DS.startsWith('--') || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node lora-train.mjs <dataset dir> --name <lora이름> [--base sdxl|sd15] [--ckpt path]');
  console.error('       [--steps 1500] [--dim 16] [--alpha 8] [--lr 1e-4] [--optimizer AdamW8bit|Adafactor|AdamW]');
  console.error('       [--sd-scripts dir] [--comfy ComfyUI루트] [--out dir] [--no-fp8] [--dry-run]');
  process.exit(2);
}
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const NAME = opt('--name', null);
const BASE = opt('--base', 'sdxl');
const STEPS = Number(opt('--steps', 1500));
const DIM = Number(opt('--dim', 16));
const ALPHA = Number(opt('--alpha', Math.max(1, DIM / 2)));
const LR = opt('--lr', '1e-4');
const OPTIM = opt('--optimizer', 'AdamW8bit');
const OUT = path.resolve(opt('--out', path.join(DS, 'train')));
const DRY = args.includes('--dry-run');
const NO_FP8 = args.includes('--no-fp8');
if (!NAME) { console.error('--name 이 없다. LoRA 파일명이 된다(예: hero_v1).'); process.exit(2); }
if (!/^[A-Za-z0-9_\-]+$/.test(NAME)) { console.error('--name 은 영문·숫자·_·- 만. 한글 경로는 학습기가 깨진다.'); process.exit(2); }
if (!['sdxl', 'sd15'].includes(BASE)) { console.error('--base 는 sdxl 또는 sd15'); process.exit(2); }

// ── 데이터셋 ─────────────────────────────────────────────────────────────────
const manifestPath = path.join(DS, 'dataset-manifest.json');
const datasetToml = path.resolve(path.join(DS, 'dataset.toml'));
if (!fs.existsSync(manifestPath) || !fs.existsSync(datasetToml)) {
  console.error(`${DS} 에 dataset-manifest.json / dataset.toml 이 없다. lora-dataset.mjs 를 먼저 돌려라.`);
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const stepsPerEpoch = manifest.stepsPerEpoch || (manifest.count * manifest.repeats);
const epochs = Math.max(1, Math.ceil(STEPS / stepsPerEpoch));
if (BASE === 'sd15' && manifest.resolution > 768) console.log(`주의: SD1.5 에 ${manifest.resolution}px 데이터셋. 768 이하로 다시 만드는 게 맞다(--res 768).`);
if (BASE === 'sdxl' && manifest.resolution < 1024) console.log(`주의: SDXL 에 ${manifest.resolution}px 데이터셋. 1024 가 기본이다.`);

// ── 환경 탐지 ─────────────────────────────────────────────────────────────────
const isWin = process.platform === 'win32';
const firstExisting = (cands) => cands.filter(Boolean).find((p) => fs.existsSync(p)) || null;

// 관례적 설치 위치를 추측해 본다. 못 찾으면 --comfy/--sd-scripts 나 환경변수로 받는다.
// 드라이브 문자 후보는 Windows 에서만 의미가 있다(예전엔 그게 전부여서 다른 OS 에선 탐지가 없었다).
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const COMFY = firstExisting([
  opt('--comfy', null), process.env.COMFYUI_DIR,
  ...(isWin
    ? ['D:/ComfyUI/ComfyUI_windows_portable/ComfyUI', 'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI']
    : [path.join(HOME, 'ComfyUI'), '/opt/ComfyUI']),
]);
const SD = firstExisting([
  opt('--sd-scripts', null), process.env.SD_SCRIPTS_DIR,
  ...(isWin ? ['D:/sd-scripts', 'D:/kohya/sd-scripts', 'C:/sd-scripts'] : ['/opt/sd-scripts']),
  path.join(HOME, 'sd-scripts'),
]);
const PY = SD ? firstExisting([
  path.join(SD, isWin ? 'venv/Scripts/python.exe' : 'venv/bin/python'),
  path.join(SD, isWin ? '.venv/Scripts/python.exe' : '.venv/bin/python'),
]) : null;

const defaultCkpt = BASE === 'sdxl' ? 'sd_xl_base_1.0.safetensors' : 'v1-5-pruned-emaonly-fp16.safetensors';
const CKPT = firstExisting([
  opt('--ckpt', null),
  COMFY ? path.join(COMFY, 'models/checkpoints', defaultCkpt) : null,
]);

const missing = [];
if (!SD) missing.push('sd-scripts 디렉터리(--sd-scripts 또는 SD_SCRIPTS_DIR)');
if (SD && !PY) missing.push(`${SD} 안의 venv(venv/Scripts/python.exe)`);
if (!CKPT) missing.push(`베이스 체크포인트(--ckpt, 기본은 ComfyUI models/checkpoints/${defaultCkpt})`);
if (missing.length && !DRY) {
  console.error('학습 환경이 없다:');
  for (const m of missing) console.error(`  - ${m}`);
  console.error('\n판정: 학습 실패가 아니라 **측정 불가** 다. 세팅은 references/lora-training.md 를 따른다.');
  console.error('설정 파일만 먼저 보려면 --dry-run.');
  process.exit(1);
}

// ── config.toml ───────────────────────────────────────────────────────────────
// 값마다 이유를 적는다. 8GB 에서 SDXL LoRA 가 도는 조합은 넓지 않다 — 하나 바꾸면 다른 게 터진다.
const script = BASE === 'sdxl' ? 'sdxl_train_network.py' : 'train_network.py';
const useFp8 = BASE === 'sdxl' && !NO_FP8;
const unetOnly = BASE === 'sdxl';           // SDXL 은 TE 를 같이 돌리면 8GB 에서 안 든다. TE 출력은 캐시한다
const warmup = Math.max(10, Math.round(STEPS * 0.05));
const q = (s) => JSON.stringify(String(s).replace(/\\/g, '/'));

const lines = [
  `# lora-train.mjs 가 만든 파일 (${new Date().toISOString()}). 재현하려면 train-log.json 을 본다.`,
  `pretrained_model_name_or_path = ${q(CKPT || `<${defaultCkpt}>`)}`,
  `output_dir = ${q(OUT)}`,
  `output_name = ${q(NAME)}`,
  `save_model_as = "safetensors"`,
  `save_precision = "fp16"                  # 배포용은 fp16 이면 충분하고 파일이 절반이다`,
  `logging_dir = ${q(path.join(OUT, 'logs'))}`,
  ``,
  `network_module = "networks.lora"`,
  `network_dim = ${DIM}                        # 캐릭터 1종은 8~32 사이. 16 이면 정체성은 잡히고 파일은 ~100MB`,
  `network_alpha = ${ALPHA}                     # dim 의 절반 — 학습률 스케일. alpha=dim 이면 같은 lr 로 두 배 세게 배운다`,
  `network_train_unet_only = ${unetOnly}     # ${unetOnly ? 'SDXL: TE 동결 + TE 출력 캐시 = 8GB 의 핵심' : 'SD1.5: TE 도 함께 — 토큰이 정체성에 붙는 힘이 세진다'}`,
  ...(unetOnly ? [] : [`text_encoder_lr = ${Number(LR) / 2}`]),
  ``,
  `learning_rate = ${LR}`,
  `lr_scheduler = "cosine"`,
  `lr_warmup_steps = ${warmup}                    # 전체의 5% — 초반에 lr 이 바로 꽂히면 첫 에폭에 색이 뒤집힌다`,
  `optimizer_type = ${q(OPTIM)}              # AdamW8bit 는 bitsandbytes 필요. 안 깔리면 Adafactor(메모리 더 적음)`,
  ...(OPTIM === 'Adafactor' ? [`optimizer_args = [ "scale_parameter=False", "relative_step=False", "warmup_init=False" ]`] : []),
  ``,
  `train_batch_size = 1                     # 8GB 에서 SDXL 은 1 이 상한이다`,
  `max_train_epochs = ${epochs}                    # 목표 ${STEPS}스텝 / 에폭당 ${stepsPerEpoch}스텝`,
  `save_every_n_epochs = 1                  # 에폭마다 저장 — 과적합 직전 에폭을 고르는 게 LoRA 튜닝의 대부분이다`,
  `seed = 42`,
  ``,
  `mixed_precision = "bf16"                 # Blackwell 은 bf16 이 된다. fp16 은 NaN 이 난다(loss 가 nan 이면 여기)`,
  `gradient_checkpointing = true            # 없으면 8GB 에서 SDXL 이 안 뜬다. 속도 30% 손해`,
  `sdpa = true                              # xformers 대신 torch 내장 어텐션 — Blackwell 용 xformers 휠이 없다`,
  `cache_latents = true`,
  `cache_latents_to_disk = true             # VAE 를 학습 중 메모리에서 뺀다`,
  ...(unetOnly ? [
    `cache_text_encoder_outputs = true`,
    `cache_text_encoder_outputs_to_disk = true   # TE 두 개를 통째로 뺀다(SDXL 은 TE 가 두 개다). shuffle_caption 은 꺼야 한다`,
  ] : []),
  ...(useFp8 ? [`fp8_base = true                          # 베이스 UNet 을 fp8 로 — SDXL 이 ~6GB 에 든다. 품질 손해는 LoRA 에선 미미`] : []),
  ``,
  `min_snr_gamma = 5                        # 고노이즈 스텝 가중 억제 — 적은 장수에서 수렴이 안정된다`,
  ...(BASE === 'sdxl' ? [`noise_offset = 0.0357`] : []),
  `max_data_loader_n_workers = 0            # Windows 에서 워커 > 0 이면 spawn 오류`,
  `persistent_data_loader_workers = false`,
  `max_token_length = 225`,
  ``,
  `# 캡션 규칙은 dataset.toml 쪽(keep_tokens=1, shuffle 없음) — 토큰이 항상 맨 앞에 온다`,
];
fs.mkdirSync(OUT, { recursive: true });
const configToml = path.join(OUT, 'config.toml');
fs.writeFileSync(configToml, lines.join('\n') + '\n');

const cmd = PY || 'python';
const cmdArgs = [
  '-m', 'accelerate.commands.launch', '--num_cpu_threads_per_process', '2', '--mixed_precision', 'bf16',
  path.join(SD || '<sd-scripts>', script),
  '--config_file', configToml, '--dataset_config', datasetToml,
];

console.log(`LoRA 학습: ${NAME} · base ${BASE} · ${manifest.count}장×${manifest.repeats} · ${epochs}에폭(≈${epochs * stepsPerEpoch}스텝) · dim ${DIM}/α ${ALPHA} · ${OPTIM}${useFp8 ? ' · fp8' : ''}`);
console.log(`  체크포인트: ${CKPT || '(없음)'}`);
console.log(`  학습기    : ${SD || '(없음)'}  python: ${PY || '(없음)'}`);
console.log(`  config    : ${configToml}`);
console.log(`  실행      : ${cmd} ${cmdArgs.join(' ')}`);
if (DRY) {
  console.log('\n--dry-run: 설정만 썼다. 학습은 돌리지 않았다 → 판정은 측정 불가.');
  if (missing.length) { console.log('실제로 돌리려면 다음이 필요하다:'); for (const m of missing) console.log(`  - ${m}`); }
  process.exit(0);
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
// stdout/stderr 를 화면에 흘리면서 파일에도 남긴다. OOM 은 종료 코드만 보면 원인을 모른다.
const logFile = path.join(OUT, 'train.out.log');
const logFd = fs.openSync(logFile, 'w');
let tail = '';
const t0 = Date.now();
const code = await new Promise((resolve) => {
  const child = spawn(cmd, cmdArgs, { cwd: SD, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const pipe = (stream) => stream.on('data', (d) => {
    process.stdout.write(d); fs.writeSync(logFd, d);
    tail = (tail + d.toString()).slice(-20000);
  });
  pipe(child.stdout); pipe(child.stderr);
  child.on('error', (e) => { console.error(`실행 실패: ${e.message}`); resolve(-1); });
  child.on('close', resolve);
});
fs.closeSync(logFd);
const minutes = Math.round((Date.now() - t0) / 60000);

// 체크포인트 식별: 6GB 전체 sha256 은 느리다 — 크기 + 앞 32MB 해시로 남기고 그렇다고 적는다
function ckptId(p) {
  const st = fs.statSync(p);
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(Math.min(32 * 1024 * 1024, st.size));
  fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
  return { path: p, bytes: st.size, sha256_head32MB: crypto.createHash('sha256').update(buf).digest('hex') };
}

const outputs = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.startsWith(NAME) && f.endsWith('.safetensors')) : [];
const finalFile = outputs.includes(`${NAME}.safetensors`) ? path.join(OUT, `${NAME}.safetensors`) : null;

let copiedTo = null;
if (code === 0 && finalFile && COMFY) {
  const lorasDir = path.join(COMFY, 'models/loras');
  fs.mkdirSync(lorasDir, { recursive: true });
  copiedTo = path.join(lorasDir, `${NAME}.safetensors`);
  fs.copyFileSync(finalFile, copiedTo);
}

const trainLog = {
  name: NAME, base: BASE, finishedAt: new Date().toISOString(), minutes, exitCode: code,
  checkpoint: CKPT ? ckptId(CKPT) : null,
  dataset: { dir: path.resolve(DS), manifestSha1: crypto.createHash('sha1').update(fs.readFileSync(manifestPath)).digest('hex'), count: manifest.count, repeats: manifest.repeats, resolution: manifest.resolution, token: manifest.token },
  hyper: { steps: STEPS, epochs, stepsPerEpoch, dim: DIM, alpha: ALPHA, lr: LR, optimizer: OPTIM, fp8: useFp8, unetOnly, mixedPrecision: 'bf16', batch: 1, seed: 42 },
  sdScripts: SD, python: PY, command: [cmd, ...cmdArgs].join(' '),
  outputs: outputs.map((f) => path.join(OUT, f)), final: finalFile, copiedTo, log: logFile,
};
fs.writeFileSync(path.join(OUT, 'train-log.json'), JSON.stringify(trainLog, null, 2));

if (code !== 0) {
  console.error(`\n학습이 코드 ${code} 로 끝났다 (${minutes}분). 로그: ${logFile}`);
  if (/out of memory|CUDA out of memory|OOM/i.test(tail)) {
    console.error('원인: VRAM 부족. 순서대로 하나씩:');
    console.error('  1) --dim 8            (LoRA 자체 메모리 절반)');
    console.error('  2) 데이터셋을 --res 768 로 다시 만든다 (잠재 크기 44%)');
    console.error(useFp8 ? '  3) 이미 fp8 이다. 남은 건 --base sd15' : '  3) --no-fp8 를 뺀다(fp8_base 켜기)');
    console.error('  그리고 ComfyUI 가 모델을 잡고 있으면 먼저 내린다: curl -X POST 127.0.0.1:8188/free -d \'{"unload_models":true,"free_memory":true}\'');
  } else if (/no kernel image/i.test(tail)) {
    console.error('원인: PyTorch 가 Blackwell(sm_120) 커널이 없다. venv 에 cu128 이상 torch 를 다시 깐다 — references/lora-training.md.');
  } else if (/bitsandbytes|No module named 'bnb'/i.test(tail)) {
    console.error('원인: bitsandbytes 가 없다. pip install bitsandbytes 또는 --optimizer Adafactor.');
  } else if (/nan/i.test(tail) && /loss/i.test(tail)) {
    console.error('원인 후보: loss NaN. mixed_precision 이 fp16 으로 바뀌지 않았는지, lr 이 너무 높지 않은지(--lr 5e-5) 본다.');
  }
  process.exit(1);
}

console.log(`\n완료 (${minutes}분) · 에폭 파일 ${outputs.length}개 · ${OUT}`);
if (copiedTo) console.log(`ComfyUI 에 복사: ${copiedTo}`);
else if (!COMFY) console.log('ComfyUI 루트를 못 찾아 복사는 안 했다(--comfy). models/loras 에 직접 넣어라.');
console.log('train-log.json 에 체크포인트·데이터셋 해시·하이퍼파라미터가 있다. asset-pipeline manifest 의 lora 항목에 옮겨 적어야 재현된다.');
console.log(`다음: node lora-eval.mjs --lora ${OUT} --token ${manifest.token}   (에폭×강도 격자로 과적합 시점을 고른다)`);
