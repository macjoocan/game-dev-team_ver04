#!/usr/bin/env node
// lora-dataset.mjs - 채택된 캐릭터 시안을 kohya sd-scripts 가 먹는 LoRA 학습 데이터셋으로 만든다.
//   node lora-dataset.mjs <입력폴더|png...> --out <dataset dir> --token <트리거 토큰>
//                         [--class character] [--repeats auto|N] [--res 1024|768] [--bg ffffff]
//                         [--tags "a, b"] [--captions captions.json] [--min 10] [--max 20]
//
// 의존성 없음(lib-png 재사용). 하는 일:
//   1) 알파를 단색 배경에 합성한다 — 투명 PNG 로 학습하면 외곽에 검은 테두리가 붙는다(알파 무시 + 검은 premultiply)
//   2) 긴 변이 --res 를 넘으면 면적 평균으로 줄인다 — 최근접 축소는 선을 끊는다(sprite-normalize 와 같은 이유)
//   3) 픽셀 해시로 중복을 걸러낸다 — 같은 장이 2번 들어가면 그 장만 과적합된다
//   4) 캡션(.txt)을 만든다: "<token>, <class>, <이 장에서만 다른 것>"
//   5) dataset.toml + dataset-manifest.json 을 쓴다 — 학습 재현의 출발점
//
// 캡션 규칙(중요): 캡션에는 **이 장에서 변하는 것**(포즈·앵글·표정)만 쓴다. 캐릭터의 정체성(머리색·옷)은
// 쓰지 않는다 — 쓰면 그 특징이 토큰이 아니라 캡션 단어에 학습돼서, 나중에 토큰만 넣으면 안 나온다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node lora-dataset.mjs <입력폴더|png...> --out <dir> --token <트리거>');
  console.error('       [--class character] [--repeats auto|N] [--res 1024|768] [--bg ffffff]');
  console.error('       [--tags "a, b"] [--captions captions.json] [--min 10] [--max 20]');
  console.error('  captions.json: { "<파일명>.png": "front view, standing, neutral face", ... }');
  process.exit(2);
}
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('--out', 'lora-dataset');
const TOKEN = opt('--token', null);
const CLASS = opt('--class', 'character');
const REPEATS = opt('--repeats', 'auto');
const RES = Number(opt('--res', 1024));
const BG = opt('--bg', 'ffffff');
const TAGS = opt('--tags', '');
const CAPTIONS = opt('--captions', null);
const MIN = Number(opt('--min', 10));
const MAX = Number(opt('--max', 20));

if (!TOKEN) { console.error('--token 이 없다. 트리거 토큰은 사전에 없는 단어여야 한다(예: gdt_char, zxq_hero).'); process.exit(2); }
if (!/^[a-z][a-z0-9_]{2,}$/.test(TOKEN)) {
  console.error(`토큰 "${TOKEN}" 은 위험하다. 소문자·숫자·밑줄만, 3자 이상, 그리고 **사전에 있는 단어는 피한다** ("hero" 는 기존 개념과 섞인다).`);
  process.exit(2);
}
if (![512, 640, 768, 832, 896, 1024, 1152, 1216, 1280].includes(RES)) console.log(`주의: --res ${RES} 는 흔한 값이 아니다. SDXL 1024 · SD1.5 768(또는 512)`);

// 입력 수집: 폴더면 안의 png, 아니면 나열된 파일
const positional = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
const inputs = [];
for (const p of positional) {
  if (!fs.existsSync(p)) { console.error(`없다: ${p}`); process.exit(2); }
  if (fs.statSync(p).isDirectory()) {
    for (const f of fs.readdirSync(p).sort()) if (/\.png$/i.test(f)) inputs.push(path.join(p, f));
  } else if (/\.png$/i.test(p)) inputs.push(p);
  else console.log(`건너뜀(PNG 만 받는다 — JPG 는 알파가 없어 합성 단계가 무의미하고 압축 노이즈가 학습된다): ${p}`);
}
if (!inputs.length) { console.error('입력 PNG 가 없다.'); process.exit(2); }

