import fs from 'node:fs';
const root='out/experiments/red-mercenary-20261113';
const feel={fps:60,pace:{actionIntervalMs:1000},reducedMotion:{declared:true,disables:['flash','trail','afterimage'],scales:{shake:0}},events:{sword_contact:{class:'hit',weight:2,hitStopFrames:0,shake:{amplitudePx:0,durationMs:0},flash:{durationMs:0}}},fx:{startMs:90,durationMs:135,impactMs:130,sparkMs:140,radiusPx:140,innerRadiusPx:102,center:[236,192],sparkCenter:[339,220],sparkCount:8,sparkRadiusPx:65,pixelStep:4,scale:1.15,palette:{edge:'#c76b32',body:'#dcac67',core:'#e5cfa1'}}};
fs.writeFileSync(`${root}/feel.json`,JSON.stringify(feel,null,2));
let html=fs.readFileSync(`${root}/gallery.template.html`,'utf8');
html=html.replace('<label><input type="checkbox" id="target" checked>베기 표적</label>','<label><input type="checkbox" id="target" checked>베기 표적</label><label><input type="checkbox" id="fx" checked>큰 베기 이펙트</label><label><input type="checkbox" id="reduced">모션 감소</label>');
html=html.replace("const DATA={{DATA}};",`const FEEL=${JSON.stringify(feel)};const DATA={{DATA}};`);
html=html.replace("const inputs=DATA.clips",`let fxEnabled=true,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;document.querySelector('#reduced').checked=reduced;
const fxLayer=document.createElement('canvas');fxLayer.width=105;fxLayer.height=90;const fctx=fxLayer.getContext('2d');
function drawFx(ctx,front){if(!fxEnabled||reduced||motion!=='slash')return;const f=FEEL.fx,u=(time-f.startMs)/f.durationMs;fctx.clearRect(0,0,105,90);const z=large?1:.44,cx=f.center[0]/4,cy=f.center[1]/4;
 if(!front&&u>=0&&u<1){const fade=Math.sin(Math.PI*Math.min(1,u*1.9))*.25+.7*(1-u),end=-1.95+Math.min(1,u*2.5)*3.2,start=end-1.85;
  for(const [r,w,color]of [[f.radiusPx,34,f.palette.edge],[f.radiusPx-5,24,f.palette.body],[f.radiusPx-9,8,f.palette.core]]){fctx.globalAlpha=Math.max(0,fade);fctx.strokeStyle=color;fctx.lineWidth=w/4;fctx.beginPath();fctx.ellipse(cx,cy,r/4*z,r/4*z*.84,-.1,start,end);fctx.stroke();}
 }
 const age=time-f.impactMs;if(front&&showTarget&&age>=0&&age<f.sparkMs){const p=age/f.sparkMs;fctx.globalAlpha=1-p;const sx=f.sparkCenter[0]/4,sy=f.sparkCenter[1]/4;for(let k=0;k<f.sparkCount;k++){const a=k*Math.PI*2/f.sparkCount+.2,r=(10+f.sparkRadiusPx*p)/4;fctx.strokeStyle=k%2?f.palette.body:f.palette.core;fctx.lineWidth=k%2?1:2;fctx.beginPath();fctx.moveTo(sx+Math.cos(a)*r*.45,sy+Math.sin(a)*r*.45);fctx.lineTo(sx+Math.cos(a)*r,sy+Math.sin(a)*r);fctx.stroke();}}
 fctx.globalAlpha=1;ctx.drawImage(fxLayer,0,0,420,360);
}
const inputs=DATA.clips`);
html=html.replace("ctx.drawImage(c.images[i],x,y,size,size);","drawFx(ctx,false);ctx.drawImage(c.images[i],x,y,size,size);");
html=html.replace("document.querySelector('#s'+heads).textContent=","drawFx(ctx,true);document.querySelector('#s'+heads).textContent=");
html=html.replace("document.querySelector('#speed').onchange", "document.querySelector('#fx').onchange=e=>{fxEnabled=e.target.checked;render();};document.querySelector('#reduced').onchange=e=>{reduced=e.target.checked;render();};\ndocument.querySelector('#speed').onchange");
html=html.replace("state:()=>({motion,time,playing,loaded:","state:()=>({motion,time,playing,fxEnabled,reduced,loaded:");
html=html.replace('도트 변환과 모션 검수 결과를 확인하고 있습니다.','120장 모두 경계 접촉·반투명 픽셀 0. 2·3등신 도트의 외톨이 픽셀과 3·5등신 베기·피격의 형태 변화는 추가 검수 대상입니다.');
html=html.replace('<details open><summary>동작별 GIF 받기 · 15종</summary>','<details open><summary>큰 이펙트 포함 베기 GIF · 3종</summary><div class="downloads"><a href="gifs/2h-slash-fx.gif">2등신 + 이펙트</a><a href="gifs/3h-slash-fx.gif">3등신 + 이펙트</a><a href="gifs/5h-slash-fx.gif">5등신 + 이펙트</a></div></details><details><summary>동작별 GIF 받기 · 15종</summary>');
fs.writeFileSync(`${root}/gallery-fx.template.html`,html);
let builder=fs.readFileSync(`${root}/build-gallery.mjs`,'utf8').replace('gallery.template.html','gallery-fx.template.html');fs.writeFileSync(`${root}/build-gallery-fx.mjs`,builder);
