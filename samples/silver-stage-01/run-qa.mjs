import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..'),qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
const jobs=[
  ['combat-tests',['--test',path.join(root,'game.test.mjs')]],
  ['feel',[path.join(repo,'skills/polish/scripts/feel-audit.mjs'),path.join(root,'feel.json'),'--out',path.join(qa,'feel')]],
  ['hero-pixel',[path.join(repo,'skills/char-art-system/scripts/pixel-contract.mjs'),path.join(root,'build/hero-attack-finished-v2/frames'),'--cast','--out',path.join(qa,'hero-pixel')]],
  ['enemy-pixel',[path.join(repo,'skills/char-art-system/scripts/pixel-contract.mjs'),path.join(root,'build/enemy-finished/frames'),'--cast','--out',path.join(qa,'enemy-pixel')]],
  ['boss-pixel',[path.join(repo,'skills/char-art-system/scripts/pixel-contract.mjs'),path.join(root,'build/boss-finished/frames'),'--cast','--out',path.join(qa,'boss-pixel')]],
  ['hero-sprite',[path.join(repo,'skills/sprite-pipeline/scripts/sprite-qa.mjs'),path.join(root,'build/hero-attack-finished-v2/frames'),'--out',path.join(qa,'hero-sprite')]],
  ['plugin',[path.join(repo,'scripts/validate-plugin.mjs')]]
];
const result=[];
for(const [name,args] of jobs){const p=spawnSync(process.execPath,args,{cwd:repo,encoding:'utf8'});fs.writeFileSync(path.join(qa,name+'.txt'),(p.stdout||'')+(p.stderr||''));result.push({name,exitCode:p.status,command:[process.execPath,...args]});}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/manifest.json')));result.push({name:'atlas-edge-contacts',edgeTouches:Object.fromEntries(Object.entries(manifest.clips).map(([k,v])=>[k,v.edgeTouchFrames])),exitCode:Object.values(manifest.clips).every(c=>c.edgeTouchFrames.length===0)?0:1});
const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).stdout.trim();
fs.writeFileSync(path.join(qa,'results.json'),JSON.stringify({commit,runs:result},null,2));console.log(JSON.stringify(result.map(({name,exitCode})=>({name,exitCode})),null,2));
