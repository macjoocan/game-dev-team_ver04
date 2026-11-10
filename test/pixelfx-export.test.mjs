import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {exportFx} from '../scripts/pixelfx-export.mjs';
import {readPNG} from '../scripts/lib-png-read.mjs';
const root=path.resolve('.art-tools/pixelfx');
test('sheet preserves original straight RGBA and rejects character-dependent effects',async t=>{
  if(!fs.existsSync(path.join(root,'GAMDEV_SOURCE.json'))){t.skip('optional PixelFX checkout absent');return;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pixelfx-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const out=path.join(dir,'output');
  const manifest=await exportFx({source:root,id:'melee/sword-slash',out,seed:7});
  const lib=await import(pathToFileURL(path.join(root,'tools/lib/fxlib.mjs')).href);
  const frames=lib.renderFrames(await lib.loadEffect('melee/sword-slash'),{seed:7,actor:false});
  const sheet=readPNG(path.join(out,'sheet.png'));let semi=0;
  for(let i=0;i<frames.n;i++){
    const r=manifest.frames[i],raw=frames.frames[i].clear;
    for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++){
      const s=(y*r.w+x)*4,d=((r.y+y)*sheet.width+r.x+x)*4;
      if(raw[s+3]>0&&raw[s+3]<255){semi++;assert.deepEqual([...sheet.data.slice(d,d+4)],[...raw.slice(s,s+4)]);}
    }
  }
  assert.ok(semi>0);assert.equal(manifest.status,'concept');
  await assert.rejects(exportFx({source:root,id:'holy/heal',out:path.join(dir,'heal')}),/Character-dependent/);
});
