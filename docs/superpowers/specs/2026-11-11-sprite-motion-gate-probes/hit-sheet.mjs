import fs from 'node:fs'; import path from 'node:path';
const { readPNG } = await import('file:///D:/00.project/GameDevTeam/scripts/lib-png-read.mjs');
const png = await import('file:///D:/00.project/GameDevTeam/scripts/lib-png.mjs');
const DIR='out/sprite-lab/action-hit-alpha';
const OUT='C:/Users/macjo/AppData/Local/Temp/claude/D--00-project-GameDevTeam/c4fdb0fd-33de-421b-9494-d3f87e991195/scratchpad';
const files=fs.readdirSync(DIR).filter(f=>/\.png$/i.test(f)).sort();
const hits=[];
for(let i=0;i<files.length;i++){
  const im=readPNG(path.join(DIR,files[i])); const {width:w,height:h,data}=im;
  const op=(x,y)=>data[(y*w+x)*4+3]>=128;
  const runOf=a=>{let b=0,c=0;for(const v of a){c=v?c+1:0;if(c>b)b=c;}return b;};
  const L=runOf([...Array(h)].map((_,y)=>op(0,y))), R=runOf([...Array(h)].map((_,y)=>op(w-1,y)));
  if(L>=2||R>=2) hits.push({i,f:files[i],im,L,R});
}
console.log(`접촉 프레임 ${hits.length}/${files.length}  (캔버스 ${hits[0].im.width}x${hits[0].im.height})`);
for(const x of hits) console.log(`  #${String(x.i).padStart(2)} ${x.f}   좌런 ${String(x.L).padStart(3)}px  우런 ${String(x.R).padStart(3)}px`);
// 시트: 접촉 프레임을 가로로 붙이고 닿은 변을 빨간 줄로 표시
const n=hits.length, W=hits[0].im.width, H=hits[0].im.height, PAD=6;
const SW=n*(W+PAD)+PAD, SH=H+2*PAD;
const buf=Buffer.alloc(SW*SH*4);
for(let p=0;p<SW*SH;p++){ buf[p*4]=24; buf[p*4+1]=24; buf[p*4+2]=28; buf[p*4+3]=255; }
hits.forEach((x,k)=>{
  const ox=PAD+k*(W+PAD), oy=PAD;
  for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){
    const s=(y*W+xx)*4, a=x.im.data[s+3]/255;
    const d=((oy+y)*SW+(ox+xx))*4;
    buf[d]=Math.round(x.im.data[s]*a+24*(1-a));
    buf[d+1]=Math.round(x.im.data[s+1]*a+24*(1-a));
    buf[d+2]=Math.round(x.im.data[s+2]*a+28*(1-a));
  }
  const mark=(xx,y)=>{const d=((oy+y)*SW+(ox+xx))*4; buf[d]=255;buf[d+1]=40;buf[d+2]=40;};
  for(let y=0;y<H;y++){ if(x.im.data[(y*W)*4+3]>=128){mark(0,y);mark(1,y);} if(x.im.data[(y*W+W-1)*4+3]>=128){mark(W-1,y);mark(W-2,y);} }
});
png.writePNG(path.join(OUT,'hit-edge-contact.png'),SW,SH,buf);
console.log(`\n-> ${OUT}/hit-edge-contact.png  (${SW}x${SH}, 빨간 줄 = 캔버스 경계에 닿은 픽셀)`);
