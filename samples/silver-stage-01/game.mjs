// Gameplay is independent of canvas/audio so timing and combat can be tested headlessly.
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function createGame(config,feel){
  return {config,feel,status:'ready',time:0,wall:0,freeze:0,wave:-1,cleared:[],enemies:[],events:[],serial:0,
    player:{x:240,y:0,vy:0,vx:0,dir:1,hp:config.player.hp,attack:null,hurt:0,invul:0,dash:0,dashCooldown:0,buffer:null,lastCombo:-Infinity,combo:0,walkTime:0,running:false},
    stats:{kills:0,hits:0,taken:0,chain:0,bestChain:0,lastHit:-Infinity,attacks:0},feedback:null};
}
function emit(g,type,data={}){g.events.push({type,time:g.wall,...data});}
export function startGame(g){if(g.status!=='ready')return;g.status='playing';spawnWave(g,0);emit(g,'start');}
function spawnWave(g,index){
  g.wave=index;const wave=g.config.waves[index];
  for(const e of wave.enemies){const c=g.config[e.type];g.enemies.push({id:++g.serial,type:e.type,x:e.x,y:0,dir:-1,hp:c.hp,maxHp:c.hp,phase:'approach',age:0,cooldown:200,stun:0,vx:0,poise:c.poise,hit:false,deadAt:null,walkTime:0});}
  emit(g,'wave',{index,name:wave.name});
}
function feedback(g,name){const f=g.feel.events[name];g.freeze=Math.max(g.freeze,f.hitStopFrames*1000/g.feel.fps);g.feedback={name,at:g.wall};}
function beginAttack(g,heavy=false){
  const p=g.player;if(p.hurt>0||p.dash>0||p.attack)return false;
  const index=heavy?3:(g.time-p.lastCombo<=g.config.player.comboWindowMs?p.combo%3:0);
  p.attack={index,elapsed:0,hitIds:[],connected:false,swingFired:false};
  p.combo=heavy?0:index+1;p.buffer=null;g.stats.attacks++;emit(g,'attack',{index});return true;
}
function hurtPlayer(g,e){
  const p=g.player,c=g.config[e.type];
  if(p.invul>0||p.dash>0||p.hp<=0)return false;
  p.hp=Math.max(0,p.hp-c.damage);p.hurt=g.config.player.hurtMs;p.invul=g.config.player.invulnerableMs;p.vx=e.dir*g.config.player.hurtKnock;
  p.attack=null;p.buffer=null;p.combo=0;g.stats.taken+=c.damage;g.stats.chain=0;
  feedback(g,'player_damaged');emit(g,'hurt',{x:p.x,y:p.y,damage:c.damage,dir:e.dir});
  if(p.hp===0){g.status='dead';emit(g,'dead');}return true;
}
function strikeEnemy(g,e,a){
  const p=g.player,s=g.config.attacks[a.index];a.hitIds.push(e.id);e.hp=Math.max(0,e.hp-s.damage);
  const armored=e.type==='boss'&&e.phase==='windup'&&e.poise>s.damage;
  e.poise=Math.max(0,e.poise-s.damage);e.vx=p.dir*s.knock*(e.type==='boss'?0.52:1);
  if(!armored){e.stun=s.staggerMs;e.phase='hurt';e.age=0;e.poise=g.config[e.type].poise;}
  if(!a.connected){feedback(g,s.feedback);a.connected=true;}
  g.stats.hits++;g.stats.chain=g.time-g.stats.lastHit<2100?g.stats.chain+1:1;g.stats.lastHit=g.time;g.stats.bestChain=Math.max(g.stats.bestChain,g.stats.chain);
  emit(g,'hit',{x:e.x,y:e.y,damage:s.damage,weight:s.weight,dir:p.dir,armored,enemyId:e.id});
  if(e.hp<=0){e.phase='dead';e.deadAt=g.wall;e.stun=0;g.stats.kills++;emit(g,'kill',{x:e.x,type:e.type});}
}
export function updateGame(g,dt,input={}){
  if(!Number.isFinite(dt)||dt<0)throw Error('Invalid dt');
  dt=Math.min(dt,50);g.wall+=dt;
  if(g.status!=='playing')return;
  const p=g.player,C=g.config;
  // One deliberate tap reserves one follow-up, even during anticipation or hit-stop.
  // Repeated taps do not accumulate a backlog after the player stops pressing.
  if(input.attack&&!input.heavy&&p.attack&&p.attack.index<3)p.attack.queued=true;
  else if(input.attack||input.heavy)p.buffer={heavy:!!input.heavy,expires:g.wall+C.player.bufferMs};
  if(g.freeze>0){const used=Math.min(dt,g.freeze);g.freeze-=used;dt-=used;if(dt===0)return;}
  g.time+=dt;const sec=dt/1000;
  for(const k of ['hurt','invul','dashCooldown'])p[k]=Math.max(0,p[k]-dt);
  if(p.buffer&&p.buffer.expires<g.wall)p.buffer=null;
  if(input.dash&&p.dashCooldown<=0&&p.hurt<=0&&(!p.attack||p.attack.elapsed>C.attacks[p.attack.index].impactMs+C.attacks[p.attack.index].activeMs)){
    if(input.move)p.dir=Math.sign(input.move);p.dash=C.player.dashMs;p.dashCooldown=C.player.dashCooldownMs;p.attack=null;p.buffer=null;emit(g,'dash',{x:p.x,y:p.y,dir:p.dir});
  }
  if(input.jump&&p.y===0&&p.hurt<=0&&p.dash<=0&&!p.attack){p.vy=C.player.jumpVelocity;emit(g,'jump');}
  if(p.buffer&&!p.attack&&p.dash<=0&&p.hurt<=0){if(input.move)p.dir=Math.sign(input.move);beginAttack(g,p.buffer.heavy);}
  p.running=!!input.run&&!!input.move&&p.y===0&&p.hurt===0&&p.dash===0&&!p.attack;
  if(p.dash>0){p.x+=p.dir*C.player.dashSpeed*sec;p.dash=Math.max(0,p.dash-dt);}
  else if(p.hurt>0){p.x+=p.vx*sec;p.vx*=Math.exp(-7*sec);}
  else if(!p.attack){const move=clamp(input.move||0,-1,1);p.x+=move*(p.running?C.player.runSpeed:C.player.speed)*(p.y<0?C.player.airControl:1)*sec;if(move){p.dir=Math.sign(move);p.walkTime+=dt*(p.running?g.feel.visual.runPlaybackRate:1);}else p.walkTime=0;}
  if(p.y<0||p.vy!==0){p.vy+=C.world.gravity*sec;p.y=Math.min(0,p.y+p.vy*sec);if(p.y===0){p.vy=0;emit(g,'land');}}
  if(p.attack){
    const a=p.attack,s=C.attacks[a.index];a.elapsed+=dt;
    if(!a.swingFired&&a.elapsed>=s.impactMs-30){a.swingFired=true;emit(g,'swing',{x:p.x,y:p.y,index:a.index,dir:p.dir});}
    if(a.elapsed>=s.impactMs-30&&a.elapsed<=s.impactMs+s.activeMs)p.x+=p.dir*s.lunge*sec;
    if(a.elapsed>=s.impactMs&&a.elapsed<=s.impactMs+s.activeMs){
      for(const e of g.enemies){const dx=(e.x-p.x)*p.dir;if(e.hp>0&&!a.hitIds.includes(e.id)&&dx>=-C[e.type].halfWidth&&dx<=s.range+C[e.type].halfWidth&&p.y>-165)strikeEnemy(g,e,a);}
    }
    if(a.queued&&a.elapsed>=s.chainAtMs){p.attack=null;p.lastCombo=g.time;beginAttack(g);}
    else if(a.elapsed>=s.durationMs){p.attack=null;p.lastCombo=g.time;if(p.buffer)beginAttack(g,p.buffer.heavy);}
  }
  const gate=g.wave>=0&&!g.cleared.includes(g.wave)?C.waves[g.wave].gate:C.world.width-80;
  p.x=clamp(p.x,80,gate);
  for(const e of g.enemies){
    const c=C[e.type];e.x=clamp(e.x+e.vx*sec,80,C.world.width-100);e.vx*=Math.exp(-6*sec);
    if(e.hp<=0)continue;
    if(e.stun>0){e.stun=Math.max(0,e.stun-dt);e.age+=dt;if(e.stun===0){e.phase='approach';e.age=0;e.cooldown=180;}continue;}
    e.cooldown=Math.max(0,e.cooldown-dt);e.age+=dt;
    if(e.phase==='approach'){
      e.dir=p.x>=e.x?1:-1;const distance=Math.abs(p.x-e.x);
      if(distance>c.range-15){e.x+=e.dir*c.speed*sec;e.walkTime+=dt;}
      else if(e.cooldown===0&&p.y>-120){e.phase='windup';e.age=0;e.hit=false;e.poise=c.poise;emit(g,'windup',{id:e.id,x:e.x,type:e.type});}
    }else if(e.phase==='windup'&&e.age>=c.windupMs){e.phase='strike';e.age=0;emit(g,'enemySwing',{x:e.x,dir:e.dir,type:e.type});}
    else if(e.phase==='strike'){
      const dx=(p.x-e.x)*e.dir;
      if(!e.hit&&dx>-32&&dx<c.range&&p.y>-145){e.hit=true;hurtPlayer(g,e);}
      if(e.age>=c.activeMs){e.phase='recover';e.age=0;}
    }else if(e.phase==='recover'&&e.age>=c.recoveryMs){e.phase='approach';e.age=0;e.cooldown=c.cooldownMs;}
  }
  // Avoid perfect enemy overlap without moving the player or changing attack directions.
  const alive=g.enemies.filter(e=>e.hp>0);
  if(p.dash===0&&p.y>-150){for(const e of alive){const d=e.x-p.x,minimum=C[e.type].halfWidth+32;if(Math.abs(d)<minimum){const direction=d>=0?1:-1;e.x=p.x+direction*minimum;}}}
  for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){const d=alive[j].x-alive[i].x;if(Math.abs(d)<45){const push=(45-Math.abs(d))*0.5*(d>=0?1:-1);alive[j].x+=push;alive[i].x-=push;}}
  if(g.status!=='playing')return;
  if(alive.length===0&&!g.cleared.includes(g.wave)){
    g.cleared.push(g.wave);p.hp=Math.min(C.player.hp,p.hp+C.waves[g.wave].heal);emit(g,'waveClear',{index:g.wave});
  }
  const next=g.wave+1;if(next<C.waves.length&&g.cleared.includes(g.wave)&&p.x>=C.waves[next].trigger)spawnWave(g,next);
  if(g.cleared.length===C.waves.length&&p.x>=C.world.exit){g.status='won';emit(g,'victory');}
}
export function playerPose(g){
  const p=g.player;
  if(g.status==='dead')return {clip:'hero-poses',frame:5};
  if(p.hurt>0)return {clip:'hero-poses',frame:p.hurt>g.config.player.hurtMs*0.45?1:2};
  if(p.dash>0)return {clip:'hero-poses',frame:3};
  if(p.attack){const s=g.config.attacks[p.attack.index],t=p.attack.elapsed;
    if(p.attack.index===3&&t<s.impactMs-40)return {clip:'hero-poses',frame:4};
    const {before,after}=g.feel.visual.attackPoses[p.attack.index];
    const frame=t<s.impactMs?before[Math.min(before.length-1,Math.floor(t/s.impactMs*before.length))]:after[Math.min(after.length-1,Math.floor((t-s.impactMs)/(s.durationMs-s.impactMs)*after.length))];
    return {clip:'hero-attack',frame};
  }
  if(p.y<0)return {clip:'hero-poses',frame:3};
  return p.walkTime>0?{clip:'hero-walk',frame:Math.floor(p.walkTime/g.feel.visual.walkFrameMs)%26}:{clip:'hero-walk',frame:0};
}
export function enemyPose(g,e){
  if(e.hp<=0)return 7;if(e.stun>0)return 6;
  return {windup:3,strike:4,recover:5}[e.phase]??(Math.floor(e.walkTime/g.feel.visual.enemyWalkFrameMs)%2+1);
}
