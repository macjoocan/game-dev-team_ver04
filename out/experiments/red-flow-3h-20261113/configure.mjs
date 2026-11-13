import fs from 'node:fs';
const root='out/experiments/red-flow-3h-20261113';
const feel=JSON.parse(fs.readFileSync(`${root}/previous-feel.json`));
feel.combat.startX=260;feel.combat.nearTargetX=620;
feel.flow={minX:160,maxX:800,walkSpeed:140,runSpeed:250,acceleration:1800,deceleration:2200,walkStride:84,runStride:136,bufferMs:320,plantMs:40,guardMs:28,recoveryMs:24,carryMs:90,
cancel:{combo1:{move:240,evade:170},combo2:{move:240,evade:193},combo3:{move:350,evade:240},dash:{move:330,evade:270},spin:{move:350,evade:310}},
evade:{durations:[25,35,35,60,55,60,55,55],distance:105,start:60,end:210,landing:210},
dust:{walk:{count:3,size:7,life:280,opacity:.34,spread:20},run:{count:5,size:10,life:340,opacity:.4,spread:34},brake:{count:6,size:12,life:380,opacity:.4,spread:40},land:{count:7,size:12,life:380,opacity:.4,spread:36}}};
fs.writeFileSync(`${root}/feel.json`,JSON.stringify(feel,null,2)+'\n');
