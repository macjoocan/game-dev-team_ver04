import {createGame,startGame,updateGame,playerPose,enemyPose,clamp} from './game.mjs';
import {createMovement} from './movement.mjs';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
let config,feel,manifest,game,ready=false,paused=false,last=performance.now(),camera=0,audio,soundOn=true,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const images={},held=new Set(),pending={},effects=[],ghosts=[];let toastUntil=0,resultAt=null;
let movement;
function json(url){return fetch(url).then(r=>{if(!r.ok)throw Error(`${url}: ${r.status}`);return r.json()});}
function loadImage(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error(`이미지를 읽지 못했습니다: ${url}`));i.src=url});}
try{
  [config,feel,manifest]=await Promise.all(['config.json','feel.json','assets/manifest.json'].map(json));
  await Promise.all([loadImage('assets/background.jpg').then(i=>images.background=i),...Object.entries(manifest.clips).map(async([k,c])=>images[k]=await loadImage(c.url))]);
  movement=createMovement(config.player.runDoubleTapMs);game=createGame(config,feel);ready=true;$('start').disabled=false;$('start-label').textContent='성문으로 들어가기';
}catch(e){$('load-error').hidden=false;$('load-error').textContent=e.message;$('start-label').textContent='준비하지 못했습니다';console.error(e);}
function toast(text,ms=2200){$('toast').textContent=text;$('toast').classList.add('visible');toastUntil=game.wall+ms;}
function start(){if(!ready)return;audio??=new AudioContext();audio.resume();game=createGame(config,feel);camera=0;effects.length=0;ghosts.length=0;held.clear();movement?.reset();for(const k of Object.keys(pending))delete pending[k];paused=false;resultAt=null;startGame(game);$('overlay').hidden=true;$('result').hidden=true;$('paused').hidden=true;$('hud').hidden=false;$('pause').disabled=false;canvas.focus();}
$('start').onclick=start;$('restart').onclick=start;
function pause(){if(!ready||game.status!=='playing')return;paused=!paused;$('paused').hidden=!paused;$('pause').firstChild.textContent=paused?'계속하기 ':'일시 정지 ';held.clear();movement?.reset();if(!paused)canvas.focus();}
$('pause').onclick=pause;$('resume').onclick=pause;
$('sound').onclick=()=>{soundOn=!soundOn;$('sound').textContent=soundOn?'소리 켜짐':'소리 꺼짐';$('sound').setAttribute('aria-pressed',String(soundOn));};
function setReduced(value){reduced=value;$('reduced').setAttribute('aria-pressed',String(reduced));$('reduced').textContent=reduced?'흔들림 감소 중':'흔들림 줄이기';}
setReduced(reduced);$('reduced').onclick=()=>setReduced(!reduced);
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('game-shell').requestFullscreen?.();};
const actionKeys={KeyJ:'attack',KeyK:'heavy',ShiftLeft:'dash',ShiftRight:'dash',Space:'jump'};
document.addEventListener('keydown',e=>{if(e.code==='Escape'){pause();return;}if(!ready||game.status!=='playing'||paused)return;if(['KeyA','KeyD','ArrowLeft','ArrowRight',...Object.keys(actionKeys)].includes(e.code)){e.preventDefault();if(!e.repeat){movement.down(e.code,performance.now());if(actionKeys[e.code])pending[actionKeys[e.code]]=true;}held.add(e.code);}});
document.addEventListener('keyup',e=>{held.delete(e.code);movement?.up(e.code);});
window.addEventListener('blur',()=>{held.clear();movement?.reset();if(ready&&game.status==='playing'&&!paused)pause();});
document.querySelectorAll('[data-action],[data-hold]').forEach(b=>{
  b.onpointerdown=e=>{e.preventDefault();if(!ready||paused||game.status!=='playing')return;b.setPointerCapture(e.pointerId);if(b.dataset.action)pending[b.dataset.action]=true;else {const key=b.dataset.hold==='left'?'KeyA':'KeyD';held.add(key);movement.down(key,performance.now());}};
  const release=()=>{if(b.dataset.hold){const key=b.dataset.hold==='left'?'KeyA':'KeyD';held.delete(key);movement?.up(key);}};b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;
});
function playSound(kind,weight=1){
  if(!soundOn||!audio||audio.state!=='running')return;
  const now=audio.currentTime,heavy=weight>=3,gain=audio.createGain();gain.connect(audio.destination);
  const duration=kind==='swing'?.11:heavy?.19:.13;gain.gain.setValueAtTime(kind==='swing'?.08:.19,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  const noise=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),data=noise.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
  const source=audio.createBufferSource(),filter=audio.createBiquadFilter();source.buffer=noise;filter.type='bandpass';filter.frequency.setValueAtTime(kind==='swing'?2200:kind==='hurt'?380:1500,now);filter.frequency.exponentialRampToValueAtTime(kind==='swing'?650:220,now+duration);filter.Q.value=kind==='swing'?.6:1.3;source.connect(filter);filter.connect(gain);source.start(now);
  if(kind!=='swing'){const bass=audio.createOscillator(),g=audio.createGain();bass.type='triangle';bass.frequency.setValueAtTime(heavy?130:210,now);bass.frequency.exponentialRampToValueAtTime(42,now+.12);g.gain.setValueAtTime(.14,now);g.gain.exponentialRampToValueAtTime(.001,now+.15);bass.connect(g);g.connect(audio.destination);bass.start(now);bass.stop(now+.16);}
}
function handleEvents(){
  for(const e of game.events){
    if(e.type==='wave')toast(`${String(e.index+1).padStart(2,'0')}  ·  ${e.name}`,2600);
    if(e.type==='waveClear')toast(e.index===2?'성문이 열렸습니다  →':'길이 열렸습니다  ·  체력 회복',2300);
    if(e.type==='swing'){effects.push({kind:'slash',at:game.wall,x:e.x+e.dir*feel.visual.slashOffsetX,y:config.view.ground+e.y-feel.visual.impactY,dir:e.dir,index:e.index,weight:e.index===3?4:e.index+1});playSound('swing');}
    if(e.type==='hit'){effects.push({kind:'spark',at:game.wall,x:e.x,y:config.view.ground+e.y-110,dir:e.dir,weight:e.weight});effects.push({kind:'number',at:game.wall,x:e.x,y:config.view.ground+e.y-175,damage:e.damage,weight:e.weight,armored:e.armored});playSound('hit',e.weight);const enemy=game.enemies.find(x=>x.id===e.enemyId);if(enemy)enemy.flashAt=game.wall;}
    if(e.type==='hurt'){effects.push({kind:'spark',at:game.wall,x:e.x,y:config.view.ground+e.y-100,dir:-e.dir,weight:1});game.player.flashAt=game.wall;playSound('hurt');}
    if(e.type==='dash')playSound('swing');
    if(e.type==='dead'||e.type==='victory'){resultAt=game.wall+900;$('pause').disabled=true;}
  }game.events.length=0;
}
function sprite(name,frame,x,y,scale,flip=1,{alpha=1,angle=0,bright=0}={}){
  const m=manifest.clips[name],im=images[name];if(!m||!im)return;
  frame=clamp(frame,0,m.count-1);ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(flip,1);if(angle)ctx.rotate(angle);ctx.globalAlpha=alpha;ctx.imageSmoothingEnabled=false;if(bright)ctx.filter=`brightness(${1+bright})`;
  ctx.drawImage(im,(frame%m.columns)*m.width,Math.floor(frame/m.columns)*m.height,m.width,m.height,-m.anchor[0]*scale,-m.anchor[1]*scale,m.width*scale,m.height*scale);ctx.restore();
}
function bg(){
  const im=images.background;if(!im){ctx.fillStyle='#101d29';ctx.fillRect(0,0,1280,720);return;}
  // Source floor y=840/1024 maps to the shared gameplay baseline.
  const drawW=1280,scale=drawW/im.width,drawH=im.height*scale,offsetY=config.view.ground-840*scale;
  ctx.imageSmoothingEnabled=false;ctx.drawImage(im,0,Math.round(offsetY),drawW,drawH);
  ctx.fillStyle='#07121b55';ctx.fillRect(0,0,1280,720);
  const vignette=ctx.createLinearGradient(0,0,0,720);vignette.addColorStop(0,'#06111a66');vignette.addColorStop(.3,'#06111a00');vignette.addColorStop(1,'#03080b77');ctx.fillStyle=vignette;ctx.fillRect(0,0,1280,720);
  // Ground is sampled from the generated stone pavement and tiled in world space.
  const groundW=768,ox=-(camera%groundW);for(let i=-1;i<3;i++)ctx.drawImage(im,0,840,1536,184,Math.round(ox+i*groundW),config.view.ground,groundW,150);
}
function shadow(x,scale,alpha=.25){ctx.fillStyle=`rgba(0,0,0,${alpha})`;ctx.beginPath();ctx.ellipse(x,config.view.ground+2,30*scale,7*scale,0,0,Math.PI*2);ctx.fill();}
function renderEnemy(e){
  const x=e.x-camera,c=config[e.type],scale=e.type==='boss'?config.view.bossScale:config.view.enemyScale;if(x<-250||x>1500)return;
  const deathAge=e.deadAt===null?0:game.wall-e.deadAt;if(e.hp<=0&&deathAge>feel.visual.deathFadeMs)return;
  let alpha=e.hp>0?1:clamp(1-(deathAge-500)/(feel.visual.deathFadeMs-500),0,1);
  shadow(x,scale*.6,alpha*.27);
  if(e.phase==='windup'){
    const progress=clamp(e.age/c.windupMs,0,1);ctx.save();ctx.translate(x,config.view.ground);ctx.scale(e.dir,1);ctx.fillStyle=`rgba(222,139,80,${.10+progress*.14})`;ctx.fillRect(0,-6,c.range,9);ctx.fillStyle='#d8b173';ctx.fillRect(0,1,c.range*progress,2);ctx.restore();
    ctx.fillStyle='#e0ba84';ctx.font='bold 27px Georgia';ctx.textAlign='center';ctx.fillText(e.type==='boss'?'!!':'!',x,config.view.ground-110*scale-12);
  }
  const age=game.wall-(e.flashAt??-9999),bright=!reduced&&age<feel.events.hit_light.flash.durationMs?.75:0;
  const angle=e.stun>0&&!reduced?-e.dir*.075*Math.exp(-e.age/180):0;
  sprite(e.type,enemyPose(game,e),x,config.view.ground,scale,-e.dir,{alpha,angle,bright});
  if(e.hp>0&&e.hp<e.maxHp&&e.type!=='boss'){
    const y=config.view.ground-110*scale-12;ctx.fillStyle='#091018e0';ctx.fillRect(x-28,y,56,4);ctx.fillStyle='#b7926d';ctx.fillRect(x-28,y,56*e.hp/e.maxHp,4);
  }
}
function renderFx(){
  for(let i=effects.length-1;i>=0;i--){const e=effects[i],age=game.wall-e.at,life=e.kind==='number'?feel.visual.damageNumberMs:e.kind==='slash'?feel.visual.slashDurationMs:feel.visual.sparkDurationMs;if(age>=life){effects.splice(i,1);continue;}
    const t=age/life,x=e.x-camera;
    if(e.kind==='number'){ctx.globalAlpha=1-t*t;ctx.textAlign='center';ctx.font=`${e.weight>=3?'bold 29px':'bold 21px'} Georgia`;ctx.lineWidth=4;ctx.strokeStyle='#091019';ctx.fillStyle=e.weight>=3?'#efcc86':'#ecead9';ctx.strokeText(String(e.damage),x,e.y-t*48);ctx.fillText(String(e.damage),x,e.y-t*48);if(e.armored){ctx.font='10px Arial';ctx.fillStyle='#adbed1';ctx.fillText('버팀',x,e.y-t*48+15);}ctx.globalAlpha=1;}
    else if(e.kind==='slash'){const phase=e.index===1?3-Math.min(3,Math.floor(t*4)):Math.min(3,Math.floor(t*4));sprite('fx',phase,x,e.y,feel.visual.slashScales[e.index],-e.dir,{alpha:reduced?.42:.85,angle:feel.visual.slashAngles[e.index]});}
    else sprite('fx',4+Math.min(3,Math.floor(t*4)),x,e.y,e.weight>=3?1.7:1.15,e.dir,{alpha:reduced?.45:1});
  }
}
function render(){
  if(!ready)return;ctx.clearRect(0,0,1280,720);ctx.save();
  const f=game.feedback&&feel.events[game.feedback.name],age=game.feedback?game.wall-game.feedback.at:Infinity;
  if(!reduced&&f&&age<f.shake.durationMs){const fall=(1-age/f.shake.durationMs)**2;ctx.translate(Math.sin(age*feel.visual.shakeFrequency)*f.shake.amplitudePx*fall,Math.cos(age*.19)*f.shake.amplitudePx*.4*fall);}
  bg();
  if(game.status==='ready'){ctx.restore();return;}
  // World markers and gate are graphic gameplay signals over GPT environment art.
  const wave=config.waves[Math.max(0,game.wave)],locked=game.status==='playing'&&!game.cleared.includes(game.wave);
  if(locked){const gx=wave.gate-camera;if(gx>-20&&gx<1300){ctx.fillStyle='#c6a77e33';ctx.fillRect(gx,config.view.ground-200,3,200);ctx.fillStyle='#d5b482';ctx.font='18px Georgia';ctx.textAlign='center';ctx.fillText('◇',gx,config.view.ground-210);}}
  if(game.cleared.length===config.waves.length){const x=config.world.exit-camera;ctx.strokeStyle='#c5dac383';ctx.lineWidth=3;ctx.strokeRect(x-32,config.view.ground-190,64,190);ctx.fillStyle='#adcabb18';ctx.fillRect(x-30,config.view.ground-188,60,188);ctx.fillStyle='#dfdfbd';ctx.font='13px Arial';ctx.textAlign='center';ctx.fillText('성문 밖으로 →',x,config.view.ground-213);}
  for(const e of game.enemies)renderEnemy(e);
  const p=game.player,pose=playerPose(game),x=p.x-camera;
  if(!reduced){for(let i=ghosts.length-1;i>=0;i--){const z=ghosts[i],t=(game.wall-z.at)/feel.visual.afterimageMs;if(t>=1){ghosts.splice(i,1);continue;}sprite(z.clip,z.frame,z.x-camera,z.y,config.view.heroScale,z.dir,{alpha:.2*(1-t)});}}
  shadow(x,1.1,Math.max(.05,.3+p.y/1200));
  const hurtFlash=!reduced&&game.wall-(p.flashAt??-9999)<feel.events.player_damaged.flash.durationMs;
  const runBob=p.running&&!reduced?-Math.abs(Math.sin(p.walkTime/feel.visual.walkFrameMs*Math.PI/13))*feel.visual.runBobPx:0;
  sprite(pose.clip,pose.frame,x,config.view.ground+p.y+runBob,config.view.heroScale,p.dir,{angle:p.running?feel.visual.runLean:0,alpha:p.invul>0&&p.hurt===0?.65+.3*Math.abs(Math.sin(game.time*.018)):1,bright:hurtFlash?.7:0});
  renderFx();ctx.restore();
}
function hud(){
  const p=game.player;const ratio=p.hp/config.player.hp;$('hp-fill').style.transform=`scaleX(${ratio})`;$('hp-trail').style.transform=`scaleX(${ratio})`;$('hp-label').textContent=`${p.hp} / ${config.player.hp}`;
  $('dash-fill').style.transform=`scaleX(${1-p.dashCooldown/config.player.dashCooldownMs})`;$('dash-label').textContent=p.dashCooldown>0?'회피 회복 중':'회피 준비 · Shift';
  const w=Math.max(0,game.wave),alive=game.enemies.filter(e=>e.hp>0);$('chapter').textContent=`0${w+1} / 03`;$('objective').textContent=config.waves[w].name;$('objective-detail').textContent=game.cleared.includes(w)?w===2?'열린 성문으로 이동하세요 →':'다음 회랑으로 이동하세요 →':`남은 적 ${alive.length} · 준비 자세를 보고 반격`;
  $('chain').hidden=game.stats.chain<2||game.time-game.stats.lastHit>2100;$('chain-count').textContent=game.stats.chain;
  const boss=alive.find(e=>e.type==='boss');$('bossbar').hidden=!boss;if(boss)$('boss-hp').style.transform=`scaleX(${boss.hp/boss.maxHp})`;
  if(game.wall>toastUntil)$('toast').classList.remove('visible');
  if(resultAt&&game.wall>=resultAt&&$('result').hidden){const win=game.status==='won';$('result').hidden=false;$('result-eyebrow').textContent=win?'CHAPTER I · COMPLETE':'THE ECHO REMAINS';$('result-title').textContent=win?'성문 너머로':'다시, 검을 들고';$('result-copy').textContent=win?'수문장이 쓰러지고 달빛 아래 길이 열렸습니다.':'공격 준비를 보고 회피하세요. 강공격으로 경직을 만들 수 있습니다.';$('result-stats').innerHTML=`<div><strong>${game.stats.kills}</strong><small>쓰러뜨린 적</small></div><div><strong>${game.stats.bestChain}</strong><small>최대 연속 명중</small></div><div><strong>${Math.floor(game.time/1000)}s</strong><small>전투 시간</small></div>`;}
}
let accumulator=0,ghostAt=0;
function frame(now){
  const elapsed=Math.min(100,now-last);last=now;
  if(ready&&!paused){accumulator+=elapsed;let first=true;while(accumulator>=1000/60){const input={...movement.state,...(first?pending:{})};updateGame(game,1000/60,input);if(first){for(const k of Object.keys(pending))delete pending[k];first=false;}handleEvents();accumulator-=1000/60;}
    if(game.status==='playing'){const target=clamp(game.player.x-420,0,config.world.width-1280);camera+=(target-camera)*(1-Math.exp(-feel.visual.cameraEase*elapsed/1000));}
    if(!reduced&&game.player.dash>0&&game.wall-ghostAt>35){const pose=playerPose(game);ghosts.push({...pose,x:game.player.x,y:config.view.ground+game.player.y,dir:game.player.dir,at:game.wall});ghostAt=game.wall;}
    hud();
  }render();requestAnimationFrame(frame);
}
window.stageDebug={get state(){return {ready,paused,status:game?.status,time:game?.time,wall:game?.wall,freeze:game?.freeze,camera,wave:game?.wave,cleared:game?.cleared,player:game?structuredClone(game.player):null,enemies:game?structuredClone(game.enemies):[],stats:game?.stats,loaded:Object.keys(images),reduced};},start,pause,setReduced,press(action){pending[action]=true;},hold(key,value){if(value){held.add(key);movement.down(key,performance.now());}else{held.delete(key);movement.up(key);}},render};
requestAnimationFrame(frame);