const captionMap = CAPTIONS ? JSON.parse(fs.readFileSync(CAPTIONS, 'utf8')) : {};
const bg = [parseInt(BG.slice(0, 2), 16), parseInt(BG.slice(2, 4), 16), parseInt(BG.slice(4, 6), 16)];

// 알파 합성 + 면적 평균 축소를 한 번에 한다.
function flattenAndResize(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const dw = Math.max(1, Math.round(img.width * scale)), dh = Math.max(1, Math.round(img.height * scale));
  const out = Buffer.alloc(dw * dh * 4);
  const sx = img.width / dw, sy = img.height / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = y * sy, y1 = Math.min(img.height, y0 + sy);
    for (let x = 0; x < dw; x++) {
      const x0 = x * sx, x1 = Math.min(img.width, x0 + sx);
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = Math.floor(y0); yy < Math.max(Math.floor(y0) + 1, Math.ceil(y1)); yy++) {
        for (let xx = Math.floor(x0); xx < Math.max(Math.floor(x0) + 1, Math.ceil(x1)); xx++) {
          if (xx >= img.width || yy >= img.height) continue;
          const i = (yy * img.width + xx) * 4, a = img.data[i + 3] / 255;
          // 여기서 알파를 배경색에 합성한다. 학습기는 알파를 버리므로 우리가 먼저 정해줘야 한다.
          r += img.data[i] * a + bg[0] * (1 - a);
          g += img.data[i + 1] * a + bg[1] * (1 - a);
          b += img.data[i + 2] * a + bg[2] * (1 - a);
          n++;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255;
    }
  }
  return { width: dw, height: dh, data: out };
}

// ── 1차: 읽고 검사 ────────────────────────────────────────────────────────────
const warnings = [];
const items = [];
const seen = new Map();
for (const f of inputs) {
  let img;
  try { img = readPNG(f); } catch (e) { warnings.push(`${path.basename(f)}: 읽기 실패(${e.message}) — 제외`); continue; }
  const sha1 = crypto.createHash('sha1').update(img.data).digest('hex');
  const hasCaption = !!(captionMap[path.basename(f)] || captionMap[path.basename(f).replace(/\.png$/i, '')]);
  if (seen.has(sha1)) {
    // 중복이면 캡션이 있는 쪽을 남긴다 — 이름순으로 먼저 온 쪽이 캡션 없는 복사본일 수 있다
    const prev = seen.get(sha1);
    if (hasCaption && !prev.hasCaption) {
      warnings.push(`${prev.name}: ${path.basename(f)} 와 픽셀이 같다 — 캡션 없는 쪽(${prev.name}) 제외`);
      items.splice(items.findIndex((it) => it.f === prev.f), 1);
      seen.set(sha1, { name: path.basename(f), f, hasCaption });
    } else {
      warnings.push(`${path.basename(f)}: ${prev.name} 와 픽셀이 같다 — 중복 제외(같은 장이 2번 들어가면 그 장만 과적합된다)`);
      continue;
    }
  } else seen.set(sha1, { name: path.basename(f), f, hasCaption });
  const longSide = Math.max(img.width, img.height);
  if (longSide < RES * 0.6) warnings.push(`${path.basename(f)}: ${img.width}x${img.height} — 학습 해상도(${RES})의 60% 미만. 업스케일돼서 흐린 특징이 학습된다`);
  // 알파가 있는데 거의 전부 투명이면 컷아웃이 실패한 파일이다
  let opaque = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 16) opaque++;
  const cover = opaque / (img.width * img.height);
  if (cover < 0.05) warnings.push(`${path.basename(f)}: 불투명 픽셀이 ${(cover * 100).toFixed(1)}% — 거의 빈 장. 컷아웃 결과를 확인해라`);
  items.push({ f, img, sha1, cover });
}

