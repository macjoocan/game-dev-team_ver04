import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createGame} from '../samples/motion-court/engine.js';
import {createDust} from '../samples/motion-court/dust.js';
const root='samples/motion-court',config=JSON.parse(fs.readFileSync(root+'/config.json')),clips={};
const alignment=JSON.parse(fs.readFileSync(root+'/alignment.json'));
for(const [n,s] of Object.entries(config.clips)){const m=JSON.parse(fs.readFileSync(root+'/'+s.folder+'/manifest.json'));clips[n]={...m,frames:s.loopFrames??m.frames,fps:s.playbackFps??m.fps,rootMotion:alignment[n].rootMotion,visualRoot:alignment[n].visualRoot,visualY:alignment[n].visualY}}
const g=createGame(config,clips),checks=[];const test=(name,fn)=>{fn();checks.push({name,result:'pass'})};
const step=seconds=>{for(let t=0;t<seconds;t+=1/120)g.update(1/120)};
test('one hit per target per attack',()=>{g.state.player.x=500;g.action('slash');step(2);assert.equal(g.state.hits,1);assert.equal(g.state.targets[0].health,90)});
test('attack remains locked and ignores movement',()=>{g.reset();g.state.player.x=500;assert.equal(g.action('slash'),true);assert.equal(g.action('thrust'),false);g.update(.1,1);assert.equal(g.state.player.x,500)});
test('attack misses target behind player',()=>{g.reset();g.state.player.x=500;g.state.player.facing=-1;g.action('slash');step(2);assert.equal(g.state.hits,0)});
test('left facing attack hits target on left',()=>{g.reset();g.state.player.x=700;g.state.player.facing=-1;g.action('thrust');step(1.4);assert.equal(g.state.hits,1);assert.equal(g.state.targets[0].health,98)});
test('hurt interrupts attack and recovers to idle',()=>{g.reset();g.action('slash');g.action('hit');assert.equal(g.state.player.hp,4);step(1.5);assert.equal(g.state.player.action,'idle')});
test('defeated target respawns',()=>{g.reset();g.state.targets[0].health=0;step(3);assert.equal(g.state.targets[0].health,120)});
test('movement stays inside world and updates facing',()=>{g.reset();for(let i=0;i<200;i++)g.update(.1,-1);assert.equal(g.state.player.x,45);assert.equal(g.state.player.facing,-1)});
test('run uses a distinct clip and configured faster movement',()=>{g.reset();g.update(.2,1,false,true);assert.equal(g.state.player.action,'run');assert.equal(g.state.player.x,config.world.playerStart+config.world.runSpeed*.2);assert.ok(config.world.runSpeed>config.world.playerSpeed)});
test('releasing sprint returns to accepted walk and stopping to idle',()=>{g.reset();g.update(.1,-1,false,true);g.update(.1,-1);assert.equal(g.state.player.action,'walk');assert.equal(g.state.player.facing,-1);g.update(.1);assert.equal(g.state.player.action,'idle')});
test('run loops without selecting the duplicate closing frame',()=>{g.reset();for(let i=0;i<150;i++){g.update(.01,1,false,true);assert.ok(g.frame()<config.clips.run.loopFrames)}assert.equal(g.state.player.action,'run')});
test('run input cannot interrupt attack or roll',()=>{g.reset();g.action('roll');g.update(.1,1,false,true);assert.equal(g.state.player.action,'roll');g.reset();g.action('thrust');g.update(.1,1,false,true);assert.equal(g.state.player.action,'thrust')});
test('dust lives in world space and trails both roll directions',()=>{for(const facing of [-1,1]){const dust=createDust(config.fx.dust),p={x:200,facing,action:'roll'};dust.update(0,p,1,0,true,config.world.floor);assert.equal(dust.particles.length,config.fx.dust.count);assert.ok(dust.particles.every(q=>(q.x-p.x)*facing<0&&q.vx*facing<0));dust.update(.2,p,1,5,true,config.world.floor);assert.equal(dust.particles.length,config.fx.dust.count);dust.update(.5,{...p,action:'idle'},1,0,true,config.world.floor);assert.equal(dust.particles.length,0)}});
test('dust toggle and reduced effects disable particles without altering roll',()=>{const dust=createDust(config.fx.dust),p={x:200,facing:1,action:'roll'};dust.update(0,p,1,0,true,400);dust.update(.01,p,1,1,false,400);assert.equal(dust.particles.length,0);assert.equal(p.action,'roll')});
if(clips.idle){
 test('idle animates while keeping world position and facing fixed',()=>{g.reset();g.state.player.facing=-1;g.update(3/clips.idle.fps);assert.equal(g.state.player.action,'idle');assert.equal(g.clipName(),'idle');assert.equal(g.frame(),3);assert.equal(g.state.player.x,config.world.playerStart);assert.equal(g.state.player.facing,-1)});
 test('idle wraps its loop without holding the closing frame',()=>{g.reset();g.update(clips.idle.frames/clips.idle.fps+2.25/clips.idle.fps);assert.equal(g.frame(),2);assert.equal(g.state.player.action,'idle')});
 test('movement exits idle immediately and stopping restarts idle',()=>{g.reset();g.update(.5);g.update(.1,1);assert.equal(g.state.player.action,'walk');g.update(.01);assert.equal(g.state.player.action,'idle');assert.equal(g.frame(),0)});
 test('attack exits idle immediately and resets attack timing',()=>{g.reset();g.update(.8);assert.equal(g.action('slash'),true);assert.equal(g.frame(),0);assert.equal(g.state.player.time,0)});
 test('roll recovery returns to animated idle at its final world position',()=>{g.reset();g.action('roll');step(1.3);assert.equal(g.clipName(),'idle');assert.ok(g.frame()>0);assert.equal(g.state.player.x,config.world.playerStart+config.clips.roll.travelPx)});
 test('idle emits no damage or dust events',()=>{g.reset();step(3);assert.equal(g.state.hits,0);assert.deepEqual(g.state.events,[]);assert.equal(g.state.player.hp,config.world.playerHealth)});
}
test('slash world position remains at terminal root after recovery',()=>{g.reset();g.state.player.x=200;g.action('slash');step(2);const expected=200+clips.slash.rootMotion.at(-1);assert.equal(g.state.player.x,expected);g.update(.1);assert.equal(g.state.player.x,expected)});
test('slash end torso anchor joins idle with no horizontal snap',()=>{const a=alignment.slash;assert.equal(a.endAnchorX-a.x-a.visualRoot.at(-1),0)});
if(clips.roll){
 test('roll travels forward and keeps final position',()=>{g.reset();g.action('roll');step(1);assert.equal(g.state.player.x,config.world.playerStart+config.clips.roll.travelPx);g.update(.1);assert.equal(g.state.player.x,config.world.playerStart+config.clips.roll.travelPx)});
 test('roll invulnerability blocks damage during tuck',()=>{g.reset();g.action('roll');g.update(8/clips.roll.fps);assert.equal(g.invulnerable(),true);assert.equal(g.action('hit'),false);assert.equal(g.state.player.hp,config.world.playerHealth)});
 test('roll recovery can take damage',()=>{g.reset();g.action('roll');g.update(21/clips.roll.fps);assert.equal(g.invulnerable(),false);assert.equal(g.action('hit'),true);assert.equal(g.state.player.hp,config.world.playerHealth-1)});
 test('roll cancels slash without resetting existing root travel',()=>{g.reset();g.action('slash');g.update(.5);const x=g.state.player.x;assert.equal(g.action('roll'),true);assert.equal(g.state.player.x,x);assert.equal(g.state.player.action,'roll')});
 test('enemy telegraph strike damages player in range',()=>{g.reset();g.state.player.x=config.targets[0].x;g.state.time=config.counter.strikeStart-.01;g.update(.02,0,true);assert.equal(g.state.player.hp,config.world.playerHealth-1)});
 test('enemy strike is avoided during roll invulnerability',()=>{g.reset();g.state.player.x=config.targets[0].x;g.action('roll');g.state.player.time=8/clips.roll.fps;g.state.time=config.counter.strikeStart-.01;g.update(.02,0,true);assert.equal(g.state.player.hp,config.world.playerHealth);assert.equal(g.state.events.some(e=>e.type==='dodge'),true)});
 test('enemy attack applies at most one hit per cycle',()=>{g.reset();g.state.player.x=config.targets[0].x;g.state.time=config.counter.strikeStart-.01;g.update(.02,0,true);for(let i=0;i<10;i++)g.update(.01,0,true);assert.equal(g.state.player.hp,config.world.playerHealth-1)});
}
const report={status:'pass',checks,browser_visual:'pending',scope:'headless combat invariants and served files; not human motion approval'};console.log(JSON.stringify(report,null,2));
