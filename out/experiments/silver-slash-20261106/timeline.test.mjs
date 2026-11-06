import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {compileClip,Attack,frameAt} from './timeline.mjs';
const feel=JSON.parse(fs.readFileSync(new URL('./feel.json',import.meta.url)));
const clip=compileClip(feel.clips.impact);
test('a long browser frame still registers exactly one hit',()=>{const a=new Attack(clip,{hit:true,hitStopMs:50});a.advance(1000);a.advance(1000);assert.equal(a.hits,1);assert.equal(a.done,true);});
test('hit-stop holds the impact pose and spends remaining delta correctly',()=>{const a=new Attack(clip,{hit:true,hitStopMs:50});a.advance(clip.impactMs+20);assert.equal(a.time,clip.impactMs);assert.equal(a.freeze,30);assert.equal(a.frame,clip.impactSourceFrame);a.advance(40);assert.equal(a.time,clip.impactMs+10);assert.equal(a.freeze,0);});
test('a miss causes no damage and no hit-stop',()=>{const a=new Attack(clip,{hit:false,hitStopMs:50});a.advance(clip.totalMs);assert.equal(a.hits,0);assert.equal(a.freeze,0);assert.equal(a.done,true);});
test('every scheduled pose is selected at its exact start',()=>{for(const f of clip.frames)assert.equal(frameAt(clip,f.start),f.source);});
test('new attacks do not inherit hit flags from previous attacks',()=>{const a=new Attack(clip,{hit:true});a.advance(1000);const b=new Attack(clip,{hit:true});assert.equal(b.hits,0);b.advance(1000);assert.equal(b.hits,1);});
