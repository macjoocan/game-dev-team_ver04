import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPNG} from '../../scripts/lib-png-read.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
function vector(im,lower=false){const v=[];for(let y=lower?Math.floor(im.height*.56):0;y<im.height;y++)for(let x=0;x<im.width;x++){const k=(y*im.width+x)*4,a=im.data[k+3]/255;for(let c=0;c<3;c++)v.push(im.data[k+c]/255*a);v.push(a)}return v}
const diff=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
const velocity=(a,b,c,d)=>a.reduce((s,v,i)=>s+Math.abs((b[i]-v)-(d[i]-c[i])),0)/a.length;
const result={status:'diagnostic-only',method:'Search same-pose closing frames with 18..30 frame spans to prefer a full left-and-right stride; compare lower-body pose, all-frame pose and incoming/outgoing velocity. Closing match is excluded from candidate export; no pixel synthesis.',limitations:'A numeric match can swap leg identity or hide a pause. Human review required; watermark and clothing motion affect metrics.',providers:[]};
for(const provider of ['ludo','ludo-fixed']){
 const folder=path.join(root,provider,'walk'),names=fs.readdirSync(folder).filter(n=>/^frame_\d+\.png$/.test(n)).sort(),ims=names.map(n=>readPNG(path.join(folder,n))),full=ims.map(i=>vector(i)),lower=ims.map(i=>vector(i,true));
 const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
 const fullStep=median(full.slice(1).map((v,i)=>diff(v,full[i]))),legStep=median(lower.slice(1).map((v,i)=>diff(v,lower[i])));
 const candidates=[];
 for(let start=1;start<ims.length-19;start++)for(let close=start+18;close<Math.min(ims.length-1,start+31);close++){
  const pose=diff(full[start],full[close])/fullStep,legs=diff(lower[start],lower[close])/legStep;
  const vel=velocity(lower[start-1],lower[start],lower[close-1],lower[close])/legStep;
  const wrap=diff(full[close-1],full[start])/fullStep;
  candidates.push({start,close,end:close-1,frames:close-start,score:legs*.45+pose*.25+vel*.30,fullPoseStepRatio:pose,lowerPoseStepRatio:legs,velocityStepRatio:vel,wrapStepRatio:wrap});
 }
 candidates.sort((a,b)=>a.score-b.score);result.providers.push({provider,candidates:candidates.slice(0,15)});
}
fs.writeFileSync(path.join(root,'qa/cycle-search.json'),JSON.stringify(result,null,2)+'\n');
for(const p of result.providers)console.log(JSON.stringify({provider:p.provider,top:p.candidates.slice(0,4)},null,2));
