import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { checkWorkflow, verifyModelManifest, preflight } from '../skills/char-art-system/scripts/comfy-preflight.mjs';

const workflow = {
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'hero.safetensors' } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'hero', clip: ['4', 1] } },
};
const objectInfo = {
  CheckpointLoaderSimple: { input: { required: { ckpt_name: [['hero.safetensors'], {}] } } },
  CLIPTextEncode: { input: { required: { text: ['STRING', {}], clip: ['CLIP', {}] } } },
};

test('server node and loader choices are checked before generation', () => {
  assert.deepEqual(checkWorkflow(workflow, objectInfo), []);
  assert.match(checkWorkflow(workflow, { CLIPTextEncode: objectInfo.CLIPTextEncode })[0], /CheckpointLoaderSimple/);
  const wrong = structuredClone(workflow);
  wrong['4'].inputs.ckpt_name = 'missing.safetensors';
  assert.match(checkWorkflow(wrong, objectInfo)[0], /missing.safetensors/);
});

test('manifest checks bytes, hash, and path containment', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-comfy-'));
  try {
    fs.mkdirSync(path.join(root, 'models'));
    fs.writeFileSync(path.join(root, 'models', 'hero.safetensors'), 'model');
    const sha256 = crypto.createHash('sha256').update('model').digest('hex');
    const item = { name: 'hero.safetensors', path: 'models/hero.safetensors', bytes: 5, sha256 };
    assert.equal(verifyModelManifest({ models: [item] }, root)[0].sha256, sha256);
    assert.throws(() => verifyModelManifest({ models: [{ ...item, sha256: '0'.repeat(64) }] }, root), /SHA-256/);
    assert.throws(() => verifyModelManifest({ models: [{ ...item, path: '../hero.safetensors' }] }, root), /벗어난다/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('preflight queries live object_info and rejects unavailable models', async () => {
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(objectInfo)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await preflight(workflow, { base })).ok, true);
    const bad = structuredClone(workflow);
    bad['4'].inputs.ckpt_name = 'gone.safetensors';
    const result = await preflight(bad, { base });
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /gone.safetensors/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
