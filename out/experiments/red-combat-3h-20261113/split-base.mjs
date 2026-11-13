import fs from 'node:fs';import crypto from 'node:crypto';import {readPNG} from '../../../scripts/lib-png-read.mjs';import {writePNG} from '../../../scripts/lib-png.mjs';
const root='out/experiments/red-combat-3h-20261113';const gen='C:/Users/NHN/.codex/generated_images/01a1abb8-999d-70a1-a4f9-cceb6da754a4/';
const sources={3:'exec-487765d4-e469-4c54-9872-0f6eb61e043a.png'};
fs.mkdirSync(`${root}/raw`,{recursive:true});fs.mkdirSync(`${root}/qa`,{recursive:true});fs.copyFileSync(gen+'exec-39206020-db65-4302-a078-b37d6fb3529c.png',`${root}/raw/approved-design.png`);
const motions=['combo1','combo2','combo3','dash','spin'],frames=[],issues=[];
for(const [heads,file]of Object.entries(sources)){
 const source=`${root}/raw/${heads}h-sheet.png`;fs.copyFileSync(gen+file,source);const im=readPNG(source);if(im.width!==1536||im.height!==1024)throw Error('Unexpected dimensions');
 const rowCutsByCol=[];
 for(let col=0;col<8;col++){
  const rowCounts=Array.from({length:1024},(_,y)=>{let n=0;for(let x=col*192;x<(col+1)*192;x++)if(im.data[(y*1536+x)*4+3]>=128)n++;return n;});
  const cuts=[0];for(let r=1;r<5;r++){const nominal=Math.round(r*1024/5);const candidates=[];for(let y=nominal-48;y<=nominal+48;y++)if(rowCounts[y]===0&&rowCounts[y-1]===0)candidates.push(y);if(!candidates.length)throw Error(`No safe row separator ${heads}/${col}/${r}`);candidates.sort((a,b)=>Math.abs(a-nominal)-Math.abs(b-nominal));cuts.push(candidates[0]);}cuts.push(1024);
  rowCutsByCol.push(cuts);
 }
 const xCutsByRow=[];
 for(let row=0;row<5;row++){
  const y0=Math.min(...rowCutsByCol.map(c=>c[row])),y1=Math.max(...rowCutsByCol.map(c=>c[row+1]));
  const counts=Array.from({length:1536},(_,x)=>{let n=0;for(let y=y0;y<y1;y++)if(im.data[(y*1536+x)*4+3]>=128)n++;return n;});
  const cuts=[0];for(let col=1;col<8;col++){const nominal=col*192,candidates=[];for(let x=nominal-48;x<=nominal+48;x++)if(counts[x]===0&&counts[x-1]===0)candidates.push(x);if(!candidates.length)throw Error(`No safe column separator ${heads}/${row}/${col}`);candidates.sort((a,b)=>Math.abs(a-nominal)-Math.abs(b-nominal));cuts.push(candidates[0]);}cuts.push(1536);xCutsByRow.push(cuts);
 }
 for(let col=0;col<8;col++){
  const cuts=rowCutsByCol[col];
  for(let row=0;row<5;row++){
   const nominal=Math.round(row*1024/5),data=Buffer.alloc(256*256*4);let fg=0,border=0,clipped=0;
   const x0=xCutsByRow[row][col],x1=xCutsByRow[row][col+1];
   for(let y=cuts[row];y<cuts[row+1];y++)for(let x=x0;x<x1;x++){
    const src=(y*1536+x)*4,dy=32+y-nominal,dx=32+x-col*192,a=im.data[src+3];
    if(a>=128){fg++;if(x===x0||x===x1-1)border++;}
    if(dy<0||dy>=256||dx<0||dx>=256){if(a>=128)clipped++;continue;}
    im.data.copy(data,(dy*256+dx)*4,src,src+4);
   }
   if(!fg||clipped)throw Error(`Invalid crop ${heads}/${row}/${col}`);
   if(border)issues.push({heads,motion:motions[row],frame:col,borderPixels:border});
   const folder=`${root}/source/${heads}h/${motions[row]}`;fs.mkdirSync(folder,{recursive:true});const dest=`${folder}/frame_${String(col).padStart(4,'0')}.png`;writePNG(dest,256,256,data);
   frames.push({heads:Number(heads),motion:motions[row],frame:col,file:dest,sourceRect:[x0,cuts[row],x1-x0,cuts[row+1]-cuts[row]],translation:[32+x0-col*192,32+cuts[row]-nominal],foregroundPixels:fg,borderPixels:border,sha256:crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')});
  }
 }
}
const manifest={id:'chr.red-mercenary.motion-20261113',status:'review',productionApproved:false,designApproval:{date:'2026-11-13',source:'user conversation',quote:'이 디자인으로 3가지 비율 모두 진행 (추천)',scope:'Character design and requested production scope only; not finished motion approval'},proportionTargets:[2,3,5],motions,frameCount:40,frameSize:[256,256],generator:'built-in imagegen',motionReference:'silver-impact-20261113 v8 slash',sourcePixelPreservation:'Copied source RGBA into a common canvas. Per-column foreground-free row separators. No per-frame scaling/recentering.',frames,issues};
fs.writeFileSync(`${root}/source-manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify({frames:frames.length,issues}));
