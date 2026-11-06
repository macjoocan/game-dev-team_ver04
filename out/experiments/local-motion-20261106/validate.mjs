import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=process.cwd(),out=path.join(root,'qa');fs.mkdirSync(out,{recursive:true});
const records=[];
function run(label,args){const r=spawnSync(process.execPath,args,{cwd:repo,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,env:{...process.env,LUDO_TELEMETRY:'0',DO_NOT_TRACK:'1',LUDO_CONFIG_DIR:path.join(root,'config'),LUDO_CACHE_DIR:path.join(root,'cache'),LUDO_API_KEY:''}});fs.writeFileSync(path.join(out,label+'.stdout.txt'),r.stdout||'');fs.writeFileSync(path.join(out,label+'.stderr.txt'),r.stderr||'');records.push({label,args,exitCode:r.status,error:r.error?.message});console.log(label+': '+r.status);return r;}
const frames=path.join(root,'c-alpha');
run('atlas',['skills/char-art-system/scripts/atlas-pack.mjs',frames,'--out',path.join(root,'c-preview/atlas.png'),'--trim','--max','4096','--fps','14.4']);
run('sprite-qa',['skills/sprite-pipeline/scripts/sprite-qa.mjs',frames,'--atlas',path.join(root,'c-preview/atlas.json'),'--out',path.join(out,'sprite')]);
const cli=path.resolve(root,'../ludo-research-20261106/source/dist/cli.js');
const result=run('join',[cli,'toolbox','sprite','join',frames,'--cols','6','--fps','14.4','--name','silver-local-c','--out',path.join(root,'c-preview'),'--json','--quiet']);
if(result.status===0){const sheet=path.resolve(JSON.parse(result.stdout).sheet);for(const command of ['loop','metrics'])run(command,[cli,'toolbox','sprite',command,sheet,'--out',out,'--json','--quiet']);}
fs.writeFileSync(path.join(out,'execution.json'),JSON.stringify({commit:'4c43b68',records,paidCalls:0,engineValidationExecuted:false},null,2));
