import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root='out/experiments/silver-reference-slash-20261111';
const base='out/day-handoff-20261111-slash';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const selected=[];
const excluded=new Set([`${root}/references`,`${root}/brief.json`,`${root}/record-historical.mjs`]);
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=`${dir}/${e.name}`;if(excluded.has(f))continue;if(e.isSymbolicLink())throw Error(`Unexpected link: ${f}`);if(e.isDirectory())walk(f);else if(e.isFile())selected.push(f)}}
walk(root);
selected.push('.gitattributes','docs/art/2d-sprite-current-memory.md','docs/handoffs/2026-11-11.md','docs/handoffs/2026-11-11-slash.md','skill-observations/log.md','.review-loop/items.json');
for(const name of ['anatomy','arc','pose','timing'])selected.push(`.review-loop/feedback/chr.silver.reference-slash-20261111.${name}.json`);
for(const name of ['REPORT.md','findings.json','scan.py','focus.py'])selected.push(`out/resource-reference-20261111/${name}`);
const frameChecks=[];
for(const version of ['v4','v5','v6']){const m=JSON.parse(fs.readFileSync(`${root}/${version}/manifest.json`));if(hash(m.source)!==m.sourceSha256)throw Error(`Source hash mismatch: ${version}`);for(const f of m.frames){const actual=hash(f.file);if(actual!==f.sha256)throw Error(`Frame hash mismatch: ${f.file}`);frameChecks.push({file:f.file,sha256:actual})}}
const same=[];for(let i=0;i<8;i++){const n=`frame_${String(i).padStart(4,'0')}.png`;same.push(hash(`${root}/v5/frames/${n}`)===hash(`${root}/v6/frames/${n}`))}if(same.filter(Boolean).length!==7||same[5])throw Error('Repair changed the wrong frames');
const chosen=new Set(selected),dependencies=[];
for(const name of ['review.html','motion-review.html','arc-review.html','historical-review.html','armfix-review.html']){
 const html=fs.readFileSync(`${root}/${name}`,'utf8');
 for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){const rel=m[1];if(/^(?:https?:|#|data:)/.test(rel))continue;const f=`${root}/${rel}`;if(!chosen.has(f))throw Error(`Missing HTML dependency: ${name} -> ${rel}`);dependencies.push(f)}
}
for(const name of ['motion-feel.json','arc-feel.json','historical-feel.json','armfix-feel.json']){const feel=JSON.parse(fs.readFileSync(`${root}/${name}`));for(const clip of feel.clips){if(clip.durations.reduce((a,b)=>a+b,0)!==460)throw Error(`Timing mismatch: ${name}`);for(const f of clip.files){if(!chosen.has(`${root}/${f}`))throw Error(`Missing frame: ${f}`);dependencies.push(`${root}/${f}`)}}}
const result=spawnSync(process.execPath,['scripts/validate-plugin.mjs'],{encoding:'utf8'});
fs.writeFileSync(`${base}/plugin.stdout.log`,result.stdout||'');fs.writeFileSync(`${base}/plugin.stderr.log`,result.stderr||'');
if(result.status!==0)throw Error(`Plugin validation exit ${result.status}`);
const verification={checkedAt:new Date().toISOString(),baseCommit:'bba068ca03a2511c47b4b2a96bc8d97190e41419',frameChecks,unchangedV5V6:same,previewDependencyChecks:dependencies.length,pluginExitCode:result.status,limits:['No new sprite generation or game integration','Full CI not rerun; shared source and workflows unchanged','QA exit 0 is not anatomy or human approval','Reference scans and extracted game images are local research inputs, not published']};
fs.writeFileSync(`${base}/verification.json`,JSON.stringify(verification,null,2)+'\n');
for(const n of ['verify-publish.mjs','plugin.stdout.log','plugin.stderr.log','verification.json'])selected.push(`${base}/${n}`);
const files=[...new Set(selected)].sort().map(file=>{const bytes=fs.statSync(file).size;if(bytes>50*1024*1024)throw Error(`Oversize file: ${file}`);const normalized=file==='.gitattributes'||file.startsWith('docs/')||file.startsWith('.review-loop/')||file.startsWith('skill-observations/');const data=fs.readFileSync(file);return{path:file,bytes,hashMode:normalized?'utf8-lf':'raw',sha256:normalized?createHash('sha256').update(data.toString('utf8').replace(/\r\n/g,'\n')).digest('hex'):hash(file)}});
const manifest={createdAt:new Date().toISOString(),scope:'Silver sword animation reference study, v1-v6 and single-frame anatomy repair',hashNotes:'bytes records the publishing worktree size. hashMode utf8-lf normalizes CRLF to LF for cross-platform text verification; raw hashes preserve exact bytes.',excludes:[...excluded,'out/resource-reference-20261111/inventory.json','out/resource-reference-20261111/reference-contact.png','personal task ledger','AI models'],files,totalBytes:files.reduce((n,f)=>n+f.bytes,0)};
fs.writeFileSync(`${base}/publish-files.json`,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(`${base}/publish-paths.txt`,[...files.map(f=>f.path),`${base}/publish-files.json`].join('\n')+'\n');
console.log(JSON.stringify({files:files.length,totalBytes:manifest.totalBytes,frameHashes:frameChecks.length,unchangedFrames:same.filter(Boolean).length,previewDependencies:dependencies.length,pluginExitCode:result.status}));
