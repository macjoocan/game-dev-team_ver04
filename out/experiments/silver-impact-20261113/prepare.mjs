import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readPNG} from '../../../scripts/lib-png-read.mjs';
import {writePNG} from '../../../scripts/lib-png.mjs';
const root='out/experiments/silver-impact-20261113';
const source=`${root}/raw/slash-v7.png`,im=readPNG(source);
if(im.width!==1024||im.height!==1536)throw Error('Unexpected source dimensions');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const footY=[365,365,361,361,345,345,357,357];
fs.mkdirSync(`${root}/frames`,{recursive:true});fs.mkdirSync(`${root}/qa`,{recursive:true});
const frames=[];
for(let i=0;i<8;i++){
 const x=(i%2)*512,y=Math.floor(i/2)*384,dy=460-footY[i];
 const data=Buffer.alloc(512*512*4);let onBoundary=0;
 for(let yy=0;yy<384;yy++)for(let xx=0;xx<512;xx++){
  const at=((y+yy)*1024+x+xx)*4;
  if((yy===0||yy===383||xx===0||xx===511)&&im.data[at+3]>=128)onBoundary++;
  im.data.copy(data,((yy+dy)*512+xx)*4,at,at+4);
 }
 if(onBoundary)throw Error(`Foreground on cell border ${i}`);
 const file=`${root}/frames/frame_${String(i).padStart(4,'0')}.png`;writePNG(file,512,512,data);
 frames.push({file,sha256:hash(file),sourceRect:[x,y,512,384],footY:footY[i],translation:[0,dy],rgbaPreserved:true});
}
const runs=[];
function run(name,args){const r=spawnSync(process.execPath,args,{encoding:'utf8'});fs.writeFileSync(`${root}/qa/${name}.stdout.log`,r.stdout||'');fs.writeFileSync(`${root}/qa/${name}.stderr.log`,r.stderr||'');runs.push({name,args,exitCode:r.status});}
run('normalize-probe',['skills/char-art-system/scripts/sprite-normalize.mjs',`${root}/frames`,'--out',`${root}/normalization-probe`,'--canvas','512x512','--no-scale','--anchor','bottom']);
run('sprite-qa',['skills/sprite-pipeline/scripts/sprite-qa.mjs',`${root}/frames`,'--out',`${root}/qa`]);
run('motion-qa',['skills/sprite-pipeline/scripts/motion-qa.mjs',`${root}/frames`,'--gait','other','--out',`${root}/qa`]);
const manifest={id:'chr.silver.impact-slash-20261113',version:1,status:'review',source,sourceSha256:hash(source),generation:'built-in imagegen; existing character reference',license:'Generated candidate; not a third-party game frame',frameSize:[512,512],frameCount:8,baselineY:460,pivot:[0.5,460/512],footAnchorMethod:'Manual visual foot-sole measurements in each cell. QA does not validate planted feet.',normalizationChoice:'Ran bbox normalizer as a probe; retained fixed grid X and explicit foot anchors because the sword extends below the foot and bbox centering shifts the torso with the blade. No individual frame scaling/recoloring.',frames,runs};
fs.writeFileSync(`${root}/manifest.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({frameCount:frames.length,runs}));
