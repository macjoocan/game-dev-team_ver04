import {createGame} from './engine.js';
import {createDust} from './dust.js';
const $=s=>document.querySelector(s),canvas=$('#game'),ctx=canvas.getContext('2d');
let config,clips,game,paused=false,last=0,camera=0,heldAxis=0,effects=[],ready=false,dust;
const keys=new Set(),labels={run:'달리기',idle:'대기',walk:'걷기',slash:'베기',thrust:'찌르기',hit:'피격',roll:'구르기'};
async function json(url){const r=await fetch(url);if(!r.ok)throw Error(url+' · '+r.status);return r.json()}
const image=url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('이미지 로드 실패: '+url));im.src=url});
function drawBackground(){
 const sky=ctx.createLinearGradient(0,0,0,540);sky.addColorStop(0,'#172332');sky.addColorStop(.7,'#354047');sky.addColorStop(1,'#20262a');ctx.fillStyle=sky;ctx.fillRect(0,0,960,540);
 ctx.fillStyle='#c1c5b4';ctx.beginPath();ctx.arc(790,86,30,0,Math.PI*2);ctx.fill();ctx.fillStyle='#172332';ctx.beginPath();ctx.arc(777,75,29,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#23303a';for(let i=-2;i<12;i++){const x=i*140-camera*.18;ctx.fillRect(x,180+(i%3)*24,112,220);ctx.fillRect(x+32,140+(i%3)*24,52,100);for(let k=0;k<3;k++)ctx.fillRect(x+k*38,172+(i%3)*24,20,20)}
 ctx.fillStyle='#1b2931';for(let i=-2;i<12;i++){const x=i*150-camera*.4;ctx.fillRect(x,270,125,130);ctx.fillStyle='#34414a';ctx.fillRect(x+5,275,115,5);ctx.fillStyle='#1b2931'}
 ctx.save();ctx.translate(-camera,0);const floor=config.world.floor;
 ctx.fillStyle='#43494b';ctx.fillRect(0,floor,config.world.width,140);ctx.fillStyle='#918675';ctx.fillRect(0,floor,config.world.width,7);ctx.fillStyle='#252f34';ctx.fillRect(0,floor+7,config.world.width,8);
 for(let row=0;row<4;row++)for(let col=-1;col<20;col++){let x=col*94+(row%2)*47;ctx.strokeStyle='#30393d';ctx.lineWidth=2;ctx.strokeRect(x,floor+16+row*30,94,30);ctx.strokeStyle='#5a5e58';ctx.beginPath();ctx.moveTo(x+3,floor+18+row*30);ctx.lineTo(x+87,floor+18+row*30);ctx.stroke()}
 for(const x of [80,420,790,1230]){ctx.fillStyle='#493f31';ctx.fillRect(x,floor-100,7,100);ctx.fillStyle='#ba9252';ctx.fillRect(x-6,floor-103,20,20);ctx.fillStyle='#e5b66a';ctx.beginPath();ctx.ellipse(x+4,floor-102,5,9,0,0,Math.PI*2);ctx.fill()}
 ctx.fillStyle='#ad9b7c';ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillText('달빛 훈련장',240,floor+53);ctx.restore();
}
function drawDummy(t){
 const floor=config.world.floor;ctx.save();ctx.translate(t.x,floor);ctx.fillStyle='#121b2199';ctx.beginPath();ctx.ellipse(0,4,34,7,0,0,Math.PI*2);ctx.fill();
 if(t.health<=0){ctx.rotate(-1.3);ctx.globalAlpha=.35}else if(!$('#reduce').checked)ctx.rotate(Math.sin(t.stun*28)*t.stun*.35);
 ctx.fillStyle='#62503d';ctx.fillRect(-5,-78,10,78);ctx.fillStyle='#aa8755';ctx.strokeStyle='#473a2c';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,-83,22,35,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(0,-129,15,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#7d6348';ctx.fillRect(-43,-101,86,9);ctx.strokeStyle='#d1b780';for(let y=-107;y<-55;y+=12){ctx.beginPath();ctx.moveTo(-16,y);ctx.lineTo(16,y+6);ctx.stroke()}ctx.restore();
 ctx.fillStyle='#172028';ctx.fillRect(t.x-32,floor-168,64,7);ctx.fillStyle='#bbaa74';ctx.fillRect(t.x-31,floor-167,62*Math.max(0,t.health/t.maxHealth),5);ctx.fillStyle=t.telegraph?'#ddb173':'#c6b795';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText(t.health<=0?'복구 중':t.telegraph?'반격 준비!':t.striking?'공격!':'훈련 허수아비',t.x,floor-179);
 if(t.telegraph||t.striking){ctx.strokeStyle=t.striking?'#d48768':'#c3a879';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(t.x,floor-2,config.counter.reach,12,0,0,Math.PI*2);ctx.stroke()}
}
function drawPlayer(){
 const p=game.state.player,name=game.clipName(),clip=clips[name],frame=game.frame(),a=clip.anchor,scale=config.world.characterHeight/a.height;
 ctx.save();ctx.translate(p.x,config.world.floor);ctx.fillStyle='#121b2188';ctx.beginPath();ctx.ellipse(0,4,27,6,0,0,Math.PI*2);ctx.fill();if(game.invulnerable()){ctx.strokeStyle='#88b4b0';ctx.beginPath();ctx.ellipse(0,3,30,8,0,0,Math.PI*2);ctx.stroke()}ctx.scale(p.facing*scale,scale);ctx.imageSmoothingEnabled=false;ctx.drawImage(clip.images[frame],-a.x-game.visualRoot(),-a.y-game.visualY());ctx.restore();
 const attack=config.clips[p.action];if($('#boxes').checked&&attack?.activeFrames){const active=frame>=attack.activeFrames[0]&&frame<=attack.activeFrames[1];ctx.fillStyle=active?'#bc9b5633':'#52818522';ctx.strokeStyle=active?'#dbbd72':'#719ba2';let x=p.facing===1?p.x:p.x-attack.reach;ctx.fillRect(x,config.world.floor-125,attack.reach,112);ctx.strokeRect(x,config.world.floor-125,attack.reach,112)}
}
function drawEffects(){
 for(const e of effects){const f=e.age/config.feel.damageNumberSeconds;ctx.globalAlpha=Math.max(0,1-f);ctx.fillStyle='#ead9a3';ctx.font='bold 24px system-ui';ctx.textAlign='center';ctx.fillText(e.damage,e.x,config.world.floor-155-e.age*35);
 if(!$('#reduce').checked&&e.age<config.feel.impactSeconds){ctx.strokeStyle='#c9b28c';ctx.lineWidth=2;for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(e.x+Math.cos(a)*8,config.world.floor-85+Math.sin(a)*8);ctx.lineTo(e.x+Math.cos(a)*(16+e.age*60),config.world.floor-85+Math.sin(a)*(16+e.age*60));ctx.stroke()}}ctx.globalAlpha=1;
 }
}
function render(){
 drawBackground();ctx.save();ctx.translate(-camera,0);for(const t of game.state.targets)drawDummy(t);if($('#dust').checked&&!$('#reduce').checked)dust.draw(ctx);drawPlayer();drawEffects();ctx.restore();
 const p=game.state.player;$('#hp').textContent='♥'.repeat(p.hp)+'♡'.repeat(config.world.playerHealth-p.hp);$('#hits').textContent=game.state.hits;$('#damage').textContent=game.state.totalDamage;$('#action').textContent=labels[p.action]+' · '+(game.frame()+1)+' / '+clips[game.clipName()].frames;
}
function setPause(value){paused=value;$('#pause').textContent=value?'계속하기':'일시 정지';$('#message').hidden=!value;$('#message').textContent='일시 정지 · P 또는 계속하기';keys.clear();heldAxis=0}
function reset(){game.reset();effects=[];dust.clear();setPause(false);camera=0}
function trigger(name){if(ready&&!paused)game.action(name)}
window.addEventListener('keydown',e=>{if(['SELECT','TEXTAREA'].includes(e.target.tagName)||(e.target.tagName==='INPUT'&&e.target.type!=='checkbox'))return;const k=e.key.toLowerCase();if(['arrowleft','arrowright','a','d','j','k','h','p','r',' ','shift'].includes(k))e.preventDefault();keys.add(k);if(e.repeat||!ready)return;if(k==='j')trigger('slash');if(k==='k')trigger('thrust');if(k==='h')trigger('hit');if(k===' ')trigger('roll');if(k==='p')setPause(!paused);if(k==='r')reset()});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{if(ready)setPause(true)});document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready)setPause(true)});
$('#pause').onclick=()=>{if(ready)setPause(!paused)};$('#reset').onclick=()=>{if(ready)reset()};$('#reduce').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
canvas.tabIndex=0;canvas.addEventListener('pointerdown',()=>canvas.focus());
for(const b of document.querySelectorAll('[data-action]'))b.onclick=()=>trigger(b.dataset.action);
for(const b of document.querySelectorAll('[data-axis]')){b.onpointerdown=e=>{heldAxis=+b.dataset.axis;b.setPointerCapture(e.pointerId);e.preventDefault()};b.onpointerup=b.onpointercancel=()=>heldAxis=0}
function tick(now){const dt=Math.min((now-last)/1000,.05);last=now;if(ready){if(!paused){const axis=heldAxis||((keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0));const elapsed=dt*+$('#speed').value;game.update(elapsed,axis,$('#counter')?.checked??false,keys.has('shift')||$('#run').checked);dust.update(elapsed,game.state.player,game.state.serial,game.frame(),$('#dust').checked&&!$('#reduce').checked,config.world.floor);for(const e of game.state.events)if(e.type==='hit')effects.push({...e,age:0});effects=effects.map(e=>({...e,age:e.age+elapsed})).filter(e=>e.age<config.feel.damageNumberSeconds)}camera=Math.max(0,Math.min(config.world.width-960,game.state.player.x-360));render()}requestAnimationFrame(tick)}
try{
 config=await json('./config.json');const alignment=await json('./alignment.json');clips={};
 await Promise.all(Object.entries(config.clips).map(async([name,spec])=>{const m=await json(spec.folder+'/manifest.json');const images=await Promise.all(Array.from({length:m.frames},(_,n)=>image(spec.folder+'/frame_'+String(n).padStart(4,'0')+'.png')));clips[name]={...m,frames:spec.loopFrames??m.frames,fps:spec.playbackFps??m.fps,images,anchor:alignment[name],rootMotion:alignment[name].rootMotion,visualRoot:alignment[name].visualRoot,visualY:alignment[name].visualY}}));
 game=createGame(config,clips);dust=createDust(config.fx.dust);ready=true;$('#message').hidden=true;requestAnimationFrame(tick);
}catch(e){$('#message').textContent='불러오지 못했습니다: '+e.message+' · 로컬 서버 주소로 열어 주세요.';console.error(e)}
