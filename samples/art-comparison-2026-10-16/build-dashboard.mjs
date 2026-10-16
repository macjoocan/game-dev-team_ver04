import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const data=JSON.parse(read('comparison.json'));
data.comparison.note='Single-reference pilot, one original walk generation per service plus one Ludo Fix Loop repair. Structural QA does not establish walking quality. No production approval.';
data.vendors.ludo.status='hydra-walk-downloaded; directional-unmeasurable';
data.vendors.ludo.creditsBreakdown={imageTo3D:15,humanoidRigRequest:1,hydraAnimate:9,fixLoopQuoted:3};
data.vendors.ludo.hydra={motionVerdict:'Alternating steps visible; candidate for further review. User reports abrupt loop seam. Watermarked export.',watermark:true,sourceVideoDurationSeconds:2.666667,sourceVideoSize:[488,516],exportFrameSize:[418,491],frames:36,prompt:data.vendors.voidless.prompt,serviceFpsConfirmed:false,userFeedback:{quote:'ludo 가 깔끔한데 루프 되기 전에 뚝 끊기는게 아쉽네',tags:['loop-seam','visual-positive'],interpretation:'Visual quality preferred; loop boundary needs correction. This is not production approval.',scope:'this Ludo Hydra walk output only'}};
for(const c of data.clips){
 c.label=c.provider==='baseline'?`기존 SCAIL-2 · ${c.action==='walk'?'걷기':'베기'}`:c.provider==='ludo'?'Ludo Hydra · 일반 Animate 걷기':c.provider==='ludo-fixed'?'Ludo Fix Loop · 보정본':'Voidless · 걷기 요청';
 if(c.provider==='ludo'){c.workflow='Sprite Generator Animate / Hydra';c.fps=13.5;c.fpsNote='Comparison playback estimated as 36 frames / 2.666667 second source video; service export FPS not confirmed.';c.watermark=true;c.productionEligible=false;}
 if(c.provider==='ludo-fixed'){c.workflow='Ludo Fix Loop (Forge, per vendor documentation)';c.fps=36/2.6875;c.fpsNote='Comparison playback estimated as 36 frames / 2.6875 second source video; service export FPS not confirmed.';c.watermark=true;c.productionEligible=false;}
}
fs.writeFileSync(path.join(root,'comparison.json'),JSON.stringify(data,null,2)+'\n');
const payload=structuredClone(data);
const embed=p=>'data:image/png;base64,'+fs.readFileSync(path.join(root,p)).toString('base64');
payload.reference.image=embed(payload.reference.path);
for(const c of payload.clips)for(const f of c.frames)f.image=embed(f.path);
payload.evidence=Object.fromEntries(['qa/initial-art-gate.txt','qa/walk.txt','qa/slash.txt','qa/voidless-walk.txt','qa/ludo-walk.txt','ludo/browser-error.json',...(['qa/ludo-fixed-walk.txt','qa/loop-audit.json','ludo-fixed/experiment.json','qa/cycle-search.json','qa/ludo-cycle-walk.txt'].filter(p=>fs.existsSync(path.join(root,p))))].map(p=>[p,read(p)]));
const output=read('dashboard.template.html').replace('/*__PAYLOAD__*/',JSON.stringify(payload).replace(/</g,'\\u003c'));
for(const name of ['dashboard.html','index.html'])fs.writeFileSync(path.join(root,name),output);
console.log(`Built offline dashboard: ${payload.clips.length} clips, ${payload.clips.reduce((n,c)=>n+c.frames.length,0)} frames, ${Buffer.byteLength(output)} bytes`);
