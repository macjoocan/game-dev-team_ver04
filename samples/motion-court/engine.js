export function createGame(config, clips) {
 const state={player:{x:config.world.playerStart,facing:1,hp:config.world.playerHealth,action:'idle',time:0},targets:[],hits:0,totalDamage:0,freeze:0,time:0,events:[],serial:0};
 let struck=new Set();
 function reset(){state.player={x:config.world.playerStart,facing:1,hp:config.world.playerHealth,action:'idle',time:0};state.targets=config.targets.map(t=>({...t,maxHealth:t.health,stun:0,deadTime:0}));state.hits=state.totalDamage=state.freeze=state.time=0;state.events=[];struck.clear()}
 reset();
 const sample=(values,time,fps)=>{if(!values?.length)return 0;const u=Math.min(values.length-1,time*fps),i=Math.floor(u),j=Math.min(values.length-1,i+1);return values[i]+(values[j]-values[i])*(u-i)};
 const clipName=()=>state.player.action==='idle'&&!clips.idle?'walk':state.player.action;
 const frame=()=>{const p=state.player,c=clips[clipName()];return p.action==='idle'&&!clips.idle?0:Math.min(c.frames-1,Math.floor(p.time*c.fps))};
 const invulnerable=()=>{const p=state.player,window=config.clips[p.action]?.invulnerableFrames;return !!window&&frame()>=window[0]&&frame()<=window[1]};
 const visualRoot=()=>{const p=state.player,c=clips[p.action];return c?sample(c.visualRoot,p.time,c.fps):0};
 const visualY=()=>{const p=state.player,c=clips[p.action];return c?.visualY?.[frame()]??0};
 function begin(name){const p=state.player;p.action=name;p.time=0;p.actionStartX=p.x;struck.clear();state.serial++}
 function action(name){const p=state.player;if(name==='hit'){if(invulnerable())return false;p.hp=Math.max(0,p.hp-1);begin('hit');state.events.push({type:'hurt',x:p.x});return true}if(name==='roll'&&clips.roll&&!['roll','hit'].includes(p.action)){begin(name);return true}if((name==='slash'||name==='thrust')&&!['slash','thrust','hit','roll'].includes(p.action)){begin(name);return true}return false}
 function update(dt,axis=0,counterEnabled=false,running=false){
  state.events=[];state.time+=dt;
  if(state.freeze>0){state.freeze=Math.max(0,state.freeze-dt);return}
  const p=state.player;
  for(const t of state.targets){t.stun=Math.max(0,t.stun-dt);if(t.health<=0){t.deadTime+=dt;if(t.deadTime>=config.target.respawnSeconds){t.health=t.maxHealth;t.deadTime=0}}}
  if(['slash','thrust','hit','roll'].includes(p.action)){
   const spec=config.clips[p.action],clip=clips[p.action],before=p.time; p.time+=dt;
   if(clip.rootMotion)p.x=Math.max(45,Math.min(config.world.width-45,p.actionStartX+p.facing*sample(clip.rootMotion,p.time,clip.fps)));
   if(spec.activeFrames){const [a,b]=spec.activeFrames;if(p.time>=a/clip.fps&&before<(b+1)/clip.fps){for(const t of state.targets){const distance=(t.x-p.x)*p.facing;if(t.health>0&&!struck.has(t)&&distance>=-config.target.halfWidth&&distance<=spec.reach+config.target.halfWidth){struck.add(t);t.health=Math.max(0,t.health-spec.damage);t.stun=config.feel.targetStunSeconds;state.hits++;state.totalDamage+=spec.damage;state.freeze=config.feel.events.hit_light.hitStopFrames/config.feel.fps;state.events.push({type:'hit',x:t.x,damage:spec.damage,action:p.action,serial:state.serial})}}}}
   if(p.time>=clip.frames/clip.fps){p.action='idle';p.time=0;if(p.hp===0){p.hp=config.world.playerHealth;p.x=config.world.playerStart}}
  }else if(axis){const name=running&&clips.run?'run':'walk',speed=name==='run'?config.world.runSpeed:config.world.playerSpeed;p.facing=Math.sign(axis);p.x=Math.max(45,Math.min(config.world.width-45,p.x+axis*speed*dt));if(p.action!==name)p.time=0;p.action=name;p.time=(p.time+dt)%(clips[name].frames/clips[name].fps)}else {if(p.action!=='idle')p.time=0;p.action='idle';p.time=clips.idle?(p.time+dt)%(clips.idle.frames/clips.idle.fps):0}
  if(config.counter){for(const [i,t] of state.targets.entries()){const c=config.counter,cycle=Math.floor((state.time+i*c.offsetSeconds)/c.periodSeconds),phase=(state.time+i*c.offsetSeconds)%c.periodSeconds;t.telegraph=counterEnabled&&t.health>0&&phase>=c.windupStart&&phase<c.strikeStart;t.striking=counterEnabled&&t.health>0&&t.stun<=0&&phase>=c.strikeStart&&phase<c.strikeStart+c.activeSeconds;if(t.striking&&t.lastStrikeCycle!==cycle&&Math.abs(t.x-p.x)<=c.reach&&p.action!=='hit'){t.lastStrikeCycle=cycle;const dodged=invulnerable();if(!dodged)action('hit');state.events.push({type:dodged?'dodge':'enemy-hit',x:p.x})}}}
 }
 return {state,update,action,reset,frame,clipName,invulnerable,visualRoot,visualY};
}
