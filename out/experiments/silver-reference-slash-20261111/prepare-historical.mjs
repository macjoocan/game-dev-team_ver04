import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readPNG} from '../../../scripts/lib-png-read.mjs';
import {writePNG} from '../../../scripts/lib-png.mjs';
const root='out/experiments/silver-reference-slash-20261111';
const source=`${root}/raw/silver-slash-v5.png`,im=readPNG(source);
if(im.width!==1024||im.height!==1536)throw Error('Unexpected source size');
const boundaries=[0,384,768,1152,1536];
for(const y of boundaries.slice(1,-1))for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>=128)throw Error('Foreground on row cut');
fs.mkdirSync(`${root}/v5/frames`,{recursive:true});
const frames=[];
for(let i=0;i<8;i++){
 const col=i%2,row=Math.floor(i/2),top=boundaries[row],height=boundaries[row+1]-top;
 let bottom=-1,fg=0;
 for(let y=0;y<height;y++)for(let x=0;x<512;x++)if(im.data[((top+y)*im.width+col*512+x)*4+3]>=128){bottom=y;fg++}
 if(bottom<0)throw Error('Empty frame');
 const dy=460-bottom;if(dy<0||dy+height>512)throw Error('Padding would clip source pixels');
 const out=Buffer.alloc(512*512*4);
 for(let y=0;y<height;y++){const start=((top+y)*im.width+col*512)*4;im.data.copy(out,((dy+y)*512)*4,start,start+512*4)}
 let preserved=true;for(let y=0;y<height;y++){const start=((top+y)*im.width+col*512)*4;if(!im.data.subarray(start,start+2048).equals(out.subarray((dy+y)*2048,(dy+y+1)*2048)))preserved=false;}
 if(!preserved)throw Error('RGBA changed');
 const file=`${root}/v5/frames/frame_${String(i).padStart(4,'0')}.png`;writePNG(file,512,512,out);
 frames.push({file,sourceRect:[col*512,top,512,height],translation:[0,dy],foregroundPixels:fg,exactRgbaPreserved:preserved,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
}
const runs=[];
for(const tool of ['sprite-qa','motion-qa']){const args=[`skills/sprite-pipeline/scripts/${tool}.mjs`,`${root}/v5/frames`,'--out',`${root}/v5/qa`,...(tool==='motion-qa'?['--gait','other']:[])];const r=spawnSync(process.execPath,args,{encoding:'utf8'});fs.writeFileSync(`${root}/v5/${tool}.stdout.log`,r.stdout||'');fs.writeFileSync(`${root}/v5/${tool}.stderr.log`,r.stderr||'');runs.push({tool,args,exitCode:r.status});}
const manifest={source,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),status:'review',frameCount:8,frameSize:[512,512],sourceRowBoundaries:boundaries,reason:'Regular 2-column / 4-row slicing. Foreground-free separator verified at alpha128. Full row RGBA copied without scaling, recoloring or alpha editing, then transparent padding aligns foreground bottom to460.',frames,runs};
fs.writeFileSync(`${root}/v5/manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify({runs,frameCount:8,allRgbaPreserved:frames.every(f=>f.exactRgbaPreserved)}));
