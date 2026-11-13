import fs from 'node:fs';
const root='out/experiments/silver-impact-20261113';
const config=JSON.parse(fs.readFileSync(`${root}/feel.json`,'utf8'));
const imageData=[0,1].map(k=>Array.from({length:8},(_,i)=>'data:image/png;base64,'+fs.readFileSync(`${k?root+'/frames-v8':'out/experiments/silver-reference-slash-20261111/v6/frames'}/frame_${String(i).padStart(4,'0')}.png`).toString('base64')));
let model=fs.readFileSync(`${root}/model.mjs`,'utf8').replaceAll('export ','');
let demo=fs.readFileSync(`${root}/demo.mjs`,'utf8').replace("import {sample,clamp} from './model.mjs';",'').replace("await fetch('./feel.json').then(r=>r.json())",JSON.stringify(config)).replace(/im\.src=k\?[\s\S]*?;/,'im.src=imageData[k][i];');
const html=fs.readFileSync(`${root}/index.html`,'utf8').replace('<script type="module" src="demo.mjs"></script>',`<script type="module">\nconst imageData=${JSON.stringify(imageData)};\n${model}\n${demo}\n</script>`);
fs.writeFileSync(`${root}/preview.html`,html);console.log({bytes:Buffer.byteLength(html),embeddedFrames:imageData.flat().length});
