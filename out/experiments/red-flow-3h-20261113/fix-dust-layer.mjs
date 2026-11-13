import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const root='out/experiments/red-flow-3h-20261113';let view=fs.readFileSync(`${root}/view.mjs`,'utf8');
if(!fs.existsSync(`${root}/view-before-dust.mjs`)){fs.copyFileSync(`${root}/view.mjs`,`${root}/view-before-dust.mjs`);fs.copyFileSync(`${root}/index.html`,`${root}/index-before-dust.html`);}
for(const [before,after] of [
 ['drawDust();drawTrail(','drawTrail('],
 ['ctx.restore();drawSparks();ctx.restore();','ctx.restore();drawDust();drawSparks();ctx.restore();'],
 ['const vx=(seed-.7)*c.spread*d.facing;const x=d.x+vx*p','const vx=-(.35+seed*.65)*c.spread*d.facing;const x=d.x+(seed-.5)*c.size+vx*p']
]){if(!view.includes(before))throw Error('Expected dust renderer pattern missing');view=view.replace(before,after);}
fs.writeFileSync(`${root}/view.mjs`,view);
const r=spawnSync(process.execPath,[`${root}/build.mjs`],{encoding:'utf8'});console.log(r.stdout);if(r.status)throw Error(r.stderr);
