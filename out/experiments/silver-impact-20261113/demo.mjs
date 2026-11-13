import {sample,clamp} from './model.mjs';
const config=await fetch('./feel.json').then(r=>r.json()),d=config.demo;
const options={target:true,feedback:true,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
document.querySelector('#reduced').checked=options.reduced;
const images=await Promise.all([0,1].map(k=>Promise.all(Array.from({length:8},(_,i)=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Image load failed'));im.src=k?`frames-v8/frame_${String(i).padStart(4,'0')}.png`:`../silver-reference-slash-20261111/v6/frames/frame_${String(i).padStart(4,'0')}.png`;})))));
for(let i=0;i<8;i++){const im=images[1][i].cloneNode();im.alt=`새 베기 ${i+1}번 자세`;document.querySelector('#poses').append(im);}
let time=0,playing=false,loop=false,speed=1,last=performance.now(),light=false,sound=false,heard=false,audio;
const canvases=[document.querySelector('#before'),document.querySelector('#after')];
function target(ctx,x,s){
 const recoil=s.recoil,angle=recoil*d.recoilDegrees*Math.PI/180;
 ctx.save();ctx.translate(x+recoil*d.recoilPx+s.shake*d.victimShakePx,d.baselineY);ctx.rotate(angle);
 ctx.strokeStyle='#5a6a67';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-105);ctx.stroke();
 ctx.fillStyle='#947b58';ctx.strokeStyle='#c5aa7b';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-24,-122,48,88,10);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(0,-147,20,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.strokeStyle='#4b493a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-23,-95);ctx.lineTo(23,-95);ctx.moveTo(-23,-66);ctx.lineTo(23,-66);ctx.stroke();ctx.restore();
 ctx.fillStyle='#5f6a65';ctx.fillRect(x-24,d.baselineY,48,5);
}
function draw(index,wall){const c=d.clips[index],s=sample(config,index,wall,options),ctx=canvases[index].getContext('2d'),w=d.canvas[0],h=d.canvas[1];
 ctx.fillStyle=light?'#e4e7de':'#15212b';ctx.fillRect(0,0,w,h);
 const camera=options.reduced?0:s.shake*config.events.sword_contact.shake.amplitudePx;
 ctx.save();ctx.translate(camera,0);ctx.strokeStyle=light?'#b5bdb5':d.groundColor;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(20,d.baselineY+3);ctx.lineTo(w-20,d.baselineY+3);ctx.stroke();
 const tx=options.target?d.targetX:d.missTargetX;target(ctx,tx,s);
 const im=images[index][s.frame],x=d.heroX+s.root+s.shake*d.attackerShakePx;
 ctx.drawImage(im,x-d.heroAnchorX*c.scale,d.baselineY-d.heroAnchorY*c.scale,512*c.scale,512*c.scale);
 if(s.trail){ctx.strokeStyle=d.trailColor;ctx.globalAlpha=.55*(1-clamp(s.age/d.trailMs));ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.ellipse(x+18,235,143,106,0,-1.05,1.07);ctx.stroke();ctx.globalAlpha=1;}
 if(s.spark){const [tip]=s.geometry.sword.slice(-1),age=clamp(s.age/d.sparkMs);ctx.strokeStyle=d.sparkColor;ctx.lineWidth=3;ctx.globalAlpha=1-age;for(let i=0;i<d.sparkCount;i++){const angle=-1.2+i*.6;ctx.beginPath();ctx.moveTo(tip[0]+Math.cos(angle)*8,tip[1]+Math.sin(angle)*8);ctx.lineTo(tip[0]+Math.cos(angle)*(9+d.sparkRadius*age),tip[1]+Math.sin(angle)*(9+d.sparkRadius*age));ctx.stroke();}ctx.globalAlpha=1;}
 ctx.restore();ctx.fillStyle=light?'#455552':'#7f969d';ctx.font='12px system-ui';ctx.fillText(options.target?'명중 거리':'허공 베기',22,26);
 document.querySelector('#status'+index).textContent=`${s.frame+1}/8 · ${c.phaseNames[s.frame]} · ${s.stopping?'명중 정지':s.hit?'명중 1회':'진행'}${s.complete?' · 동작 종료':''}`;
 return s;
}
function playSound(){if(!sound||!audio)return;const t=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(300,t);o.frequency.exponentialRampToValueAtTime(65,t+.1);g.gain.setValueAtTime(.1,t);g.gain.exponentialRampToValueAtTime(.001,t+.13);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.14);}
function render(){const states=[draw(0,time),draw(1,time)];document.querySelector('#clock').textContent=Math.round(time)+'ms';document.querySelector('#seek').value=time;if(playing&&states[1].hit&&!heard){heard=true;playSound();}return states;}
function begin(repeat=false){time=0;playing=true;loop=repeat;heard=false;last=performance.now();if(sound){audio??=new AudioContext();audio.resume();}render();}
document.querySelector('#attack').onclick=()=>begin(false);document.querySelector('#loop').onclick=()=>{if(playing&&loop){playing=false;loop=false;}else begin(true);};
document.querySelector('#seek').oninput=e=>{playing=false;loop=false;time=+e.target.value;render();};
for(const key of ['target','feedback','reduced'])document.querySelector('#'+key).onchange=e=>{options[key]=e.target.checked;render();};
document.querySelector('#speed').onchange=e=>speed=+e.target.value;document.querySelector('#light').onchange=e=>{light=e.target.checked;render();};document.querySelector('#sound').onchange=e=>{sound=e.target.checked;};
window.addEventListener('keydown',e=>{if(e.code==='KeyJ'&&!e.repeat&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();begin(false);}});
function tick(now){const dt=Math.max(0,now-last)*speed;last=now;if(playing){time+=dt;if(time>=d.cycleMs){if(loop){time%=d.cycleMs;heard=false;}else{time=d.cycleMs;playing=false;}}render();}requestAnimationFrame(tick);}requestAnimationFrame(tick);
window.impactDemo={ready:true,config,images:images.map(a=>a.length),seek(t,opts={}){playing=false;Object.assign(options,opts);if('light'in opts)light=opts.light;time=t;return render();},state:()=>({time,playing,options:{...options},states:render()}),start:begin};render();
