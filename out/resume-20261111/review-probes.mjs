// Review-only harness. Production scripts and the shared review ledger are not changed.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {writePNG} from '../../scripts/lib-png.mjs';
const root=process.cwd(),out=path.resolve('out/resume-20261111');
const src='docs/superpowers/specs/2026-11-11-sprite-motion-gate-probes';
const sha=s=>createHash('sha256').update(s).digest('hex');
const pngURL=pathToFileURL(path.join(root,'scripts/lib-png-read.mjs')).href;
const cropRaw=fs.readFileSync(`${src}/crop-probe.mjs`,'utf8');
const gaitRaw=fs.readFileSync(`${src}/gait-probe2.mjs`,'utf8');
const local=s=>s.replace('file:///D:/00.project/GameDevTeam/scripts/lib-png-read.mjs',pngURL).replaceAll('D:/00.project/GameDevTeam',root.replaceAll('\\','/'));
fs.writeFileSync(path.join(out,'crop-local.mjs'),local(cropRaw.split('const SET = [')[0])+'\nexport {classify,sideRuns};\n');
fs.writeFileSync(path.join(out,'gait-local.mjs'),local(gaitRaw.split('const rows = [];')[0])+'\nexport {measure,analyse,SET};\n');
const {classify}=await import(pathToFileURL(path.join(out,'crop-local.mjs')));
const {measure,SET}=await import(pathToFileURL(path.join(out,'gait-local.mjs')));
function fixture(name,{size=32,background=0,alpha=255,empty=false,cape=false,moving=false,mixedSize=false}={}){
  const dir=path.join(out,'fixtures',name);fs.mkdirSync(dir,{recursive:true});
  for(let i=0;i<4;i++){
    const w=mixedSize&&i%2?size+8:size,h=w,b=Buffer.alloc(w*h*4);
    for(let p=0;p<w*h;p++){b[p*4]=180;b[p*4+1]=200;b[p*4+2]=220;b[p*4+3]=background;}
    function rect(x0,y0,x1,y1){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)b[(y*w+x)*4+3]=alpha;}
    if(!empty){if(cape){rect(20,12,35,49);rect(20,50,24,58);rect(31,50,35,58);rect(36,20,43,moving?(i%2?56:40):40);}else rect(8,8,23,23);}
    writePNG(path.join(dir,`frame_${String(i).padStart(4,'0')}.png`),w,h,b);
  }
  const crop=classify(dir,2),gait=measure({name,dir,match:/frame_(\d+)\.png$/});
  return {name,crop,gait};
}
const synthetic=[fixture('valid'),fixture('empty',{empty:true}),fixture('alpha128',{alpha:128}),fixture('background-alpha10',{background:10}),fixture('mixed-size',{mixedSize:true}),fixture('fixed-feet-static-cape',{size:64,cape:true}),fixture('fixed-feet-moving-cape',{size:64,cape:true,moving:true})];
const cropInputs=['out/sprite-lab/action-thrust-alpha','out/sprite-lab/scail2-sword-v2-alpha','out/sprite-lab/action-roll-alpha','out/experiments/local-motion-20261106/c-alpha','out/sprite-lab/action-slash-v4-alpha','out/sprite-lab/action-hit-alpha','out/sprite-lab/action-run-v2-alpha','out/sprite-lab/action-idle-alpha'];
const availability=cropInputs.map(dir=>({dir,exists:fs.existsSync(dir)}));
const realCrop=availability.filter(x=>x.exists).map(({dir})=>({dir,measurements:[1,2,3].map(minRun=>({minRun,result:classify(dir,minRun)}))}));
const realGait=SET.filter(s=>['pos-c-alpha','neg-rigid'].includes(s.name)).map(s=>fs.existsSync(s.dir)?measure(s):{name:s.name,error:'folder missing'});
const journal=fs.readFileSync('.review-loop/reviews.jsonl','utf8').trim().split(/\r?\n/).map(s=>JSON.parse(s));
const quotes=['뒤에 망토만 짤렸네','중간중간 스프라이트가 미결 수준임','니가 말한 zoom 부분도 미결 사항임'];
const result={commit:'4ceb944',scope:'Review probes; original measurement equations preserved. Only paths, exports, and synthetic/available inputs changed.',sourceHashes:{crop:sha(cropRaw),gait:sha(gaitRaw)},synthetic,availability,realCrop,realGait,journalQuoteMatches:quotes.map(quote=>({quote,ids:journal.filter(r=>r.comment?.includes(quote)).map(r=>r.id)}))};
fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({synthetic:synthetic.map(({name,crop,gait})=>({name,crop:crop.verdict??crop.unmeasurable,gaitError:gait.error??null,liftRange:gait.liftRange??null})),availability,realCrop,realGait:realGait.map(r=>({name:r.name,frames:r.frames,liftRange:r.liftRange,error:r.error})),journalQuoteMatches:result.journalQuoteMatches},null,2));
