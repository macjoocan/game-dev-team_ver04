import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync, execFileSync} from 'node:child_process';
import {readPNG} from '../../scripts/lib-png-read.mjs';

const out=path.dirname(fileURLToPath(import.meta.url));
if(fs.existsSync(path.join(out,'comparison.json')))throw Error('Comparison already prepared. Preserve recorded vendor requests and results; do not overwrite comparison.json.');
const root=path.resolve(out,'../..');
const base=path.join(root,'samples/motion-court');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.mkdirSync(path.join(out,'qa'),{recursive:true});
fs.mkdirSync(path.join(out,'reference'),{recursive:true});
fs.copyFileSync(path.join(base,'reference/reference.png'),path.join(out,'reference/reference.png'));
const alignment=JSON.parse(fs.readFileSync(path.join(base,'alignment.json'),'utf8'));
const clips=[];
for(const action of ['walk','slash']){
  const source=path.join(base,'clips',action),dest=path.join(out,'baseline',action);
  fs.mkdirSync(dest,{recursive:true});
  const meta=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
  const files=fs.readdirSync(source).filter(n=>/^frame_\d+\.png$/.test(n)).sort();
  const frames=files.map(name=>{
    const src=path.join(source,name),dst=path.join(dest,name);
    fs.copyFileSync(src,dst);
    const im=readPNG(dst);
    let x0=im.width,y0=im.height,x1=-1,y1=-1,edge=0,semi=0,nonzero=0;
    for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){
      const a=im.data[(y*im.width+x)*4+3];
      if(a>0){nonzero++;if(a<255)semi++;}
      if(a>16){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);if(x===0||y===0||x===im.width-1||y===im.height-1)edge++;}
    }
    return {path:`baseline/${action}/${name}`,sha256:hash(dst),canvas:[im.width,im.height],bounds:x1<0?null:[x0,y0,x1+1,y1+1],edgePixels:edge,semiTransparentPixels:semi,nonzeroPixels:nonzero};
  });
  const qa=spawnSync(process.execPath,['skills/sprite-pipeline/scripts/sprite-qa.mjs',path.relative(root,dest),'--out',path.relative(root,path.join(out,'qa',action))],{cwd:root,encoding:'utf8'});
  fs.writeFileSync(path.join(out,'qa',`${action}.txt`),`command: node skills/sprite-pipeline/scripts/sprite-qa.mjs samples/art-comparison-2026-10-16/baseline/${action} --out samples/art-comparison-2026-10-16/qa/${action}\nexit: ${qa.status}\n${qa.stdout}${qa.stderr}`);
  clips.push({provider:'baseline',action,label:action==='walk'?'기존 SCAIL-2 · 걷기':'기존 SCAIL-2 · 측면 베기',fps:meta.fps,anchor:alignment[action],source:path.relative(root,source).replaceAll('\\','/'),sourceManifestHash:hash(path.join(source,'manifest.json')),status:'concept',qaExit:qa.status,frames});
}
const manifest={id:'art.vendor-comparison.2026-10-16',status:'concept',createdAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim(),reference:{path:'reference/reference.png',sha256:hash(path.join(out,'reference/reference.png')),approval:'existing concept reference; not production-approved'},comparison:{facing:'right side view',actions:['walk','slash'],displayHeight:138,scalePolicy:'fixed first-frame clip anchor, never normalize each frame independently',criteria:['identity and headgear','sword preservation and crop','foot contact and weight shift','action transition and root travel','alpha fringe','elapsed time and credits'],note:'No vendor result has been measured yet; do not rank unavailable results.'},vendors:{voidless:{status:'awaiting-generation',initialCredits:25},ludo:{status:'awaiting-generation',initialCredits:30}},clips};
fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(out,'request.json'),JSON.stringify({reference:manifest.reference,commonDescription:'One male fantasy swordsman facing right in strict 2D side view. Preserve the red wide-brim feathered hat, large ivory feather, brown hair, red cape, cream shirt, dark fitted vest, brown boots and full-length sword. Preserve the reference design and proportions. Entire body and sword remain inside a fixed canvas. No dust, no glow, no background, no camera motion.',walk:'A natural in-place walking cycle, alternating feet with planted support foot, knee bend, hip and shoulder weight transfer. Keep the sword grip, feather and hat unchanged. Seamless loop.',slash:'A single side-view sword slash with forward weight transfer and a readable sword arc. Preparation, strike and recovery. Maintain consistent headgear and sword length. No teleport back, no extra weapons.',costPolicy:'No new purchase. Record exact displayed cost before generation. Pending requests are resumed, never resubmitted blindly.',status:'prepared-not-submitted'},null,2)+'\n');
console.log(JSON.stringify({manifest:'comparison.json',clips:clips.map(c=>({action:c.action,frames:c.frames.length,canvas:c.frames[0]?.canvas,qaExit:c.qaExit})),vendorResults:0},null,2));
