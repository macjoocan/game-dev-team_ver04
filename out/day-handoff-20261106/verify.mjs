import fs from 'node:fs';import {spawn} from 'node:child_process';
const root='out/day-handoff-20261106';fs.mkdirSync(root,{recursive:true});
if(fs.existsSync(root+'/ci.txt'))fs.copyFileSync(root+'/ci.txt',root+'/ci-initial.txt');
const env={...process.env};const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';
if(process.platform==='win32')env[pathKey]='C:\\Program Files\\Git\\bin;'+env[pathKey];
const log=fs.createWriteStream(root+'/ci.txt');const p=spawn(process.execPath,['scripts/ci-local.mjs'],{env});
p.stdout.on('data',d=>{log.write(d);process.stdout.write(d);});p.stderr.on('data',d=>{log.write(d);process.stderr.write(d);});
p.on('close',code=>{log.end();fs.writeFileSync(root+'/ci-result.json',JSON.stringify({command:'node scripts/ci-local.mjs',exitCode:code,completedAt:new Date().toISOString()},null,2));process.exitCode=code??1;});
