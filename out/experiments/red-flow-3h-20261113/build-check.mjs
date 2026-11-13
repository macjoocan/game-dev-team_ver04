import {spawnSync} from 'node:child_process';
for(const name of ['configure','test','build']){const r=spawnSync(process.execPath,[`out/experiments/red-flow-3h-20261113/${name}.mjs`],{encoding:'utf8'});console.log(r.stdout);if(r.status)throw Error(r.stderr||`${name}: ${r.status}`);}
