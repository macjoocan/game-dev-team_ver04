import fs from 'node:fs';
import path from 'node:path';
const [domain, output] = process.argv.slice(2);
const input = JSON.parse(fs.readFileSync('input.json','utf8'));
fs.mkdirSync(output,{recursive:true});
const data = domain === 'planning'
 ? {meta:{seed:42,runs:1000,policy:'greedy'},targets:{winRate:[0.35,0.55]},a:{n:1000,wins:input.pass?450:900,lengthMean:30}}
 : {verdict:input.pass?'pass':'fail',metrics:{fixtureValue:input.pass?1:0},reason:'synthetic assertion'};
fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(data));
console.log('SYNTHETIC FIXTURE ONLY',domain,input.pass);
process.exitCode=input.pass?0:1;
