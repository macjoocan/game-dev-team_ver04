#!/usr/bin/env node
// Adapter for a locally installed, trusted upstream checkout. No network calls.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {writePNG} from './lib-png.mjs';

export async function exportFx({source,id,out,seed=7}) {
  if(!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) throw new Error('Explicit category/effect id required');
  if(!Number.isSafeInteger(seed)) throw new Error('Integer seed required');
  const root=path.resolve(source), destination=path.resolve(out);
  const provenance=JSON.parse(fs.readFileSync(path.join(root,'GAMDEV_SOURCE.json'),'utf8'));
  if(provenance.repo!=='patch-gg/pixelfx'||provenance.revision!=='a84159688af3ca37a4be05a0d422b94451b2e24e') throw new Error('Unsupported source revision');
  const lib=await import(pathToFileURL(path.join(root,'tools/lib/fxlib.mjs')).href);
  if(!lib.allIds().includes(id)) throw new Error('Unknown effect id');
  const fx=await lib.loadEffect(id);
  if(fx.mod.act?.onBody) throw new Error('Character-dependent effect requires separate body-mask integration');
  if(fs.existsSync(destination)) throw new Error('Output exists; choose a new directory');
  const r=lib.renderFrames(fx,{seed,actor:false});
  const cols=Math.ceil(Math.sqrt(r.n)),rows=Math.ceil(r.n/cols),w=r.w,h=r.h;
  const sheet=Buffer.alloc(cols*w*rows*h*4);
  fs.mkdirSync(destination,{recursive:false});
  const frames=[];
  for(let i=0;i<r.n;i++){
    const x=(i%cols)*w,y=Math.floor(i/cols)*h,rgba=Buffer.from(r.frames[i].clear);
    for(let line=0;line<h;line++) Buffer.from(rgba.buffer,rgba.byteOffset+line*w*4,w*4).copy(sheet,((y+line)*cols*w+x)*4);
    const file=`frame_${String(i).padStart(3,'0')}.png`;
    writePNG(path.join(destination,file),w,h,rgba);
    frames.push({file,x,y,w,h});
  }
  writePNG(path.join(destination,'sheet.png'),cols*w,rows*h,sheet);
  const manifest={id,seed,status:'concept',source:provenance,license:'MIT',alpha:'straight',fps:r.fps,loop:fx.meta.loop,frameSize:[w,h],pivot:[fx.meta.origin[0]+r.margin,fx.meta.origin[1]+r.margin],frames};
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [source,id,out,seed]=process.argv.slice(2);
  if(!source||!id||!out){console.error('Usage: node pixelfx-export.mjs SOURCE CATEGORY/EFFECT OUTPUT [SEED]');process.exitCode=1;}
  else try{const m=await exportFx({source,id,out,seed:seed===undefined?7:Number(seed)});console.log(JSON.stringify({id:m.id,frames:m.frames.length,status:m.status,alpha:m.alpha}));}catch(e){console.error(e.message);process.exitCode=1;}
}
