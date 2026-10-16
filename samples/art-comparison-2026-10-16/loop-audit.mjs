import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPNG} from '../../scripts/lib-png-read.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
function difference(a,b){
 if(a.width!==b.width||a.height!==b.height)throw Error('Canvas dimensions differ');
 let sum=0,n=0;
 for(let i=0;i<a.data.length;i+=4){const aa=a.data[i+3]/255,ba=b.data[i+3]/255;if(!aa&&!ba)continue;for(let c=0;c<3;c++)sum+=Math.abs(a.data[i+c]*aa-b.data[i+c]*ba)/255;sum+=Math.abs(aa-ba);n+=4;}
 return n?sum/n:0;
}
const result={type:'diagnostic-only',method:'Mean absolute premultiplied RGBA difference over nonempty union; wrap pair compared with internal adjacent pairs. No automatic pass/fail.',limitations:'Watermarks included. Different rendering and framing can change the values; does not establish natural motion, identity or a visually seamless loop.',clips:[]};
for(const provider of ['ludo','ludo-fixed']){
 const folder=path.join(root,provider,'walk'),names=fs.readdirSync(folder).filter(n=>/^frame_\d+\.png$/.test(n)).sort(),frames=names.map(n=>readPNG(path.join(folder,n)));
 const adjacent=frames.slice(1).map((f,i)=>difference(frames[i],f)),sorted=[...adjacent].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)],wrap=difference(frames.at(-1),frames[0]);
 result.clips.push({provider,frames:frames.length,wrapDifference:wrap,internalMedianDifference:median,wrapToInternalMedianRatio:median?wrap/median:null,adjacentDifferences:adjacent});
}
fs.writeFileSync(path.join(root,'qa/loop-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
