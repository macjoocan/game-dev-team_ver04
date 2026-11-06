import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=process.cwd(),dest='out/day-handoff-20261106';
const skipDirs=new Set(['deps','node_modules','target','.git','__pycache__','sources','source','rig-probe','user','output','normalized-probe','archive-rig-v0']);
const reject=/\.(?:safetensors|onnx|bin|exe|dll|pdb|whl|zip|latent|pyc|blend1)$/i;
const allowed=/\.(?:md|json|jsonl|txt|mjs|js|py|ps1|sh|html|css|png|gif|webp|mp4|glb|obj|mtl|raw|log)$/i;
const items=[];
function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name).replaceAll('\\','/');if(e.isSymbolicLink())continue;if(e.isDirectory()){if(!skipDirs.has(e.name))walk(f);continue;}if(!allowed.test(f)||reject.test(f)||/server-process|server\.(stdout|stderr)|node-schemas|ci-initial|brief.*\.json/.test(e.name))continue;add(f);}}
function add(f){if(!fs.existsSync(f))return;const data=fs.readFileSync(f);if(data.length>45*1024*1024)throw Error('Large selected file: '+f);items.push({path:f,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
for(const dir of ['out/2d-gpt-20261106','out/experiments/gpt-walk-20261106','out/experiments/local-motion-20261106','out/experiments/silver-slash-20261106','out/experiments/ludo-research-20261106','out/fx-common-v2','out/fx-common-v2-qa'])walk(dir);
for(const f of ['out/devteam-upgrade/REPORT.md','out/integration-20261106/REPORT.md','out/integration-20261106/test-stage.sh','out/integration-20261106/tests-final.txt','out/integration-20261106/tests-final-result.json','out/day-handoff-20261106/ci.txt','out/day-handoff-20261106/ci-result.json','out/day-handoff-20261106/verify.mjs','out/day-handoff-20261106/select-files.mjs'])add(f);
items.sort((a,b)=>a.path.localeCompare(b.path));
const seen=new Set();for(const f of items){if(seen.has(f.path))throw Error('Duplicate: '+f.path);seen.add(f.path);}
const manifest={createdAt:new Date().toISOString(),policy:'Selected review assets, scripts and reports; excludes installed models, dependency caches, cloned vendor sources, temporary process receipts and latent caches.',fileCount:items.length,totalBytes:items.reduce((s,f)=>s+f.bytes,0),files:items};
fs.writeFileSync(dest+'/publish-files.json',JSON.stringify(manifest,null,2));fs.writeFileSync(dest+'/publish-paths.txt',items.map(f=>f.path).join('\n')+'\n');
const groups={};for(const f of items){const group=f.path.split('/').slice(0,f.path.includes('/experiments/')?3:2).join('/');groups[group]=(groups[group]||0)+f.bytes;}
console.log(JSON.stringify({files:items.length,totalMiB:manifest.totalBytes/1048576,groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,+(v/1048576).toFixed(2)])),largest:items.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,8)},null,2));
