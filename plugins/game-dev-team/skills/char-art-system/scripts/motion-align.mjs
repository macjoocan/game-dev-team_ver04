import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readPNG} from '../../../scripts/lib-png-read.mjs';
if(!process.argv[2]||process.argv.includes('--help')){console.log('Usage: motion-align.mjs config.json [output-folder]');process.exit(0);}
try {
const configPath=path.resolve(process.argv[2]??'config.json');
const dir=path.dirname(configPath),config=JSON.parse(fs.readFileSync(configPath));
const output=path.resolve(process.argv[3]??dir);fs.mkdirSync(output,{recursive:true});
const alignment={},assets=[];const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
for(const [name,spec] of Object.entries(config.clips)){
 const folder=path.resolve(dir,spec.folder),f=folder+'/frame_0000.png',im=readPNG(f);let minY=im.height,maxY=0,sumX=0,count=0;
 for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>128){minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
 for(let y=Math.floor(minY+(maxY-minY)*.45);y<minY+(maxY-minY)*.8;y++)for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>128){sumX+=x;count++}
 alignment[name]={x:Math.round(sumX/count),y:maxY+1,height:maxY-minY+1,method:'fixed clip anchor from first-frame torso centroid and lower alpha bound; no per-frame resizing'};
 if(spec.driver){
  const driver=JSON.parse(fs.readFileSync(path.resolve(dir,spec.driver)));
  const motion=spec.driverFrameMap?spec.driverFrameMap.map(i=>driver.motion[i]):driver.motion;
  const travel=motion.map(p=>p.root_travel??p.joints?.root?.[0]??0),lo=travel[0],distance=travel.at(-1)-lo;
  const normalized=travel.map(v=>Math.abs(distance)>1e-6?(v-lo)/distance:0);
  const end=readPNG(folder+'/frame_'+String(clipsLast(folder)).padStart(4,'0')+'.png');let sx=0,n=0;
  for(let y=Math.floor(minY+(maxY-minY)*.45);y<minY+(maxY-minY)*.8;y++)for(let x=0;x<end.width;x++)if(end.data[(y*end.width+x)*4+3]>128){sx+=x;n++}
  const visualTravel=Math.round(sx/n)-alignment[name].x;
  alignment[name].visualRoot=normalized.map(v=>v*visualTravel);
  alignment[name].rootMotion=normalized.map(v=>v*(spec.travelPx??visualTravel*config.world.characterHeight/alignment[name].height));
  alignment[name].driver=spec.driver;alignment[name].endAnchorX=Math.round(sx/n);
  const last=clipsLast(folder),reference=spec.sizeReferenceFrame??0;
  const ref=bounds(readPNG(folder+'/frame_'+String(reference).padStart(4,'0')+'.png'));
  alignment[name].height=ref.max-ref.min+1;
  // Preserve authored airborne height while removing generated vertical drift.
  const controlDir=path.dirname(path.resolve(dir,spec.driver))+'/frames';
  const controls=Array.from({length:last+1},(_,i)=>bounds(readPNG(controlDir+'/frame_'+String(spec.driverFrameMap?.[i]??i).padStart(4,'0')+'.png')));
  const controlRef=controls[reference],ground=controlRef.max;
  alignment[name].visualY=controls.map((b,i)=>{
   const actual=bounds(readPNG(folder+'/frame_'+String(i).padStart(4,'0')+'.png'));
   const lift=Math.max(0,ground-b.max)*alignment[name].height/(controlRef.max-controlRef.min+1);
   return actual.max+1+lift-alignment[name].y;
  });
  if(spec.travelPx===undefined)alignment[name].rootMotion=normalized.map(v=>v*visualTravel*config.world.characterHeight/alignment[name].height);
 }
 assets.push({clip:name,path:spec.folder,manifest_sha256:hash(folder+'/manifest.json'),sheet_sha256:hash(folder+'/sheet.png'),status:'concept'});
}
fs.writeFileSync(output+'/alignment.json',JSON.stringify(alignment,null,2));fs.writeFileSync(output+'/manifest.json',JSON.stringify({id:config.id??'demo.motion-preview',status:'concept',assets,approval:'pending-human-playtest',preview:'index.html'},null,2));
fs.writeFileSync(output+'/feel.json',JSON.stringify(config.feel,null,2));console.log(JSON.stringify(alignment,null,2));
function clipsLast(folder){return JSON.parse(fs.readFileSync(folder+'/manifest.json')).frames-1}
function bounds(im){let min=im.height,max=0;for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>128){min=Math.min(min,y);max=Math.max(max,y)}return {min,max}}

}catch(error){console.error(error.message);process.exitCode=1;}
