// World-space particles: no sprite bounds, alpha mask, or facing flip.
export function createDust(spec){
 let particles=[],lastSerial=-1,lastFrame=-1;
 function clear(){particles=[];lastSerial=-1;lastFrame=-1}
 function update(dt,player,serial,frame,enabled,floor){
  particles=particles.map(p=>({...p,age:p.age+dt,x:p.x+p.vx*dt,y:p.y+p.vy*dt})).filter(p=>p.age<spec.lifeSeconds);
  if(!enabled){particles=[];lastSerial=serial;lastFrame=frame;return}
  if(player.action==='roll'&&(serial!==lastSerial||(lastFrame<spec.landingFrame&&frame>=spec.landingFrame))){
   for(let i=0;i<spec.count;i++)particles.push({x:player.x-player.facing*(8+i*3),y:floor-3,vx:-player.facing*(spec.speed+i*5),vy:-8-i*3,radius:2+i%3,age:0});
  }
  lastSerial=serial;lastFrame=frame;
 }
 function draw(ctx){for(const p of particles){ctx.globalAlpha=spec.opacity*(1-p.age/spec.lifeSeconds);ctx.fillStyle=spec.color;ctx.beginPath();ctx.ellipse(p.x,p.y,p.radius+p.age*5,p.radius*.6+p.age*2,0,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}
 return {update,draw,clear,get particles(){return particles}};
}
