import fs from 'node:fs';
const root='out/experiments/silver-impact-20261113';
let model=fs.readFileSync(`${root}/model.mjs`,'utf8');
model=model.replace('time>=c.impactMs-15&&time<c.impactMs+d.trailMs','age>=-15&&age<d.trailMs');fs.writeFileSync(`${root}/model.mjs`,model);
let ui=fs.readFileSync(`${root}/index.html`,'utf8');ui=ui.replace('<title>','<link rel="icon" href="data:,">\n<title>');fs.writeFileSync(`${root}/index.html`,ui);
let demo=fs.readFileSync(`${root}/demo.mjs`,'utf8');demo=demo.replace('(s.time-c.impactMs)/d.trailMs','s.age/d.trailMs');fs.writeFileSync(`${root}/demo.mjs`,demo);
