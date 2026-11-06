import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root='out/pixel-probe-20261106';
const sha=(b)=>createHash('sha256').update(b).digest('hex');
if(process.argv.includes('--verify-index')){
 const files=JSON.parse(fs.readFileSync(root+'/publish-files.json','utf8')).files;
 const index=new Map(execFileSync('git',['ls-files','--stage','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).map(e=>{const [meta,p]=e.split('\t');return[p,meta.split(' ')[1]];}));
 const bad=files.filter(f=>{const b=fs.readFileSync(f.path);return sha(b)!==f.sha256||createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex')!==index.get(f.path);}).map(f=>f.path);
 console.log(JSON.stringify({checked:files.length,hashMismatches:bad}));process.exit(bad.length?1:0);
}
const manifest=JSON.parse(fs.readFileSync(root+'/export/manifest.json','utf8'));
let outputChecks=0;for(const v of manifest.variants)for(const [name,hash] of Object.entries(v.outputHashes)){for(const folder of [root+'/'+v.id,root+'/export/'+v.id]){if(sha(fs.readFileSync(folder+'/'+name))!==hash)throw Error('Output changed: '+folder+'/'+name);outputChecks++;}}
for(let i=0;i<26;i++)if(!fs.existsSync(root+'/original/frame_'+String(i).padStart(4,'0')+'.png'))throw Error('Missing preview');
const files=[],skip=new Set(['vendor','deps','__pycache__']);
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name).replaceAll('\\','/');if(e.isSymbolicLink())throw Error('Unexpected link '+p);if(e.isDirectory()){if(!skip.has(e.name))walk(p);continue;}if(/^publish-(files\.json|paths\.txt)$|^commit-message\.txt$/.test(e.name))continue;if(!/\.(png|gif|json|mjs|py|html|md|txt)$/.test(p))throw Error('Unexpected file '+p);const b=fs.readFileSync(p);if(b.length>16*1048576)throw Error('Large file '+p);if(!/\.(png|gif)$/.test(p)){const s=b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8');if(/sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|"(?:refresh_token|storageState)"\s*:/.test(s))throw Error('Sensitive value candidate '+p);}files.push({path:p,bytes:b.length,sha256:sha(b)});}}
walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(root+'/publish-files.json',JSON.stringify({createdAt:new Date().toISOString(),excluded:['vendor/','deps/','__pycache__/'],outputHashChecks:outputChecks,fileCount:files.length,totalBytes:files.reduce((s,f)=>s+f.bytes,0),files},null,2));
fs.writeFileSync(root+'/publish-paths.txt',files.map(f=>f.path).concat(root+'/publish-files.json',root+'/publish-paths.txt').join('\n')+'\n');
console.log(JSON.stringify({files:files.length,MiB:files.reduce((s,f)=>s+f.bytes,0)/1048576,outputHashChecks:outputChecks,previewImages:130}));
