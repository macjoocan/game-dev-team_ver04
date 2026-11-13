import fs from 'node:fs';
const r='out/experiments/silver-impact-20261113';let s=fs.readFileSync(`${r}/demo.mjs`,'utf8').replace('Math.min(now-last,80)*speed','Math.max(0,now-last)*speed');fs.writeFileSync(`${r}/demo.mjs`,s);
