#!/usr/bin/env node
// Import already-rasterized PNG icons with provenance and optional palette tint.
// SVG remains a source file; rasterization happens in an art editor before this step.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readPNG } from '../../../scripts/lib-png-read.mjs';
import { writePNG, hex } from '../../../scripts/lib-png.mjs';
import { loadPalette, resolveTokens } from '../../../scripts/lib-palette.mjs';

const args = process.argv.slice(2);
const specPath = args[0];
const oi = args.indexOf('--out');
if (!specPath || specPath.startsWith('--') || (oi >= 0 && !args[oi + 1])) {
  console.error('usage: node icon-import.mjs <icons.json> [--out dir]');
  process.exit(2);
}

try {
  const absoluteSpec = path.resolve(specPath);
  const specDir = path.dirname(absoluteSpec);
  const raw = JSON.parse(fs.readFileSync(absoluteSpec, 'utf8'));
  if (!Array.isArray(raw.icons) || !raw.icons.length) throw new Error('icons 배열이 비었다');
  const palettePath = raw.palette ? path.resolve(specDir, raw.palette) : path.join(specDir, 'palette.json');
  const palette = loadPalette(palettePath);
  const spec = resolveTokens(raw, palette);
  const outDir = path.resolve(oi >= 0 ? args[oi + 1] : (raw.out || 'icon-out'));
  const prepared = [];
  const ids = new Set();

  // Validate every entry before touching the output directory.
  for (const [index, icon] of spec.icons.entries()) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(icon.id || '') || ids.has(icon.id)) throw new Error(`안정 ID가 없거나 중복됨: ${icon.id}`);
    ids.add(icon.id);
    if (!icon.license || !icon.sourceUrl) throw new Error(`${icon.id}: license 와 sourceUrl 이 필요하다`);
    if (!/^https?:\/\//.test(icon.sourceUrl)) throw new Error(`${icon.id}: sourceUrl 은 웹 원본 주소여야 한다`);
    if (/^CC[- ]?BY/i.test(icon.license) && !icon.author) throw new Error(`${icon.id}: CC BY 저작자 표시가 필요하다`);
    if (icon.tint && (!/^@[a-zA-Z0-9_.-]+$/.test(raw.icons[index].tint || '') || !/^#[0-9a-fA-F]{6}$/.test(icon.tint))) {
      throw new Error(`${icon.id}: tint 는 palette.json 의 @토큰이어야 한다`);
    }
    const source = path.resolve(specDir, icon.source || '');
    const raster = path.resolve(specDir, icon.raster || icon.source || '');
    if (!fs.existsSync(source) || !fs.statSync(source).isFile() || !fs.existsSync(raster) || !fs.statSync(raster).isFile() || path.extname(raster).toLowerCase() !== '.png') {
      throw new Error(`${icon.id}: 원본과 PNG 래스터가 필요하다`);
    }
    const png = readPNG(raster);
    prepared.push({ icon, source, raster, png });
  }

  fs.mkdirSync(path.join(outDir, '_source'), { recursive: true });
  const manifest = { generatedFrom: path.basename(specPath), assets: [] };
  const credits = [];
  for (const { icon, source, raster, png } of prepared) {
    const sourceName = `${icon.id}${path.extname(source).toLowerCase()}`;
    const rawName = `${icon.id}.png`;
    const sourceDest = path.join(outDir, '_source', sourceName);
    const rawDest = path.join(outDir, rawName);
    fs.copyFileSync(source, sourceDest);
    const rasterName = path.resolve(source) === path.resolve(raster) ? sourceName : `${icon.id}.raster.png`;
    if (rasterName !== sourceName) fs.copyFileSync(raster, path.join(outDir, '_source', rasterName));
    if (icon.tint) {
      const color = hex(icon.tint);
      const rgba = Buffer.from(png.data);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = color[0]; rgba[i + 1] = color[1]; rgba[i + 2] = color[2];
      }
      writePNG(rawDest, png.width, png.height, rgba);
    } else fs.copyFileSync(raster, rawDest);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
    const rasterSha256 = crypto.createHash('sha256').update(fs.readFileSync(raster)).digest('hex');
    manifest.assets.push({
      id: icon.id, type: 'icon', status: 'concept', owner: 'artist', source: icon.sourceUrl,
      license: icon.license, author: icon.author || '', sha256, rasterSha256,
      files: { source: `_source/${sourceName}`, raster: `_source/${rasterName}`, raw: rawName, final: '', preview: '' },
      constraints: { size: `${png.width}x${png.height}`, background: 'transparent', format: 'PNG', tint: icon.tint || null },
      notes: '실제 게임 크기·배경·색각이상 검수와 사람 승인 전에는 프로덕션에 반입하지 않는다.',
    });
    credits.push(`${icon.id} | ${icon.author || 'author not required'} | ${icon.license} | ${icon.sourceUrl}`);
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outDir, 'CREDITS.txt'), credits.join('\n') + '\n');
  console.log(`아이콘 ${manifest.assets.length}개를 concept 상태로 반입: ${outDir}`);
} catch (error) {
  console.error(`아이콘 반입 실패: ${error.message}`);
  process.exit(1);
}