if (items.length < MIN) warnings.push(`장수 ${items.length} < ${MIN} — 정체성이 안 잡히거나 포즈가 굳는다. 시안을 더 뽑아라(다른 포즈·앵글로)`);
if (items.length > MAX) warnings.push(`장수 ${items.length} > ${MAX} — 캐릭터 LoRA 는 20장 넘게 넣어도 좋아지지 않고 학습만 길어진다. 겹치는 포즈를 빼라`);

// repeats: 한 에폭에 이미지×repeats 가 대략 150 스텝이 되게 맞춘다(배치 1 기준).
// 에폭 단위로 저장하므로 에폭이 너무 짧으면 저장 파일만 늘고, 너무 길면 과적합 시점을 놓친다.
const repeats = REPEATS === 'auto' ? Math.min(20, Math.max(1, Math.round(150 / Math.max(1, items.length)))) : Number(REPEATS);

// ── 2차: 쓰기 ────────────────────────────────────────────────────────────────
const subsetDir = path.join(OUT, 'img', `${repeats}_${TOKEN} ${CLASS}`);
fs.mkdirSync(subsetDir, { recursive: true });
const manifestImages = [];
const noCaption = [];
for (const it of items) {
  const flat = flattenAndResize(it.img, RES);
  const base = path.basename(it.f).replace(/\.png$/i, '');
  const dest = path.join(subsetDir, `${base}.png`);
  writePNG(dest, flat.width, flat.height, flat.data);
  const perImage = captionMap[path.basename(it.f)] || captionMap[base] || '';
  const caption = [TOKEN, CLASS, perImage, TAGS].filter((s) => s && s.trim()).join(', ');
  fs.writeFileSync(path.join(subsetDir, `${base}.txt`), caption + '\n');
  if (!perImage) noCaption.push(base);
  manifestImages.push({ file: path.relative(OUT, dest).replace(/\\/g, '/'), src: path.resolve(it.f), width: flat.width, height: flat.height, sha1: it.sha1, caption });
}

if (noCaption.length) warnings.push(`장별 캡션 없음 ${noCaption.length}장(${noCaption.slice(0, 4).join(', ')}${noCaption.length > 4 ? ' …' : ''}) — 포즈/앵글/표정을 captions.json 에 적어주면 토큰이 정체성만 배운다`);

const absImg = path.resolve(subsetDir).replace(/\\/g, '/');
const toml = `# lora-dataset.mjs 가 만든 파일. 손으로 고치면 dataset-manifest.json 과 어긋난다.
[general]
shuffle_caption = false
caption_extension = ".txt"
keep_tokens = 1

[[datasets]]
resolution = ${RES}
batch_size = 1
enable_bucket = true
min_bucket_reso = ${Math.max(256, Math.round(RES * 0.5 / 64) * 64)}
max_bucket_reso = ${Math.round(RES * 1.5 / 64) * 64}
bucket_reso_steps = 64
bucket_no_upscale = true

  [[datasets.subsets]]
  image_dir = "${absImg}"
  num_repeats = ${repeats}
  class_tokens = "${TOKEN} ${CLASS}"
`;
fs.writeFileSync(path.join(OUT, 'dataset.toml'), toml);

const manifest = {
  createdAt: new Date().toISOString(),
  token: TOKEN, class: CLASS, repeats, resolution: RES, background: `#${BG}`,
  count: manifestImages.length, stepsPerEpoch: manifestImages.length * repeats,
  images: manifestImages, warnings,
};
fs.writeFileSync(path.join(OUT, 'dataset-manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`데이터셋: ${manifestImages.length}장 · repeats ${repeats} · 에폭당 ${manifest.stepsPerEpoch}스텝 · ${RES}px · 배경 #${BG}`);
console.log(`  ${subsetDir}`);
console.log(`  ${path.join(OUT, 'dataset.toml')} / dataset-manifest.json`);
if (warnings.length) {
  console.log(`\n경고 ${warnings.length}건:`);
  for (const w of warnings) console.log(`  - ${w}`);
}
console.log('\n다음: node lora-train.mjs ' + OUT + ' --name <lora이름> --base sdxl');
