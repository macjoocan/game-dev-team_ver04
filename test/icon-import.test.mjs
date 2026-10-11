import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writePNG } from '../scripts/lib-png.mjs';
import { readPNG } from '../scripts/lib-png-read.mjs';

const script = fileURLToPath(new URL('../skills/ui-art-system/scripts/icon-import.mjs', import.meta.url));

test('imports a rasterized icon with source, tint, credit, and concept manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-icons-'));
  try {
    fs.writeFileSync(path.join(root, 'bolt.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writePNG(path.join(root, 'bolt.png'), 2, 1, Buffer.from([12, 34, 56, 255, 20, 30, 40, 0]));
    fs.writeFileSync(path.join(root, 'palette.json'), JSON.stringify({ accent: { main: '#12AB34' } }));
    const spec = { palette: 'palette.json', icons: [{ id: 'bolt', source: 'bolt.svg', raster: 'bolt.png',
      sourceUrl: 'https://example.org/bolt', license: 'CC BY 4.0', author: 'Example Artist', tint: '@accent.main' }] };
    fs.writeFileSync(path.join(root, 'icons.json'), JSON.stringify(spec));
    const result = spawnSync(process.execPath, [script, path.join(root, 'icons.json'), '--out', path.join(root, 'out')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'out', 'manifest.json'), 'utf8'));
    assert.equal(manifest.assets[0].status, 'concept');
    assert.equal(manifest.assets[0].files.raster, '_source/bolt.raster.png');
    assert.equal(fs.readFileSync(path.join(root, 'out', '_source', 'bolt.svg'), 'utf8'), fs.readFileSync(path.join(root, 'bolt.svg'), 'utf8'));
    assert.deepEqual([...readPNG(path.join(root, 'out', 'bolt.png')).data], [18, 171, 52, 255, 18, 171, 52, 0]);
    assert.match(fs.readFileSync(path.join(root, 'out', 'CREDITS.txt'), 'utf8'), /Example Artist \| CC BY 4\.0/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rejects CC BY icon without author before creating output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-icons-'));
  try {
    writePNG(path.join(root, 'bolt.png'), 1, 1, Buffer.from([1, 2, 3, 255]));
    fs.writeFileSync(path.join(root, 'icons.json'), JSON.stringify({ icons: [{ id: 'bolt', source: 'bolt.png',
      sourceUrl: 'https://example.org/bolt', license: 'CC BY 4.0' }] }));
    const result = spawnSync(process.execPath, [script, path.join(root, 'icons.json'), '--out', path.join(root, 'out')], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(path.join(root, 'out')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
