import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {readPNG} from '../../../scripts/lib-png-read.mjs';import {writePNG} from '../../../scripts/lib-png.mjs';
const r='out/experiments/silver-impact-20261113';
fs.copyFileSync('C:/Users/NHN/.codex/generated_images/01a1abb8-999d-70a1-a4f9-cceb6da754a4/exec-594cf476-3758-49c2-a70d-a20f6c719e63.png',`${r}/raw/slash-v8-wrist.png`);
fs.copyFileSync(`${r}/preview.html`,`${r}/preview-v7.html`);fs.copyFileSync(`${r}/qa/verification.json`,`${r}/qa/verification-v7.json`);
fs.mkdirSync(`${r}/frames-v8`,{recursive:true});fs.mkdirSync(`${r}/qa/v8`,{recursive:true});
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),im=readPNG(`${r}/raw/slash-v8-wrist.png`);if(im.width!==1024||im.height!==1536)throw Error('Source dimensions');
const frames=[];for(let i=0;i<8;i++){const name=`frame_${String(i).padStart(4,'0')}.png`,src=`${r}/frames/${name}`,dst=`${r}/frames-v8/${name}`;
 if(i!==3)fs.copyFileSync(src,dst);else{const data=Buffer.alloc(512*512*4);for(let y=0;y<384;y++){const start=((384+y)*1024+512)*4;im.data.copy(data,((y+99)*512)*4,start,start+2048);}writePNG(dst,512,512,data);}
 frames.push({file:dst,sha256:hash(dst),sameAsV7:hash(src)===hash(dst)});
}if(frames.filter(f=>f.sameAsV7).length!==7||frames[3].sameAsV7)throw Error('Unexpected replacement scope');
const runs=[];for(const tool of ['sprite-qa','motion-qa']){const args=[`skills/sprite-pipeline/scripts/${tool}.mjs`,`${r}/frames-v8`,'--out',`${r}/qa/v8`,...(tool==='motion-qa'?['--gait','other']:[])];const p=spawnSync(process.execPath,args,{encoding:'utf8'});fs.writeFileSync(`${r}/qa/v8/${tool}.stdout.log`,p.stdout||'');fs.writeFileSync(`${r}/qa/v8/${tool}.stderr.log`,p.stderr||'');runs.push({tool,exitCode:p.status});}
const manifest={id:'chr.silver.impact-slash-20261113',version:2,motionVersion:'v8',status:'review',source:`${r}/raw/slash-v8-wrist.png`,changedFrame:3,reason:'User reported forearm/wrist/blade kink in fourth pose. Imagegen repair; extracted only that cell. Remaining seven PNGs byte-identical to v7.',frameSize:[512,512],baselineY:460,frames,runs};fs.writeFileSync(`${r}/manifest-v8.json`,JSON.stringify(manifest,null,2));
const feel=JSON.parse(fs.readFileSync(`${r}/feel.json`));feel.demo.clips[1].id='v8';feel.demo.clips[1].title='개선 v8 · 손목 수정';feel.demo.clips[1].swordContact=[[355,328],[470,400]];fs.writeFileSync(`${r}/feel.json`,JSON.stringify(feel,null,2));
for(const name of ['demo.mjs','build-preview.mjs']){let s=fs.readFileSync(`${r}/${name}`,'utf8');if(name==='demo.mjs')s=s.replace('`frames/frame_','`frames-v8/frame_');else s=s.replace("${k?root:'out/experiments/silver-reference-slash-20261111/v6'}/frames/","${k?root+'/frames-v8':'out/experiments/silver-reference-slash-20261111/v6/frames'}/");fs.writeFileSync(`${r}/${name}`,s);}
let html=fs.readFileSync(`${r}/index.html`,'utf8').replaceAll('개선 v7','개선 v8').replaceAll('impact-v7.gif','impact-v8.gif');fs.writeFileSync(`${r}/index.html`,html);
for(const name of ['capture.cjs','verify.mjs']){let s=fs.readFileSync(`${r}/${name}`,'utf8').replaceAll('/capture/','/capture-v8/');fs.writeFileSync(`${r}/${name}`,s);}
const capture=readPNG(`${r}/capture/normal/frame_0000.png`);console.log(JSON.stringify({runs,unchangedOtherFrames:7,captureSize:[capture.width,capture.height]}));
