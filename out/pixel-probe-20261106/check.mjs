import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root='out/pixel-probe-20261106',manifest=JSON.parse(fs.readFileSync(root+'/manifest.json','utf8'));
const qa=root+'/qa',out=root+'/export';fs.mkdirSync(qa,{recursive:true});fs.mkdirSync(out,{recursive:true});const checks=[];
for(const v of manifest.variants){
 const args=['skills/char-art-system/scripts/pixel-contract.mjs',root+'/'+v.id,'--cast','--out',qa+'/'+v.id];
 const r=spawnSync(process.execPath,args,{encoding:'utf8'});fs.writeFileSync(qa+'/'+v.id+'.stdout.txt',r.stdout||'');fs.writeFileSync(qa+'/'+v.id+'.stderr.txt',r.stderr||'');checks.push({id:v.id,command:['node',...args],exitCode:r.status});
 fs.cpSync(root+'/'+v.id,out+'/'+v.id,{recursive:true});
 v.outputHashes=Object.fromEntries(fs.readdirSync(out+'/'+v.id).filter(n=>n.endsWith('.png')).map(n=>[n,createHash('sha256').update(fs.readFileSync(out+'/'+v.id+'/'+n)).digest('hex')]));
}
fs.writeFileSync(out+'/manifest.json',JSON.stringify(manifest,null,2));
fs.writeFileSync(qa+'/execution.json',JSON.stringify({checks,sourceUnchanged:manifest.sourceUnchanged,totalOutputFrames:104},null,2));console.log(JSON.stringify({checks:checks.map(c=>({id:c.id,exitCode:c.exitCode})),seconds:manifest.seconds,sourceUnchanged:manifest.sourceUnchanged,borderTouch:manifest.variants.map(v=>({id:v.id,frames:v.metrics.filter(m=>m.borderPixels>0).length})),maxColors:manifest.variants.map(v=>({id:v.id,colors:Math.max(...v.metrics.map(m=>m.colors))}))},null,2));
