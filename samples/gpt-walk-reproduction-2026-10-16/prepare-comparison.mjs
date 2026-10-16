import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readPNG} from '../../scripts/lib-png-read.mjs';
import {writePNG} from '../../scripts/lib-png.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..');
const sourceRoot=path.join(repo,'samples/art-comparison-2026-10-16');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const source=read(path.join(sourceRoot,'ludo-cycle/manifest.json'));
const sheet=readPNG(path.join(root,'raw/gpt-sheet-v1.png'));
if(sheet.width!==1536||sheet.height!==1024)throw Error('Unexpected sheet dimensions; review grid before splitting');
fs.mkdirSync(path.join(root,'gpt/frames256'),{recursive:true});fs.mkdirSync(path.join(root,'reference/walk'),{recursive:true});fs.mkdirSync(path.join(root,'qa'),{recursive:true});
for(let n=0;n<24;n++){
 const buf=Buffer.alloc(256*256*4),col=n%6,row=Math.floor(n/6);
 for(let y=0;y<256;y++){const start=((row*256+y)*sheet.width+col*256)*4;sheet.data.copy(buf,y*256*4,start,start+256*4)}
 writePNG(path.join(root,'gpt/frames256',`frame_${String(n).padStart(4,'0')}.png`),256,256,buf);
}
const command=['skills/char-art-system/scripts/sprite-lab.py','export','--source',path.relative(repo,path.join(root,'gpt/frames256')),'--out',path.relative(repo,path.join(root,'gpt/export')),'--size','128','--fps','13.5','--id','chr.fantasy.gpt.walk-reproduction.v1'];
const exported=spawnSync('python',command,{cwd:repo,encoding:'utf8'});if(exported.status!==0)throw Error(exported.stderr||exported.stdout);
fs.mkdirSync(path.join(root,'gpt/walk'),{recursive:true});
const frames=[];
for(let n=0;n<24;n++){
 const name=`frame_${String(n).padStart(4,'0')}.png`,out=path.join(root,'gpt/walk',name);fs.copyFileSync(path.join(root,'gpt/export',name),out);
 const input=source.clip.frames[n],ref=path.join(root,'reference/walk',name);fs.copyFileSync(path.join(sourceRoot,input.path),ref);if(hash(ref)!==input.sha256)throw Error('Reference hash mismatch');
 const im=readPNG(out);let l=128,t=128,r=-1,b=-1,clear=0,semi=0,edge=0;
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){const a=im.data[(y*128+x)*4+3];if(a===0)clear++;else if(a<255)semi++;if(a>16){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);if(!x||!y||x===127||y===127)edge++;}}
 frames.push({path:'gpt/walk/'+name,sha256:hash(out),canvas:[128,128],bounds:[l,t,r+1,b+1],alphaClearRatio:clear/16384,semiRatio:semi/16384,edgePixels:edge,sourceCell:{column:n%6,row:Math.floor(n/6),size:256}});
}
const qa=spawnSync(process.execPath,['skills/sprite-pipeline/scripts/sprite-qa.mjs',path.relative(repo,path.join(root,'gpt/walk')),'--out',path.relative(repo,path.join(root,'qa/gpt-walk'))],{cwd:repo,encoding:'utf8'});
fs.writeFileSync(path.join(root,'qa/gpt-walk.txt'),`command: node skills/sprite-pipeline/scripts/sprite-qa.mjs ${path.relative(repo,path.join(root,'gpt/walk'))}\nexit: ${qa.status}\n${qa.stdout}${qa.stderr}`);
const reference={...source.clip,label:'사용자 선택 · Ludo 24장',provider:'ludo-reference',frames:source.clip.frames.map((f,n)=>({...f,path:`reference/walk/frame_${String(n).padStart(4,'0')}.png`}))};
const b=frames[0].bounds;
const gpt={provider:'gpt',label:'GPT 이미지 생성 · 24장 시트',fps:13.5,qaExit:qa.status,status:'concept',anchor:{x:(b[0]+b[2])/2,y:b[3],height:b[3]-b[1],method:'fixed first-frame anchor; no per-frame recentering or resizing'},frames};
const manifest={id:'chr.fantasy.gpt.walk-reproduction.v1',status:'concept',harness:'codex',sourceCommit:'a6b81bd',request:'request.json',mode:'built-in image_gen; backend model version not exposed',attempts:1,generatedSheet:{path:'raw/gpt-sheet-v1.png',sha256:hash(path.join(root,'raw/gpt-sheet-v1.png')),canvas:[1536,1024],columns:6,rows:4},reference:{manifest:'../art-comparison-2026-10-16/ludo-cycle/manifest.json',inputHashes:{character:hash(path.join(root,'inputs/character.png')),poses:hash(path.join(root,'inputs/pose-reference.png'))}},normalization:'Exact row-major 6x4 cells, each256px; whole cell uniformly resized to128px with sprite-lab export. No per-frame bbox fitting, pose correction or loop trimming.',timing:'Same24-frame count and13.5FPS comparison timing as selected reference; image generation provides no animation timestamps.',clips:[reference,gpt],verdict:'Single trial: similar walk sheet generated, but exact frame-by-frame motion reproduction was not achieved sufficiently for replacement. Different foot/knee progression and repeated poses; sprite QA exit1. Existing selected Ludo24 unchanged.'};
fs.writeFileSync(path.join(root,'comparison.json'),JSON.stringify(manifest,null,2)+'\n');
const payload=structuredClone(manifest);for(const clip of payload.clips)for(const f of clip.frames)f.image='data:image/png;base64,'+fs.readFileSync(path.join(root,f.path)).toString('base64');payload.qa=fs.readFileSync(path.join(root,'qa/gpt-walk.txt'),'utf8');
fs.writeFileSync(path.join(root,'index.html'),fs.readFileSync(path.join(root,'comparison.template.html'),'utf8').replace('/*__PAYLOAD__*/',JSON.stringify(payload).replace(/</g,'\\u003c')));
console.log(JSON.stringify({sheet:[1536,1024],frames:24,qaExit:qa.status,referenceHashesVerified:24}));
