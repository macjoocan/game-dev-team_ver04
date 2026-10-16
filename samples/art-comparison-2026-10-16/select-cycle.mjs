import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const selection=JSON.parse(read('ludo-cycle/selection.json'));
for(const file of ['ludo-cycle/manifest.json','comparison.json']){
 const data=JSON.parse(read(file));
 if(file==='comparison.json'){data.vendors.ludo.localCycle.userSelection=selection;data.vendors.ludo.localCycle.status='preferred-concept';}
 else data.userSelection=selection;
 fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n');
}
let template=read('cycle.template.html');
template=template.replace('세 번째 ‘한 주기 추출’이 새 후보입니다.','사용자 선택: 세 번째 ‘한 주기 추출 · 24장’이 이번 비교의 선택본입니다.');
template=template.replace('원본 6~29번 · 약 1.78초 · 검토 후보','사용자 선택 · 원본 6~29번 · 약 1.78초');
template=template.replace('<article><h2>③','<article style="border:2px solid #9ee3cd"><h2>③');
fs.writeFileSync(path.join(root,'cycle.template.html'),template);
const previous=read('cycle.html'),start=previous.indexOf('const data=')+'const data='.length,end=previous.indexOf(';const $=id',start);
if(start<11||end<0)throw Error('Cycle payload markers missing');
const payload=JSON.parse(previous.slice(start,end));payload.userSelection=selection;
fs.writeFileSync(path.join(root,'cycle.html'),template.replace('/*__PAYLOAD__*/',JSON.stringify(payload).replace(/</g,'\\u003c')));
let dashboard=read('dashboard.template.html');
dashboard=dashboard.replace('Ludo Hydra는 걷기 후보로 추가 검토할 만합니다.','사용자 선택은 Ludo 원본에서 추출한 24프레임 걷기입니다.');
dashboard=dashboard.replace('원본에서 실제 보행 한 주기 24프레임을 골라 별도 후보를 만들었습니다.','원본 6~29번째 프레임으로 만든 한 주기 추출본을 이번 비교의 선택본으로 기록했습니다.');
fs.writeFileSync(path.join(root,'dashboard.template.html'),dashboard);
console.log('Recorded human preference for cycle24; animation bytes unchanged.');
