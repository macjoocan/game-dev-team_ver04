const sum=xs=>xs.reduce((a,b)=>a+b,0);
const approach=(v,target,step)=>v<target?Math.min(target,v+step):Math.max(target,v-step);
const ease=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
const timedFrame=(t,ds)=>{let end=0;for(let i=0;i<ds.length;i++){end+=ds[i];if(t<end)return i;}return ds.length-1;};
export class FlowModel {
 constructor(feel,opts={}){this.feel=feel;this.c=feel.combat;this.f=feel.flow;this.smooth=opts.smooth!==false;this.reduced=!!opts.reduced;this.effects=opts.effects!==false;this.dustEnabled=opts.dust!==false;this.feet=opts.feet??{};this.reset();}
 reset(){Object.assign(this,{action:'idle',t:0,wall:0,x:this.c.startX,v:0,facing:1,actionFacing:1,queue:0,stop:0,gait:0,buffer:null,bridge:null,carry:0,braking:false,dustId:0});this.input={dir:0,run:false};this.hits=[];this.history=[];this.dust=[];this.contacts=new Set();}
 targetX(){return this.c.nearTargetX;}
 moving(){return ['idle','walk','run'].includes(this.action);}
 setMove(dir,run=false){this.input={dir:Math.sign(dir),run:!!run};}
 note(action,reason=''){this.history.push({action,reason,x:this.x,wall:this.wall});if(this.history.length>120)this.history.shift();}
 emit(kind,frame=0,clip=this.action){const anchor=this.feet[clip]?.[frame]??60;this.dust.push({id:++this.dustId,kind,x:this.x+(anchor-60)*this.c.zoom*this.facing,y:this.c.baseline,wall:this.wall,facing:this.facing});}
 begin(id,preserve=false){this.action=id;this.t=0;this.startX=this.x;this.actionFacing=this.facing;this.contacts=new Set();this.stop=0;this.bridge=null;this.carry=this.v;this.v=0;if(!preserve)this.queue=0;this.note(id);}
 connect(poses,next,reason){if(!this.smooth){this.finishBridge(next);return;}this.bridge={poses,next,reason};this.action='bridge';this.t=0;this.note('bridge',reason);}
 finishBridge(next){this.bridge=null;if(next==='move'){this.action=this.input.dir?(this.input.run?'run':'walk'):'idle';this.t=0;this.note(this.action,'연결 완료');}else{const q=this.queue;this.begin(next);this.queue=q;}}
 entry(id){const wasMoving=Math.abs(this.v)>20;const ref=this.visual();if(wasMoving&&id!=='evade')this.connect([{...ref,ms:16},{clip:'walk',frame:Math.floor(this.gait)%8<4?0:4,ms:24}],id,'발을 딛고 공격');else this.begin(id);}
 command(id){if(!['combo1','dash','spin','evade'].includes(id))return false;
  const a=this.action==='bridge'?this.bridge.next:this.action;
  if(id==='combo1'&&['combo1','combo2'].includes(a)){this.queue=Math.min(a==='combo1'?2:1,this.queue+1);return true;}
  if(this.moving()){this.entry(id);return true;}
  this.buffer={id,expires:this.wall+this.f.bufferMs};return true;
 }
 attack(){return this.command('combo1');}
 exit(next='move'){const a=this.action,frame=this.visual().frame;const poses=a==='combo2'?[0,1,2,3].map(frame=>({clip:'guard',frame,ms:this.f.guardMs})):[{clip:a,frame,ms:16},{clip:a,frame:Math.max(frame,6),ms:this.f.recoveryMs},{clip:a,frame:7,ms:this.f.recoveryMs}];this.queue=0;this.connect(poses,next,'공격 자세 정리');}
 locomotion(dt){const target=this.input.dir*(this.input.run?this.f.runSpeed:this.f.walkSpeed);const old=this.v;
  this.v=approach(this.v,target,(target?this.f.acceleration:this.f.deceleration)*dt/1000);
  if(this.input.dir)this.facing=this.input.dir;
  const prevX=this.x;this.x=Math.max(this.f.minX,Math.min(this.f.maxX,this.x+(old+this.v)*.5*dt/1000));const dx=this.x-prevX;if(!dx&&target)this.v=0;
  if(Math.abs(old)>30&&!target)this.braking=true;
  if(this.braking&&Math.abs(this.v)<5){const frame=Math.floor(this.gait)%8<4?0:4;this.emit('brake',frame,'walk');this.braking=false;this.gait=Math.floor(this.gait/4+1)*4;if(this.smooth){this.connect([{clip:'walk',frame,ms:24},{clip:'idle',frame:0,ms:24}],'move','발을 딛고 멈추기');return;}}
  if(target)this.braking=false;
  const action=Math.abs(this.v)>5?(this.input.run?'run':'walk'):'idle';
  if(this.action!==action){this.action=action;this.t=0;this.note(action);}
  if(action==='idle'){this.t=(this.t+dt)%sum(this.c.idleDurations);return;}
  const oldPhase=this.gait;this.gait+=Math.abs(dx)/(action==='run'?this.f.runStride:this.f.walkStride)*8;
  for(let k=Math.floor(oldPhase/4)+1;k<=Math.floor(this.gait/4);k++){const frame=(k*4)%8;this.emit(action,frame,action);}
 }
 advance(ms){let left=Math.max(0,ms);while(left>0){const dt=Math.min(left,this.c.stepMs);left-=dt;this.wall+=dt;this.dust=this.dust.filter(d=>this.wall-d.wall<this.f.dust[d.kind].life);
  if(this.buffer&&this.buffer.expires<this.wall)this.buffer=null;
  if(this.stop>0){this.stop=Math.max(0,this.stop-dt);continue;}
  if(this.moving()){this.locomotion(dt);}
  else if(this.action==='bridge'){
   this.t+=dt;const old=this.v,target=this.bridge.next==='move'?this.input.dir*(this.input.run?this.f.runSpeed:this.f.walkSpeed):0;this.v=approach(this.v,target,this.f.deceleration*dt/1000);this.x+=(old+this.v)*.5*dt/1000;
   if(this.t>=sum(this.bridge.poses.map(p=>p.ms))){const next=this.bridge.next;this.finishBridge(next);if(this.buffer&&this.moving()){const id=this.buffer.id;this.buffer=null;this.entry(id);}}
  }else{
   const old=this.t;this.t+=dt;
   if(this.action==='evade'){
    const e=this.f.evade;this.x=this.startX-this.actionFacing*e.distance*ease((this.t-e.start)/(e.end-e.start));
    if(old<e.landing&&this.t>=e.landing)this.emit('land',5,'evade');
    if(this.t>=sum(e.durations)){if(this.buffer){const id=this.buffer.id;this.buffer=null;this.begin(id);}else this.finishBridge('move');}
   }else{
    const a=this.c.clips[this.action],u=Math.min(this.t,this.f.carryMs)/this.f.carryMs;
    this.x=this.startX+this.actionFacing*a.move*ease(this.t/a.moveEnd)+this.carry*this.f.carryMs/1000*(u-u*u/2);
    for(let i=0;i<a.contacts.length;i++)if(!this.contacts.has(i)&&old<a.contacts[i]&&this.t>=a.contacts[i]){this.contacts.add(i);const dist=(this.targetX()-this.x)*this.actionFacing;if(dist>=-this.c.targetHalfWidth&&dist<=a.reach+this.c.targetHalfWidth){this.hits.push({action:this.action,wall:this.wall,x:this.targetX(),index:i,shake:a.shake,color:a.color});if(this.hits.length>100)this.hits.shift();this.stop+=a.hitStopFrames*1000/this.feel.fps;}}
    const n=Number(this.action.replace('combo','')),cancel=this.f.cancel[this.action];
    if(this.buffer&&this.t>=cancel.evade){const id=this.buffer.id;this.buffer=null;this.exit(id);}
    else if([1,2].includes(n)&&this.queue>0&&this.t>=a.chainAt){this.queue--;this.begin('combo'+(n+1),true);}
    else if(!this.queue&&this.input.dir&&this.t>=cancel.move)this.exit('move');
    else if(this.t>=sum(a.durations))this.exit('move');
   }
  }
  this.x=Math.max(this.f.minX,Math.min(this.f.maxX,this.x));
 }return this.state();}
 visual(){if(this.action==='bridge'){const p=this.bridge.poses[timedFrame(this.t,this.bridge.poses.map(p=>p.ms))];return {clip:p.clip,frame:p.frame};}if(['walk','run'].includes(this.action))return {clip:this.action,frame:Math.floor(this.gait)%8};const ds=this.action==='idle'?this.c.idleDurations:this.action==='evade'?this.f.evade.durations:this.c.clips[this.action].durations;return {clip:this.action,frame:timedFrame(this.t,ds)};}
 state(){return {action:this.action,visual:this.visual(),time:this.t,wall:this.wall,x:this.x,velocity:this.v,facing:this.facing,gait:this.gait,queued:this.queue,buffer:this.buffer?.id??null,hitCount:this.hits.length,hitStop:this.stop>0,bridge:this.bridge?.reason??null,dust:this.dust.map(d=>({...d})),history:this.history.map(h=>({...h}))};}
}
