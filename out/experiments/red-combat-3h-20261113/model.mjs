export class CombatModel {
 constructor(feel,opts={}){this.feel=feel;this.c=feel.combat;this.near=opts.near!==false;this.reduced=!!opts.reduced;this.effects=opts.effects!==false;this.reset();}
 reset(){this.action='idle';this.t=0;this.wall=0;this.x=this.c.startX;this.startX=this.x;this.queue=0;this.stop=0;this.hits=[];this.history=[];this.doneContacts=new Set();}
 targetX(){return this.near?this.c.nearTargetX:this.c.farTargetX;}
 begin(id,preserve=false){if(!this.c.clips[id])throw Error('Unknown action '+id);this.action=id;this.t=0;this.startX=this.x;this.stop=0;this.doneContacts=new Set();if(!preserve)this.queue=0;this.history.push({action:id,x:this.x,wall:this.wall});}
 attack(){if(this.action==='idle'){this.begin('combo1');return true;}const n=Number(this.action.replace('combo',''));if([1,2].includes(n)){this.queue=Math.min(3-n,this.queue+1);return true;}return false;}
 start(id,{auto=false}={}){this.reset();this.begin(id==='combo'?'combo1':id);if(auto||id==='combo')this.queue=2;}
 advance(ms){let remaining=Math.max(0,ms);while(remaining>0){const dt=Math.min(remaining,this.c.stepMs);remaining-=dt;this.wall+=dt;if(this.stop>0){this.stop=Math.max(0,this.stop-dt);continue;}if(this.action==='idle'){this.t=(this.t+dt)%this.c.idleDurations.reduce((a,b)=>a+b,0);continue;}const a=this.c.clips[this.action],old=this.t;this.t+=dt;const u=Math.min(1,this.t/a.moveEnd),ease=1-(1-u)**3;this.x=Math.min(this.c.worldLimit,this.startX+a.move*ease,this.targetX()-(a.standOff??this.c.targetStandOff));
 for(let i=0;i<a.contacts.length;i++){const at=a.contacts[i];if(!this.doneContacts.has(i)&&old<at&&this.t>=at){this.doneContacts.add(i);const hit=this.x+a.reach>=this.targetX()-this.c.targetHalfWidth&&this.x+20<=this.targetX()+this.c.targetHalfWidth;if(hit){this.hits.push({action:this.action,wall:this.wall,x:this.targetX(),index:i,shake:a.shake,color:a.color});this.stop+=a.hitStopFrames*1000/this.feel.fps;}}}
 const n=Number(this.action.replace('combo',''));if([1,2].includes(n)&&this.queue>0&&this.t>=a.chainAt){this.queue--;this.begin('combo'+(n+1),true);}else if(this.t>=a.durations.reduce((a,b)=>a+b,0)){this.action='idle';this.t=0;this.queue=0;}}
 return this.state();}
 frame(){const ds=this.action==='idle'?this.c.idleDurations:this.c.clips[this.action].durations;let total=0;for(let i=0;i<ds.length;i++){total+=ds[i];if(this.t<total)return i;}return ds.length-1;}
 state(){return {action:this.action,time:this.t,wall:this.wall,x:this.x,frame:this.frame(),queued:this.queue,hitCount:this.hits.length,hitStop:this.stop>0,reduced:this.reduced,effects:this.effects,history:this.history.map(x=>({...x}))};}
}
