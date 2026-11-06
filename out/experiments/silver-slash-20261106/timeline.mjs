export function compileClip(spec) {
  if(spec.sourceFrames.length!==spec.durations.length||spec.durations.some(d=>!(d>0)))throw Error('Invalid frame durations');
  let sum=0;const frames=spec.sourceFrames.map((source,i)=>{const f={source,start:sum,end:sum+spec.durations[i]};sum=f.end;return f;});
  const contact=frames.find(f=>f.source===spec.impactSourceFrame);
  if(!contact)throw Error('Missing impact pose');
  return {...spec,frames,totalMs:sum,impactMs:contact.start};
}
export function frameAt(clip,time){return (clip.frames.find(f=>time<f.end)||clip.frames.at(-1)).source;}
export class Attack {
  constructor(clip,{hitStopMs=0,hit=false}={}){this.clip=clip;this.hitStopMs=hitStopMs;this.hit=hit;this.time=0;this.wallTime=0;this.contactFired=false;this.hits=0;this.freeze=0;this.impactWall=null;this.done=false;}
  advance(dt){
    if(!(dt>=0))throw Error('Invalid elapsed time');
    this.wallTime+=dt;
    if(this.done)return;
    if(this.freeze>0){const used=Math.min(dt,this.freeze);this.freeze-=used;dt-=used;}
    if(!this.contactFired&&this.time+dt>=this.clip.impactMs){
      const before=Math.max(0,this.clip.impactMs-this.time);dt-=before;this.time=this.clip.impactMs;this.contactFired=true;this.impactWall=this.wallTime-dt;
      if(this.hit){this.hits=1;this.freeze=this.hitStopMs;const used=Math.min(dt,this.freeze);dt-=used;this.freeze-=used;}
    }
    this.time=Math.min(this.clip.totalMs,this.time+dt);this.done=this.time>=this.clip.totalMs;
  }
  get frame(){return frameAt(this.clip,this.time);}
}
