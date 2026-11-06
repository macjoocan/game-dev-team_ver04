import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const file=path.resolve(process.argv[2]); const root=path.dirname(file);
const name=path.basename(file,'.api.json'); const receipt=path.join(root,name+'-run.json');
const base='http://127.0.0.1:8196'; const prompt=JSON.parse(fs.readFileSync(file,'utf8'));
if(fs.existsSync(receipt))throw Error('Receipt already exists. Inspect prior job before rerunning.');
const state={status:'prepared',graph:file,graphSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),startedAt:new Date().toISOString(),host:base,paidCalls:0};
const save=()=>fs.writeFileSync(receipt,JSON.stringify(state,null,2));save();
const r=await fetch(base+'/prompt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt,client_id:'local-silver-motion'})});
const submitted=await r.json();state.submission=submitted;
if(!r.ok){state.status='rejected';save();throw Error(JSON.stringify(submitted));}
state.status='submitted';state.promptId=submitted.prompt_id;save();console.log('Submitted '+state.promptId);
let ticks=0;
while(true){
 await new Promise(r=>setTimeout(r,5000));
 const history=await(await fetch(base+'/history/'+state.promptId)).json();
 const job=history[state.promptId];
 if(job){state.status=job.status?.status_str??'finished';state.finishedAt=new Date().toISOString();state.history=job;save();console.log('Finished '+state.status);if(state.status!=='success')process.exitCode=1;break;}
 if(++ticks%12===0)console.log('Waiting '+ticks*5+'s');
 if(ticks>=720){state.status='still-running';save();throw Error('One-hour observation limit; inspect recorded job before any resubmission.');}
}
