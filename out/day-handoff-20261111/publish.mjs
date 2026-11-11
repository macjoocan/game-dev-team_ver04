// Explicit artifact inventory. This script does not stage, commit, or push.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const base='out/day-handoff-20261111';
fs.mkdirSync(base,{recursive:true});
const selected=[];
function walk(dir,accept){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const name=`${dir}/${entry.name}`;
    if(entry.isSymbolicLink())throw Error(`Unexpected link: ${name}`);
    if(!accept(name))continue;
    if(entry.isDirectory())walk(name,accept);
    else if(entry.isFile())selected.push(name);
  }
}
const experiment='out/experiments/silver-gpt-qa-20261111';
walk(experiment,f=>f!==`${experiment}/reference`);
walk('out/sprite-motion-implementation-20261111',f=>!f.endsWith('/before-sprite-qa.mjs'));
walk('out/resume-20261111',f=>!f.endsWith('/review-before-pull'));
walk(base,f=>!['publish-files.json','publish-paths.txt','push-result.json','commit-message.txt'].includes(path.basename(f)));
const names=[...new Set(selected)].sort();
const chosen=new Set(names);
const html=fs.readFileSync(`${experiment}/review.html`,'utf8');
const clips=JSON.parse(html.match(/const clips=(\[.*?\]); let/)[1]);
const previewInputs=[...clips.flatMap(c=>c.files),...Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g),m=>m[1])];
for(const file of previewInputs){
  if(!chosen.has(`${experiment}/${file}`))throw Error(`Preview dependency not selected: ${file}`);
}
const files=names.map(name=>{
  const data=fs.readFileSync(name);
  if(data.length>50*1024*1024)throw Error(`Oversize artifact: ${name}`);
  return {path:name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
});
const manifest={schemaVersion:1,createdAt:new Date().toISOString(),scope:'Sprite QA 0.54.0 and silver GPT v1-v3 review evidence',
  excludes:['AI models','installed dependencies','personal task ledger','review backup before pull','duplicate C frame copies','adapted absolute-path baseline script'],
  previewDependenciesVerified:previewInputs.length,totalBytes:files.reduce((sum,f)=>sum+f.bytes,0),files};
fs.writeFileSync(`${base}/publish-files.json`,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(`${base}/publish-paths.txt`,[...names,`${base}/publish-files.json`].join('\n')+'\n');
console.log(JSON.stringify({files:files.length,bytes:manifest.totalBytes,previewDependenciesVerified:previewInputs.length}));
