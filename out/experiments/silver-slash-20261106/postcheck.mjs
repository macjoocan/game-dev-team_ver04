import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),qa=path.join(root,'qa');const records=[];
for(const [name,args] of [
 ['selected-sprite-qa',['skills/sprite-pipeline/scripts/sprite-qa.mjs',path.join(root,'export/snappy'),'--out',path.join(qa,'selected-sprite')]],
 ['screen-flash',['skills/polish/scripts/flash-check.mjs',path.join(qa,'screen-frames'),'--fps','30','--loop','--blend','normal','--out',path.join(qa,'screen-flash')]]
]){const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});fs.writeFileSync(path.join(qa,name+'.stdout.txt'),r.stdout||'');fs.writeFileSync(path.join(qa,name+'.stderr.txt'),r.stderr||'');records.push({name,args,exitCode:r.status});console.log(name+': '+r.status);}
const data=JSON.parse(fs.readFileSync(path.join(root,'preview/bounds.json')));const shifts=data.framesEvidence.map(r=>({frame:r.frame,x:Math.round((640-(r.bounds[2]-r.bounds[0]))/2)-r.bounds[0],y:512-r.bounds[3]}));
const normalized={selected:false,reason:'Keep common clip origin; per-frame bounding-box normalization shifts the body with the weapon',predictedTranslationRanges:{x:[Math.min(...shifts.map(s=>s.x)),Math.max(...shifts.map(s=>s.x))],y:[Math.min(...shifts.map(s=>s.y)),Math.max(...shifts.map(s=>s.y))]},shifts};
fs.writeFileSync(path.join(qa,'normalization-decision.json'),JSON.stringify(normalized,null,2));
fs.writeFileSync(path.join(qa,'postcheck.json'),JSON.stringify({records,commit:'4c43b68'},null,2));console.log(JSON.stringify(normalized.predictedTranslationRanges));
