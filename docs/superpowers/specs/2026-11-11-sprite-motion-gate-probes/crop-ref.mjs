import fs from 'node:fs'; import path from 'node:path';
const { readPNG } = await import('file:///D:/00.project/GameDevTeam/scripts/lib-png-read.mjs');
const SIDES=['top','bottom','left','right'];
const BASE='D:/00.project/GameGogo/out_sanabi_final/sanabi_sprites/기타';
const all=fs.readdirSync(BASE).filter(f=>/\.png$/i.test(f)&&!/_M\.png$/i.test(f)&&!/_2\.png$/i.test(f));
const groups={};
for(const f of all){ const g=f.replace(/[ _-]*\(?\d+\)?\.png$/i,''); (groups[g] ||= []).push(f); }
const picked=Object.entries(groups).filter(([,v])=>v.length>=12).slice(0,14);
console.log('이름                                 장수  상/하/좌/우(접촉수·상태)                 판정');
for(const [g,v] of picked){
  const fr=v.map(f=>({n:Number((f.match(/(\d+)/g)||['0']).pop()),f})).sort((a,b)=>a.n-b.n)
    .map(({f})=>{const im=readPNG(path.join(BASE,f));return im;});
  const sizes=new Set(fr.map(i=>i.width+'x'+i.height));
  if(sizes.size>1){ console.log(`${g.slice(0,34).padEnd(36)} ${String(fr.length).padStart(3)}장  캔버스 ${sizes.size}종 — 시퀀스 아님(건너뜀)`); continue; }
  const per=fr.map(im=>{const{width:w,height:h,data}=im;const op=(x,y)=>data[(y*w+x)*4+3]>=128;
    const L={top:[...Array(w)].map((_,x)=>op(x,0)),bottom:[...Array(w)].map((_,x)=>op(x,h-1)),
             left:[...Array(h)].map((_,y)=>op(0,y)),right:[...Array(h)].map((_,y)=>op(w-1,y))};
    const o={}; for(const s of SIDES){let b=0,c=0;for(const vv of L[s]){c=vv?c+1:0;if(c>b)b=c;} o[s]=b>=2;}
    let clear=0;const n=w*h;for(let p=0;p<n;p++)if(data[p*4+3]===0)clear++; o.tp=clear/n; return o;});
  const noA=per.filter(p=>p.tp<0.02).length;
  if(noA>per.length/2){ console.log(`${g.slice(0,34).padEnd(36)} ${String(fr.length).padStart(3)}장  측정불가 — 알파없음 ${noA}/${per.length}`); continue; }
  const st={}; for(const s of SIDES){const t=per.filter(p=>p[s]).length; st[s]={t,s:t===0?'전무':t===per.length?'전수':'혼재'};}
  const verdict=SIDES.some(s=>st[s].s==='혼재')?'**미달**':SIDES.some(s=>st[s].s==='전수')?'측정불가(전수)':'충족';
  console.log(`${g.slice(0,34).padEnd(36)} ${String(fr.length).padStart(3)}장  ${SIDES.map(s=>String(st[s].t).padStart(3)+st[s].s).join(' ')}   ${verdict}`);
}
