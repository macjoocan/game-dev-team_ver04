import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGame,startGame,updateGame,playerPose} from './game.mjs';
import {createMovement} from './movement.mjs';
const config=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url)));
const feel=JSON.parse(fs.readFileSync(new URL('./feel.json',import.meta.url)));
function setup(){const g=createGame(structuredClone(config),feel);startGame(g);return g;}
function tick(g,ms,input={}){for(let t=0;t<ms;t+=10)updateGame(g,Math.min(10,ms-t),typeof input==='function'?input(g,t):t===0?input:{});}
function solo(g,x=350){g.enemies.splice(1);const e=g.enemies[0];e.x=x;e.cooldown=99999;e.phase='approach';return e;}
test('light contact occurs at configured impact; a miss does not freeze',()=>{const g=setup();solo(g,900);tick(g,124,{attack:true});assert.equal(g.stats.hits,0);assert.equal(g.freeze,0);tick(g,250);assert.equal(g.player.attack,null);assert.equal(g.freeze,0);});
test('one attack damages one target at most once and freezes on hit',()=>{const g=setup();const e=solo(g);tick(g,130,{attack:true});assert.equal(e.hp,76-24);assert.ok(g.freeze>0);tick(g,260);assert.equal(e.hp,52);assert.equal(g.stats.hits,1);});
test('late input buffer chains to second slash exactly once',()=>{const g=setup();solo(g,900);tick(g,240,{attack:true});tick(g,90,{attack:true});assert.equal(g.player.attack.index,1);assert.equal(g.stats.attacks,2);});
test('early mash reserves only one follow-up beyond the old buffer expiry',()=>{
  const g=setup();solo(g,1800);tick(g,10,{attack:true});tick(g,30,()=>({attack:true}));tick(g,220);
  assert.equal(g.player.attack.index,1);assert.equal(playerPose(g).frame,18);
  tick(g,400);assert.equal(g.stats.attacks,2);assert.equal(g.player.attack,null);
});
test('three slashes chain without an idle pose and loop only with a new tap',()=>{
  const g=setup();solo(g,2500);tick(g,10,{attack:true});const indices=[0];
  for(let n=0;n<3;n++){tick(g,10,{attack:true});let limit=100;const current=g.player.attack.index;
    while(g.player.attack?.index===current&&limit--)tick(g,10);
    assert.ok(g.player.attack);assert.equal(playerPose(g).clip,'hero-attack');indices.push(g.player.attack.index);
  }
  assert.deepEqual(indices,[0,1,2,0]);tick(g,400);assert.equal(g.stats.attacks,4);
});
test('tap during hit-stop queues a follow-up and hurt cancels the queue',()=>{
  const g=setup();const e=solo(g);tick(g,130,{attack:true});assert.ok(g.freeze>0);
  tick(g,10,{attack:true});assert.equal(g.player.attack.queued,true);
  g.freeze=0;e.stun=0;e.phase='strike';e.age=0;e.hit=false;e.dir=-1;e.x=g.player.x+70;
  tick(g,10);assert.equal(g.player.attack,null);tick(g,500);assert.equal(g.stats.attacks,1);
});
test('double-tap sprint ignores held repeats and clears on release, reversal and reset',()=>{
  const m=createMovement(config.player.runDoubleTapMs);m.down('KeyD',0);m.down('KeyD',80);assert.equal(m.state.run,false);
  m.up('KeyD');m.down('KeyD',160);assert.deepEqual(m.state,{move:1,run:true});
  m.up('KeyD');assert.deepEqual(m.state,{move:0,run:false});m.down('KeyA',200);assert.equal(m.state.run,false);
  m.up('KeyA');m.down('KeyA',280);assert.deepEqual(m.state,{move:-1,run:true});m.reset();assert.equal(m.state.run,false);
});
test('running uses faster movement and animation; attacking and release stop running',()=>{
  const a=setup(),b=setup();solo(a,2000);solo(b,2000);tick(a,200,()=>({move:1}));tick(b,200,()=>({move:1,run:true}));
  assert.ok(b.player.x-a.player.x>30);assert.ok(b.player.walkTime>a.player.walkTime);assert.equal(b.player.running,true);
  tick(b,10,{move:1,run:true,attack:true});assert.equal(b.player.running,false);assert.ok(b.player.attack);
  tick(a,10);assert.equal(a.player.running,false);
});
test('dash blocks a real enemy strike',()=>{const g=setup();const e=solo(g,320);e.phase='strike';e.age=0;e.dir=-1;tick(g,30,{dash:true,move:1});assert.equal(g.player.hp,140);assert.ok(g.player.dash>0);});
test('hurt interrupts attack, applies recoil and immunity',()=>{const g=setup();const e=solo(g,320);e.phase='strike';e.dir=-1;tick(g,10,{attack:true});assert.equal(g.player.hp,124);assert.equal(g.player.attack,null);assert.equal(playerPose(g).frame,1);assert.ok(g.player.vx<0);e.hit=false;tick(g,100);assert.equal(g.player.hp,124);});
test('jump avoids ground attack above its vertical range',()=>{const g=setup();const e=solo(g,340);g.player.y=-190;g.player.vy=0;e.phase='strike';e.dir=-1;tick(g,30);assert.equal(g.player.hp,140);});
test('death cannot transition into wave clear or victory',()=>{const g=setup();const e=solo(g,320);g.player.hp=1;e.phase='strike';e.dir=-1;tick(g,20);assert.equal(g.status,'dead');const hp=g.player.hp;tick(g,2000,{attack:true});assert.equal(g.player.hp,hp);assert.equal(playerPose(g).frame,5);});
test('locked gate blocks player until living enemies are defeated',()=>{const g=setup();g.player.x=1229;tick(g,100,{move:1});assert.equal(g.player.x,1230);g.enemies.forEach(e=>{e.hp=0;e.phase='dead';});tick(g,10);assert.deepEqual(g.cleared,[0]);tick(g,300,()=>({move:1}));assert.ok(g.player.x>1230);});
test('fresh game resets all combat state',()=>{const g=setup();g.stats.hits=12;g.player.hp=1;g.freeze=80;const fresh=setup();assert.equal(fresh.player.hp,140);assert.equal(fresh.stats.hits,0);assert.equal(fresh.freeze,0);assert.equal(fresh.enemies.length,2);});
test('scripted traversal reaches all encounters and the exit without state edits',()=>{
  const g=setup();let maxSteps=60*220;const seen=new Set();
  while(g.status==='playing'&&maxSteps--){
    const p=g.player,alive=g.enemies.filter(e=>e.hp>0),target=alive.sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
    const input={};
    if(target){const dx=target.x-p.x;input.move=Math.sign(dx);if(Math.abs(dx)<185){input.move=0;if(p.dir!==Math.sign(dx))input.move=Math.sign(dx);else if(!p.attack&&p.hurt===0)input.heavy=true;}
      if(target.phase==='windup'&&target.age>config[target.type].windupMs-180&&!p.attack){input.dash=true;input.move=-Math.sign(dx);}
    }else input.move=1;
    updateGame(g,1000/60,input);seen.add(g.wave);g.events.length=0;
  }
  assert.equal(g.status,'won',JSON.stringify({status:g.status,p:g.player,wave:g.wave,stats:g.stats}));assert.deepEqual([...seen],[0,1,2]);assert.equal(g.stats.kills,7);
});
