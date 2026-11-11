import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG } from '../../../scripts/lib-png.mjs';
const base = 'out/experiments/silver-gpt-qa-20261111';
const version = process.argv[2] || 'v1';
if (!/^v\d+$/.test(version)) throw Error('Version must be vN');
const source = `${base}/raw/silver-walk-${version}.png`;
const image = readPNG(source), cols = 4, rows = 2;
if (image.width % cols || image.height % rows) throw Error('Grid is not exactly divisible');
const width = image.width / cols, height = image.height / rows;
const dir = `${base}/${version}`, frames = `${dir}/frames`;
fs.mkdirSync(frames, { recursive: true });
const alpha = new Uint32Array(256);
for (let i = 3; i < image.data.length; i += 4) alpha[image.data[i]]++;
for (let k = 0; k < cols * rows; k++) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = (((Math.floor(k / cols) * height + y) * image.width) + (k % cols) * width) * 4;
    image.data.copy(data, y * width * 4, start, start + width * 4);
  }
  writePNG(`${frames}/frame_${String(k).padStart(4, '0')}.png`, width, height, data);
}
const runs = [];
for (const tool of ['sprite-qa', 'motion-qa']) {
  const args = [`skills/sprite-pipeline/scripts/${tool}.mjs`, frames, '--out', `${dir}/qa`, ...(tool === 'motion-qa' ? ['--gait', 'walk'] : [])];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  fs.writeFileSync(`${dir}/${tool}.stdout.log`, result.stdout || '');
  fs.writeFileSync(`${dir}/${tool}.stderr.log`, result.stderr || '');
  runs.push({ tool, args, exitCode: result.status, error: result.error?.message });
}
const summary = { source, sourceSha256: createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
  width: image.width, height: image.height, grid: [cols, rows], frameSize: [width, height],
  sourceAlphaHistogram: Object.fromEntries(Array.from(alpha.entries()).filter(([, n]) => n)),
  pixelChanges: 'Exact RGBA grid extraction only; no crop-to-content, rescale, padding, alpha cleanup or color correction',
  status: 'review', generator: 'built-in image_gen', runs };
fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
