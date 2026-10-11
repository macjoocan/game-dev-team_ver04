// Deterministic RGB correction and explicit frame selection; never overwrites inputs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readPNG} from '../../../scripts/lib-png-read.mjs';
import {writePNG} from '../../../scripts/lib-png.mjs';

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const numbers = value => value.split(',').map(v => {
  if (!/^\d+$/.test(v.trim())) throw Error('Expected comma separated integer indices');
  return Number(v);
});
function quantiles(im) {
  const channels = [[],[],[]];
  for(let p=0;p<im.data.length;p+=4) if(im.data[p+3]>240)
    channels.forEach((a,c)=>a.push(im.data[p+c]));
  if(!channels[0].length) throw Error('No opaque pixels for color statistics');
  return channels.map(a=>{a.sort((x,y)=>x-y);return [.25,.5,.75,.9,.98].map(q=>a[Math.floor(q*(a.length-1))]);});
}
export function transformClip({source,out,operation,id,frames=[],references=[],map,mode='forward',fps=24}) {
  source=path.resolve(source);out=path.resolve(out);
  if(out===source || out.startsWith(source+path.sep) || source.startsWith(out+path.sep))
    throw Error('Output must be separate from source');
  if(fs.existsSync(out)) throw Error('Output already exists; choose a new version');
  if(!id || !Number.isFinite(fps) || fps<=0) throw Error('Stable ID and positive FPS required');
  if(!['color','loop'].includes(operation)) throw Error('Expected color or loop');
  const names=fs.readdirSync(source).filter(n=>/\.png$/i.test(n)).sort();
  if(!names.length) throw Error('No PNG frames');
  const images=names.map(n=>readPNG(path.join(source,n)));
  const {width,height}=images[0];
  if(images.some(im=>im.width!==width||im.height!==height)) throw Error('Mixed canvas sizes');
  const validate=(indices,base)=>{if(indices.some(i=>!Number.isInteger(i)||i<base||i>=names.length+base))throw Error('Frame index outside source');};
  let curves={};
  if(operation==='color') {
    if(!frames.length||!references.length)throw Error('Color requires frames and references (one based)');
    validate(frames,1);validate(references,1);
    const stats=images.map(quantiles);
    const target=[0,1,2].map(c=>stats[0][c].map((_,q)=>references.reduce((s,n)=>s+stats[n-1][c][q],0)/references.length));
    for(const n of frames)curves[n]=[0,1,2].map(c=>{
      const points=[[0,0],...stats[n-1][c].map((x,q)=>[x,target[c][q]]),[255,255]];
      const unique=points.filter((p,i)=>i===0||p[0]>points[i-1][0]);
      return Array.from({length:256},(_,x)=>{let j=1;while(j<unique.length-1&&x>unique[j][0])j++;
        const[a,b]=[unique[j-1],unique[j]];return Math.round(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));});
    });
  }
  let selection=map??images.map((_,i)=>i);
  if(operation==='loop' && !map){
    if(!['forward','pingpong'].includes(mode))throw Error('Expected forward or pingpong');
    if(mode==='pingpong')selection.push(...images.slice(1,-1).map((_,i)=>images.length-2-i));
  }
  if(!selection.length)throw Error('Empty frame selection');validate(selection,0);
  fs.mkdirSync(out,{recursive:true});
  const files=[];let alphaChanged=0,untouchedByteIdentical=true;
  for(const[i,n]of selection.entries()){
    const name=`frame_${String(i).padStart(4,'0')}.png`,src=path.join(source,names[n]),dest=path.join(out,name);
    const original=images[n],curve=curves[n+1];
    if(curve){const data=Buffer.from(original.data);for(let p=0;p<data.length;p+=4)if(data[p+3])for(let c=0;c<3;c++)data[p+c]=curve[c][data[p+c]];
      writePNG(dest,width,height,data);
    }else{fs.copyFileSync(src,dest);untouchedByteIdentical&&=hash(src)===hash(dest);}
    const decoded=readPNG(dest);if(decoded.width!==width||decoded.height!==height)throw Error('Canvas changed');
    for(let p=3;p<decoded.data.length;p+=4)if(decoded.data[p]!==original.data[p])alphaChanged++;
    files.push({path:name,sourceFrame:n,sha256:hash(dest)});
  }
  if(alphaChanged||!untouchedByteIdentical)throw Error('Pixel preservation failed');
  const manifest={id,status:'concept',operation,canvas:[width,height],frames:files.length,fps,
    frame_selection:selection,source_hashes:names.map(n=>({path:n,sha256:hash(path.join(source,n))})),
    files,correction:{frameNumbers:'one-based',frames,references,curves},
    qa:{alphaChangedPixels:alphaChanged,untouchedByteIdentical},approval:'pending-human-review'};
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),opt=n=>{const i=args.indexOf('--'+n);return i<0?undefined:args[i+1];};
  try{const result=transformClip({operation:args[0],source:opt('source'),out:opt('out'),id:opt('id'),
    frames:opt('frames')?numbers(opt('frames')):[],references:opt('references')?numbers(opt('references')):[],
    map:opt('map')?numbers(opt('map')):undefined,mode:opt('mode'),fps:Number(opt('fps')??24)});
    console.log(JSON.stringify({id:result.id,frames:result.frames,qa:result.qa}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
