#!/usr/bin/env node
// Check a ComfyUI API graph against the running server before submitting GPU work.
// Optional model manifest pins local files by path, byte size and SHA-256.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function checkWorkflow(workflow, objectInfo) {
  const errors = [];
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return ['API Format 워크플로 객체가 아니다'];
  for (const [id, node] of Object.entries(workflow)) {
    if (!node?.class_type || !node.inputs || typeof node.inputs !== 'object') {
      errors.push(`${id}: class_type 또는 inputs 가 없다 (API Format 확인)`);
      continue;
    }
    const schema = objectInfo[node.class_type];
    if (!schema) { errors.push(`${id}: 서버에 ${node.class_type} 노드가 없다`); continue; }
    const declared = { ...schema.input?.required, ...schema.input?.optional };
    for (const [key, value] of Object.entries(node.inputs)) {
      const choices = declared[key]?.[0];
      if (Array.isArray(choices) && typeof value === 'string' && !choices.includes(value)) {
        errors.push(`${id}.${key}: '${value}' 선택지를 서버가 제공하지 않는다 (${node.class_type})`);
      }
    }
  }
  return errors;
}

export function verifyModelManifest(manifest, modelRoot) {
  if (!Array.isArray(manifest?.models) || !manifest.models.length) throw new Error('manifest.models 가 비었다');
  if (!modelRoot) throw new Error('모델 검증에는 --model-root 가 필요하다');
  const root = path.resolve(modelRoot);
  const records = [];
  for (const item of manifest.models) {
    const rel = item.path;
    if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) throw new Error('각 모델에 상대 path 가 필요하다');
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) throw new Error(`모델 경로가 루트를 벗어난다: ${rel}`);
    if (item.name && path.basename(file) !== item.name) throw new Error(`모델 이름과 경로가 다르다: ${item.name}`);
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 1 || !/^[a-f0-9]{64}$/i.test(item.sha256 || '')) {
      throw new Error(`bytes/SHA-256 가 빠졌다: ${rel}`);
    }
    const stat = fs.statSync(file);
    if (stat.size !== item.bytes) throw new Error(`${rel}: 크기 불일치 (${stat.size} != ${item.bytes})`);
    const digest = crypto.createHash('sha256');
    const handle = fs.openSync(file, 'r');
    try {
      const chunk = Buffer.allocUnsafe(1024 * 1024);
      let length;
      while ((length = fs.readSync(handle, chunk, 0, chunk.length, null)) > 0) {
        digest.update(chunk.subarray(0, length));
      }
    } finally {
      fs.closeSync(handle);
    }
    const hash = digest.digest('hex');
    if (hash.toLowerCase() !== item.sha256.toLowerCase()) throw new Error(`${rel}: SHA-256 불일치`);
    records.push({ path: rel, bytes: stat.size, sha256: hash });
  }
  return records;
}

export async function preflight(workflow, { base, manifestPath = null, modelRoot = null }) {
  const response = await fetch(`${base}/object_info`);
  if (!response.ok) throw new Error(`/object_info 응답 ${response.status}`);
  const errors = checkWorkflow(workflow, await response.json());
  if (errors.length) return { ok: false, errors, models: [] };
  let models = [];
  if (manifestPath) {
    try { models = verifyModelManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), modelRoot); }
    catch (error) { return { ok: false, errors: [error.message], models: [] }; }
  }
  return { ok: true, errors: [], models };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const workflowPath = args[0];
  const opt = (name, fallback = null) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  if (!workflowPath || args.includes('--help') || !opt('--host', '127.0.0.1:8188')) {
    console.error('usage: node comfy-preflight.mjs <workflow.api.json> [--host 127.0.0.1:8188] [--model-manifest models.json --model-root <ComfyUI-root>]');
    process.exit(2);
  }
  const manifestPath = opt('--model-manifest');
  const modelRoot = opt('--model-root');
  if (Boolean(manifestPath) !== Boolean(modelRoot)) { console.error('--model-manifest 와 --model-root 를 함께 줘야 한다'); process.exit(2); }
  try {
    const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const result = await preflight(workflow, { base: `http://${opt('--host', '127.0.0.1:8188')}`, manifestPath, modelRoot });
    if (!result.ok) { for (const e of result.errors) console.error(e); process.exit(1); }
    console.log(`ComfyUI 사전 검사 충족 · 모델 해시 ${result.models.length}개 검증`);
    if (!manifestPath) console.log('공백: 모델 파일 해시는 검사하지 않았다 (--model-manifest 미설정)');
  } catch (error) {
    console.error(`측정 불가: ${error.message}`);
    process.exit(3);
  }
}
