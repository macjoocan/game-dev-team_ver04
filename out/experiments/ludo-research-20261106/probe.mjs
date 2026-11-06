import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const original=path.resolve(root,'../gpt-walk-20261106/ludo-silver');
const output=path.join(root,'probe-output');
fs.mkdirSync(output,{recursive:true});
const inputs={cycle26:path.join(original,'cycle26'),full36:path.join(original,'export/animation-pack/Right-facing-side-vi')};
const hashes=()=>Object.fromEntries(Object.entries(inputs).map(([k,dir])=>[k,fs.readdirSync(dir).filter(n=>n.endsWith('.png')).sort().map(n=>({file:n,sha256:createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')}))]));
const before=hashes();
const env={...process.env,LUDO_TELEMETRY:'0',DO_NOT_TRACK:'1',LUDO_CONFIG_DIR:path.join(root,'config'),LUDO_CACHE_DIR:path.join(root,'cache')};
delete env.LUDO_API_KEY;
const runs=[];
function run(label,args){
 const r=spawnSync(process.execPath,[path.join(root,'source/dist/cli.js'),'toolbox','sprite',...args,'--json','--quiet','--out',output],{cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
 fs.writeFileSync(path.join(output,label+'.stdout.json'),r.stdout||'');
 fs.writeFileSync(path.join(output,label+'.stderr.txt'),r.stderr||'');
 runs.push({label,args,exitCode:r.status,error:r.error?.message});
 if(r.status!==0) throw new Error(label+': '+r.stderr+' '+r.error);
 return JSON.parse(r.stdout);
}
try{
 for(const [key,dir] of Object.entries(inputs)){
  const joined=run(key+'-join',['join',dir,'--cols','6','--fps','14.4','--name',key]);
  const sheet=path.resolve(root,joined.sheet);
  run(key+'-loop',['loop',sheet]);
  run(key+'-metrics',['metrics',sheet,'--overlay']);
 }
}finally{
 fs.writeFileSync(path.join(output,'execution.json'),JSON.stringify({sourceCommit:'34d13c3f04a229cad39e40aa3fab0327f004edf2',version:'0.2.5',createdAt:new Date().toISOString(),telemetry:false,paidGenerationCalls:0,runs,inputHashes:before,inputUnchanged:JSON.stringify(before)===JSON.stringify(hashes()),fpsAssumed:14.4,engineValidationExecuted:false},null,2)+'\n');
}
console.log(JSON.stringify({runs,inputUnchanged:JSON.stringify(before)===JSON.stringify(hashes())},null,2));
