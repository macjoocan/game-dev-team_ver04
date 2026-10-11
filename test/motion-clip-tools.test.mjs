import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writePNG} from '../scripts/lib-png.mjs';
import {readPNG} from '../scripts/lib-png-read.mjs';
import {transformClip} from '../skills/char-art-system/scripts/motion-clip-tools.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'motion-clip-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'source');fs.mkdirSync(source);
  for(let i=0;i<3;i++){const data=Buffer.alloc(16);for(let p=0;p<16;p+=4){data[p]=data[p+1]=data[p+2]=(i===1?30:100)+p;data[p+3]=p===12?0:255;}writePNG(path.join(source,`${i}.png`),2,2,data);}return{root,source};}
test('color changes dark RGB, preserves alpha, source, and untouched file bytes',t=>{
 const{root,source}=fixture(t),before=fs.readFileSync(path.join(source,'1.png')),out=path.join(root,'color');
 const m=transformClip({source,out,operation:'color',id:'chr.test',frames:[2],references:[1,3]});
 assert.ok(readPNG(path.join(out,'frame_0001.png')).data[0]>readPNG(path.join(source,'1.png')).data[0]);
 assert.deepEqual(before,fs.readFileSync(path.join(source,'1.png')));assert.equal(m.qa.alphaChangedPixels,0);
 assert.deepEqual(fs.readFileSync(path.join(source,'0.png')),fs.readFileSync(path.join(out,'frame_0000.png')));
});
test('pingpong and explicit holds copy pixels with documented mapping',t=>{
 const{root,source}=fixture(t);const m=transformClip({source,out:path.join(root,'loop'),operation:'loop',mode:'pingpong',id:'chr.idle'});
 assert.deepEqual(m.frame_selection,[0,1,2,1]);assert.equal(m.status,'concept');
 const hold=transformClip({source,out:path.join(root,'hold'),operation:'loop',map:[0,1,1,2],id:'chr.roll'});assert.deepEqual(hold.frame_selection,[0,1,1,2]);
});
test('reject overwrite, invalid frames and mixed canvas before output',t=>{
 const{root,source}=fixture(t);assert.throws(()=>transformClip({source,out:source,operation:'loop',id:'chr.test'}));
 assert.throws(()=>transformClip({source,out:path.join(root,'bad'),operation:'loop',map:[3],id:'chr.test'}));
 writePNG(path.join(source,'3.png'),1,1,Buffer.alloc(4));assert.throws(()=>transformClip({source,out:path.join(root,'mixed'),operation:'loop',id:'chr.test'}),/Mixed/);
 assert.equal(fs.existsSync(path.join(root,'mixed')),false);
});
