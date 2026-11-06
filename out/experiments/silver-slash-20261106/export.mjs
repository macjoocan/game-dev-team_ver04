import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),qa=path.join(root,'qa'),output=path.join(root,'export');fs.mkdirSync(qa,{recursive:true});fs.mkdirSync(output,{recursive:true});
const feel=JSON.parse(fs.readFileSync(path.join(root,'feel.json'))),records=[];
function run(label,args){const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});fs.writeFileSync(path.join(qa,label+'.stdout.txt'),r.stdout||'');fs.writeFileSync(path.join(qa,label+'.stderr.txt'),r.stderr||'');records.push({label,args,exitCode:r.status,error:r.error?.message});console.log(label+': '+r.status);return r;}
const frames=path.join(root,'alpha-repaired');const sourceHashes=Object.fromEntries(fs.readdirSync(frames).filter(n=>n.endsWith('.png')).map(n=>[n,createHash('sha256').update(fs.readFileSync(path.join(frames,n))).digest('hex')]));
run('sprite-qa',['skills/sprite-pipeline/scripts/sprite-qa.mjs',frames,'--out',path.join(qa,'sprite')]);
// Run the standard normalizer as a diagnostic variant. Main output preserves the
// clip's common origin; per-frame weapon bounds must not recenter the actor.
run('normalize-probe',['skills/char-art-system/scripts/sprite-normalize.mjs',frames,'--out',path.join(root,'normalized-probe'),'--canvas','640x512','--no-scale']);
for(const key of ['uniform','snappy']){
 const spec=feel.clips[key],dir=path.join(output,key);fs.mkdirSync(dir,{recursive:true});const timing={};
 for(let i=0;i<spec.sourceFrames.length;i++){const inputName=`frame_${String(spec.sourceFrames[i]).padStart(4,'0')}.png`,name=`frame_${String(i).padStart(4,'0')}.png`;fs.copyFileSync(path.join(frames,inputName),path.join(dir,name));timing[name.slice(0,-4)]={sourceFrame:spec.sourceFrames[i],durationMs:spec.durations[i],sha256:sourceHashes[inputName]};}
 const atlas=path.join(output,key+'.png');const r=run(key+'-atlas',['skills/char-art-system/scripts/atlas-pack.mjs',dir,'--out',atlas,'--trim','--max','4096']);
 if(r.status!==0)throw Error('Atlas packing failed');
 const jf=atlas.replace(/\.png$/,'.json'),data=JSON.parse(fs.readFileSync(jf));fs.copyFileSync(jf,jf+'.raw');
 // Packer returns height-sorted rectangles. Bind durations by frame name,
 // then restore playback order rather than assigning by packed array order.
 data.frames.sort((a,b)=>a.name.localeCompare(b.name));
 for(const f of data.frames){Object.assign(f,timing[f.name]);f.pivot={x:275.05/640,y:(512-477.66)/512};}
 Object.assign(data.meta,{status:'review',id:'chr.silver.local.slash.'+key,loop:false,totalMs:spec.durations.reduce((a,b)=>a+b,0),originTopLeft:true,timingNote:'Use frames[].durationMs; frames ordered by numeric filename.',pivotEvidence:'inputs.json common source origin; actual engine verification pending'});
 fs.writeFileSync(jf,JSON.stringify(data,null,2));
 for(let i=0;i<data.frames.length;i++){const f=data.frames[i];if(f.durationMs!==spec.durations[i]||f.sourceFrame!==spec.sourceFrames[i])throw Error('Timing mapping mismatch');}
}
run('timing-tests',['--test',path.join(root,'timeline.test.mjs')]);
run('feel-audit',['skills/polish/scripts/feel-audit.mjs',path.join(root,'feel.json'),'--out',path.join(qa,'feel')]);
fs.writeFileSync(path.join(qa,'execution.json'),JSON.stringify({commit:'4c43b68',records,sourceHashes,paidCalls:0,engineValidationExecuted:false},null,2));
console.log('Exported named timing maps; originals unchanged.');
