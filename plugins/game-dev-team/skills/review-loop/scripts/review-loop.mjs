#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const argv=process.argv.slice(2), command=argv[0];
const opt=(n,d=null)=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:d};
const project=path.resolve(opt('--project','.')), dir=path.join(project,'.review-loop');
const files={config:path.join(dir,'config.json'),items:path.join(dir,'items.json'),reviews:path.join(dir,'reviews.jsonl'),rules:path.join(dir,'rules.json')};
const now=()=>new Date().toISOString();
const readJson=(p,d)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return d}};
const atomic=(p,v)=>{const t=`${p}.tmp-${process.pid}`;fs.writeFileSync(t,JSON.stringify(v,null,2)+'\n');fs.renameSync(t,p)};
const git=()=>{try{return execFileSync('git',['rev-parse','--short','HEAD'],{cwd:project,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{return null}};
function init(){fs.mkdirSync(dir,{recursive:true});if(!fs.existsSync(files.config))atomic(files.config,{schemaVersion:1,title:path.basename(project)+' Review Board'});if(!fs.existsSync(files.items))atomic(files.items,{schemaVersion:1,items:[]});if(!fs.existsSync(files.reviews))fs.writeFileSync(files.reviews,'');if(!fs.existsSync(files.rules))atomic(files.rules,{schemaVersion:1,rules:[]});console.log(`initialized ${dir}`)}
function relativeSafe(p){if(!p)return null;const a=path.resolve(project,p),r=path.relative(project,a);if(r.startsWith('..')||path.isAbsolute(r))throw new Error(`project 밖 경로: ${p}`);return r.split(path.sep).join('/')}
function add(){init();const id=opt('--id'),type=opt('--type'),title=opt('--title');if(!id||!type||!title)throw new Error('add에는 --id --type --title이 필요하다');const db=readJson(files.items,{items:[]});const prior=db.items.filter(x=>x.id===id);const version=Number(opt('--version',Math.max(0,...prior.map(x=>Number(x.version)||0))+1));const key=`${id}@${version}`;if(db.items.some(x=>x.key===key))throw new Error(`이미 등록됨: ${key}`);const item={key,id,version,type,title,status:'review',preview:relativeSafe(opt('--preview')),comparePreview:relativeSafe(opt('--compare')),artifact:relativeSafe(opt('--artifact')),qa:relativeSafe(opt('--qa')),harness:opt('--harness','unknown'),commit:git(),createdAt:now()};item.contentHash=contentHash(item.artifact)??contentHash(item.preview);db.items.push(item);atomic(files.items,db);console.log(`added ${key}`)}
/**
 * 산출물의 내용 해시. 파일이면 바이트, 폴더면 **정렬된 상대경로+내용**을 순서대로 넣는다.
 * 경로를 같이 넣어야 파일 이름만 바뀐 것도 잡힌다. 없으면 null(= 측정 불가).
 */
function contentHash(rel){
  if(!rel)return null;
  const abs=path.join(project,rel);
  let st;try{st=fs.statSync(abs)}catch{return null}
  const h=crypto.createHash('sha256');
  if(st.isFile()){h.update(fs.readFileSync(abs));return h.digest('hex')}
  const list=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const q=path.join(d,e.name);if(e.isDirectory())walk(q);else if(e.isFile())list.push(q)}})(abs);
  for(const f of list.sort()){h.update(path.relative(abs,f).split(path.sep).join('/'));h.update('\0');h.update(fs.readFileSync(f));h.update('\0')}
  return h.digest('hex');
}

/**
 * **승인은 그 시점의 파일에 대한 승인이다.** 파일이 바뀌면 그 승인은 더 이상 그 파일을 가리키지 않는다.
 * 그래서 내용이 달라지면 상태를 review 로 되돌리고 reviews.jsonl 에 사유를 남긴다(append-only).
 *
 * 해시가 없던 기존 항목은 **소급 기록만 하고 무효화하지 않는다** — 바뀐 적이 없는데 전부
 * 미승인으로 떨어뜨리면 장부가 또 거짓이 된다. 산출물이 사라진 경우는 측정 불가로 표시만 한다.
 */
function reconcile(){
  const db=readJson(files.items,{items:[]});let changed=false;const invalidated=[],missing=[];
  for(const it of db.items){
    const h=contentHash(it.artifact)??contentHash(it.preview);
    if(h===null){missing.push(it.key);if(!it.contentMissing){it.contentMissing=true;changed=true}continue}
    if(it.contentMissing){delete it.contentMissing;changed=true}
    if(!it.contentHash){it.contentHash=h;changed=true;continue}
    if(it.contentHash===h)continue;
    const was=it.status;it.contentHash=h;it.status='review';it.invalidatedAt=now();changed=true;
    invalidated.push({key:it.key,was});
    fs.appendFileSync(files.reviews,JSON.stringify({id:`invalidate-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,itemKey:it.key,decision:'invalidated',previousStatus:was,comment:'산출물 내용이 바뀌어 승인을 무효화했다',reviewer:'system',createdAt:now()})+'\n');
  }
  if(changed)atomic(files.items,db);
  return{db,invalidated,missing};
}

function verify(){
  init();const{db,invalidated,missing}=reconcile();
  for(const x of db.items)console.log(`  ${x.contentMissing?'?':invalidated.some(i=>i.key===x.key)?'X':'O'} ${x.key}  ${x.status}${x.contentMissing?' — 산출물 없음':''}`);
  if(invalidated.length){console.log(`\n무효화 ${invalidated.length}건 — 승인 뒤 파일이 바뀌었다:`);for(const i of invalidated)console.log(`  ${i.key} (${i.was} -> review)`);process.exit(1)}
  if(missing.length){console.log(`\n측정 불가 ${missing.length}건 — 산출물 경로에 파일이 없다. 판정이 아니라 측정 실패다.`);process.exit(3)}
  console.log(`\n${db.items.length}건 전부 등록 당시 내용과 일치한다.`);
}

function reviews(){if(!fs.existsSync(files.reviews))return[];return fs.readFileSync(files.reviews,'utf8').split(/\r?\n/).filter(Boolean).map((x,i)=>{try{return JSON.parse(x)}catch{return{id:`invalid-${i}`,invalid:true}}})}
function summary(){init();const{db,invalidated}=reconcile();const rs=reviews();if(invalidated.length)console.log(`! 승인 무효화 ${invalidated.length}건 (파일이 바뀌었다)`);console.log(`# Review Loop · ${path.basename(project)}`);for(const x of db.items){const lr=[...rs].reverse().find(r=>r.itemKey===x.key);console.log(`- ${x.key} [${x.type}] ${x.status} · ${x.harness}${lr?` · latest=${lr.decision}: ${lr.comment||lr.tags?.join(', ')||''}`:''}`)}const rules=readJson(files.rules,{rules:[]}).rules;console.log(`rules=${rules.length} reviews=${rs.length} items=${db.items.length}`)}
const mime=p=>({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm','.json':'application/json','.glb':'model/gltf-binary','.blend':'application/octet-stream'}[path.extname(p).toLowerCase()]||'application/octet-stream');
const send=(res,code,body,type='application/json; charset=utf-8')=>{res.writeHead(code,{'content-type':type,'cache-control':'no-store'});res.end(typeof body==='string'?body:JSON.stringify(body))};
const body=req=>new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1e6)req.destroy()});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch(e){reject(e)}})});
function state(){reconcile();return{config:readJson(files.config,{}),items:readJson(files.items,{items:[]}).items,reviews:reviews(),rules:readJson(files.rules,{rules:[]}).rules}}
async function api(req,res){
  const u=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&u.pathname==='/api/state')return send(res,200,state());
  if(req.method==='GET'&&u.pathname==='/file'){
    try{const rel=relativeSafe(u.searchParams.get('path')),p=path.join(project,rel);if(!fs.statSync(p).isFile())throw 0;res.writeHead(200,{'content-type':mime(p)});return fs.createReadStream(p).pipe(res)}catch{return send(res,404,{error:'file not found'})}
  }
  if(req.method==='POST'&&u.pathname==='/api/review'){
    const b=await body(req),decisions=new Set(['approve','revise','reject']);if(!b.itemKey||!decisions.has(b.decision))return send(res,400,{error:'itemKey/decision invalid'});
    const db=readJson(files.items,{items:[]}),item=db.items.find(x=>x.key===b.itemKey);if(!item)return send(res,404,{error:'item not found'});
    const scores={};for(const k of ['style','identity','readability','motion'])if(b.scores?.[k])scores[k]=Math.max(1,Math.min(5,Number(b.scores[k])));
    const review={id:`review-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,itemKey:b.itemKey,decision:b.decision,scores,tags:Array.isArray(b.tags)?b.tags.slice(0,12):[],comment:String(b.comment||'').slice(0,2000),ruleCandidate:String(b.ruleCandidate||'').slice(0,500),reviewer:'human',createdAt:now()};
    fs.appendFileSync(files.reviews,JSON.stringify(review)+'\n');item.status=b.decision==='approve'?'approved':b.decision==='reject'?'rejected':'revise';item.contentHash=contentHash(item.artifact)??contentHash(item.preview);delete item.invalidatedAt;atomic(files.items,db);return send(res,200,review);
  }
  if(req.method==='POST'&&u.pathname==='/api/rule'){
    const b=await body(req);if(!b.text||!b.sourceReviewId)return send(res,400,{error:'text/sourceReviewId required'});const db=readJson(files.rules,{rules:[]});const rule={id:`rule-${Date.now()}`,text:String(b.text).slice(0,500),sourceReviewId:b.sourceReviewId,status:'active',approvedBy:'human',createdAt:now()};db.rules.push(rule);atomic(files.rules,db);return send(res,200,rule);
  }
  send(res,404,{error:'not found'});
}
const html=String.raw`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Review Loop</title><style>
:root{color-scheme:dark;--bg:#0c111b;--panel:#151d2b;--line:#29364c;--text:#eaf0fa;--muted:#91a0b8;--accent:#5dc2ff;--ok:#48d597;--warn:#ffb84d;--bad:#ff667a}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#17243b,var(--bg) 40%);font:14px system-ui;color:var(--text)}header{position:sticky;top:0;z-index:3;padding:18px 24px;background:#0c111be8;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}h1{margin:0 0 10px;font-size:22px}.filters{display:flex;gap:8px;flex-wrap:wrap}button,select,input,textarea{font:inherit;color:inherit;background:#111827;border:1px solid var(--line);border-radius:8px;padding:8px}button{cursor:pointer}.filters button.active{border-color:var(--accent);color:var(--accent)}main{padding:22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden}.head{padding:14px;display:flex;justify-content:space-between;gap:10px}.meta,.latest{color:var(--muted);font-size:12px}.status{font-weight:700}.approved{color:var(--ok)}.revise{color:var(--warn)}.rejected{color:var(--bad)}.media{height:280px;background:linear-gradient(45deg,#101622 25%,#172031 25%,#172031 50%,#101622 50%,#101622 75%,#172031 75%);background-size:24px 24px;display:flex;align-items:center;justify-content:center;gap:8px}.media img,.media video{max-width:100%;max-height:100%;image-rendering:auto}.media.compare>*{max-width:49%}.empty{color:var(--muted)}form{padding:14px;display:grid;gap:10px;border-top:1px solid var(--line)}.scores{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.scores label{display:flex;justify-content:space-between;align-items:center;color:var(--muted)}textarea{min-height:64px;resize:vertical}.actions{display:flex;gap:8px}.actions button{flex:1}.approve{border-color:var(--ok)}.reviseBtn{border-color:var(--warn)}.reject{border-color:var(--bad)}a{color:var(--accent)}#stats{color:var(--muted)}</style></head><body><header><h1 id="title">Review Loop</h1><div class="filters"><button data-filter="all" class="active">전체</button><button data-filter="2d">2D</button><button data-filter="3d">3D</button><button data-filter="other">기타</button><span id="stats"></span></div></header><main id="cards"></main><script>
let S,filter='all';const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const kind=t=>/model|3d|blend|glb/i.test(t)?'3d':/sprite|image|ui|icon|vfx|2d/i.test(t)?'2d':'other';const file=p=>'/file?path='+encodeURIComponent(p);function media(i){let a=[];for(const p of [i.comparePreview,i.preview].filter(Boolean)){if(/\.(mp4|webm)$/i.test(p))a.push('<video controls loop muted src="'+file(p)+'"></video>');else a.push('<img src="'+file(p)+'">')}return a.length?'<div class="media '+(a.length>1?'compare':'')+'">'+a.join('')+'</div>':'<div class="media empty">프리뷰 없음</div>'}function render(){document.querySelector('#title').textContent=S.config.title||'Review Loop';const items=S.items.filter(i=>filter==='all'||kind(i.type)===filter);document.querySelector('#stats').textContent='검토 '+S.items.filter(i=>i.status==='review'||i.status==='revise').length+' · 승인 '+S.items.filter(i=>i.status==='approved').length;document.querySelector('#cards').innerHTML=items.map(i=>{const rs=S.reviews.filter(r=>r.itemKey===i.key),r=rs.at(-1);return '<article class="card"><div class="head"><div><b>'+esc(i.title)+'</b><div class="meta">'+esc(i.key)+' · '+esc(i.type)+' · '+esc(i.harness)+'</div></div><span class="status '+i.status+'">'+esc(i.status)+'</span></div>'+media(i)+'<form data-key="'+esc(i.key)+'"><div class="scores">'+['style','identity','readability','motion'].map(k=>'<label>'+k+'<select name="'+k+'">'+[1,2,3,4,5].map(n=>'<option '+(n===3?'selected':'')+'>'+n+'</option>').join('')+'</select></label>').join('')+'</div><input name="tags" placeholder="태그: 얼굴, 실루엣, 타이밍"><textarea name="comment" placeholder="수정 의견"></textarea><input name="rule" placeholder="반복되면 규칙 후보로 남길 문장"><div class="actions"><button class="approve" data-d="approve">승인</button><button class="reviseBtn" data-d="revise">수정</button><button class="reject" data-d="reject">폐기</button></div>'+(i.artifact?'<a href="'+file(i.artifact)+'">산출물 열기</a>':'')+(r?'<div class="latest">최근: '+esc(r.decision)+' · '+esc(r.comment||r.tags?.join(', '))+'</div>':'')+'</form></article>'}).join('')||'<p>등록된 항목이 없습니다.</p>';document.querySelectorAll('form').forEach(f=>f.addEventListener('click',async e=>{const d=e.target.dataset.d;if(!d)return;e.preventDefault();const q=n=>f.elements[n].value;await fetch('/api/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({itemKey:f.dataset.key,decision:d,scores:{style:q('style'),identity:q('identity'),readability:q('readability'),motion:q('motion')},tags:q('tags').split(',').map(x=>x.trim()).filter(Boolean),comment:q('comment'),ruleCandidate:q('rule')})});await load()}))}async function load(){S=await(await fetch('/api/state')).json();render()}document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));render()});load();</script></body></html>`;
function serve(){init();const port=Number(opt('--port','4177')),host=opt('--host','127.0.0.1');http.createServer((req,res)=>{if(req.url==='/'&&req.method==='GET')return send(res,200,html,'text/html; charset=utf-8');api(req,res).catch(e=>send(res,500,{error:e.message}))}).listen(port,host,()=>console.log(`Review Loop: http://${host}:${port}\nproject: ${project}`))}
if(!command||['-h','--help','help'].includes(command)){console.log('usage: review-loop.mjs <init|add|summary|verify|serve> --project <path> [options]');process.exit(command?0:2)}
try{if(command==='init')init();else if(command==='add')add();else if(command==='summary')summary();else if(command==='verify')verify();else if(command==='serve')serve();else throw new Error(`unknown command: ${command}`)}catch(e){console.error(e.message);process.exit(1)}
