#!/usr/bin/env node
// 설치 버전과 배포 파일 SHA-256 검사. 0 일치 / 1 차이 / 3 측정 불가.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const PLUGIN='game-dev-team';
const DIRS=['agents','skills','hooks','commands','scripts','.claude-plugin','.codex-plugin'];
const FILES=['README.md','USAGE.md','INSTALL.md','ORCHESTRATION.md','REVIEW.md','AGENTS.md','CLAUDE.md'];
function readJSON(f){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}}
const versionAt=d=>readJSON(path.join(d,'.claude-plugin/plugin.json'))?.version||readJSON(path.join(d,'.codex-plugin/plugin.json'))?.version;
const segment=v=>typeof v==='string'&&/^[a-zA-Z0-9._-]+$/.test(v)&&v!=='.'&&v!=='..';
export function installedVersions(projectDir,home=os.homedir()){
  const reg=readJSON(path.join(home,'.claude/plugins/installed_plugins.json')),rows=[];
  for(const [pluginId,entries] of Object.entries(reg?.plugins||{})){
    if(!pluginId.startsWith(PLUGIN+'@')||!Array.isArray(entries))continue;
    for(const e of entries){
      if(e.projectPath&&projectDir&&path.resolve(e.projectPath)!==path.resolve(projectDir))continue;
      rows.push({...e,pluginId,harness:'claude'});
    }
  }
  return rows;
}
export function sourceInfo(home=os.homedir()){
  const known=readJSON(path.join(home,'.claude/plugins/known_marketplaces.json'));
  const e=known?.[PLUGIN]??known?.marketplaces?.[PLUGIN],s=e?.source;
  if(!s)return null;
  if(s.source==='directory'&&s.path)return {version:versionAt(s.path),kind:'directory',origin:s.path,root:s.path};
  if(!e.installLocation)return null;
  return {version:versionAt(e.installLocation),kind:'git',origin:s.repo?s.source+':'+s.repo:s.url||s.source,clone:e.installLocation,root:e.installLocation};
}
export function sourceVersion(){return sourceInfo()?.version??null;}
function tree(root){
  const result=new Map();
  if(!fs.statSync(root).isDirectory()||!versionAt(root)||!fs.statSync(path.join(root,'skills')).isDirectory())throw Error('플러그인 manifest 또는 skills를 확인하지 못했다');
  const walk=rel=>{
    const file=path.join(root,rel),stat=fs.lstatSync(file);
    if(stat.isSymbolicLink())throw Error('연결 경로는 비교하지 않는다: '+rel);
    if(stat.isDirectory())for(const name of fs.readdirSync(file).sort())walk(rel+'/'+name);
    else if(stat.isFile())result.set(rel,createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
    else throw Error('일반 파일이 아니다: '+rel);
  };
  for(const rel of [...DIRS,...FILES])if(fs.existsSync(path.join(root,rel)))walk(rel);
  return result;
}
export function compareInstallation(source,installed){
  const a=tree(source),b=tree(installed);
  const missing=[...a.keys()].filter(k=>!b.has(k));
  const changed=[...a.keys()].filter(k=>b.has(k)&&a.get(k)!==b.get(k));
  const extra=[...b.keys()].filter(k=>!a.has(k));
  return {missing,changed,extra,comparedFiles:a.size,sameFiles:a.size-missing.length-changed.length};
}
function codexRegistry(codexHome){
  // 활성 버전은 설치 목록에서 읽는다. 남은 옛 캐시는 활성 설치로 추정하지 않는다.
  const fallback=path.join(codexHome,'plugins/.plugin-appserver/codex.exe');
  const command=process.env.CODEX_BIN||(process.platform==='win32'&&fs.existsSync(fallback)?fallback:'codex');
  const r=spawnSync(command,['plugin','list','--marketplace','game-dev-team-local','--json'],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:4*1024*1024,env:{...process.env,CODEX_HOME:codexHome}});
  if(r.status!==0)throw Error('Codex 설치 목록을 읽지 못했다');
  try{const data=JSON.parse(r.stdout);if(!Array.isArray(data.installed))throw Error();return data;}
  catch{throw Error('Codex 설치 목록 형식을 확인하지 못했다');}
}
export function inspectInstallations(projectDir,options={}){
  const home=options.home||os.homedir(),codexHome=options.codexHome||process.env.CODEX_HOME||path.join(home,'.codex');
  const harness=options.harness||'both',installations=[],discoveryGaps=[];
  const explicit=options.source?{root:path.resolve(options.source),origin:path.resolve(options.source),kind:'directory',version:versionAt(path.resolve(options.source))}:null;
  if(harness!=='codex'){
    const source=explicit||sourceInfo(home);
    for(const r of installedVersions(projectDir,home))installations.push({...r,source});
  }
  if(harness!=='claude'){
    try{
      const hasCodex=options.codexList!==undefined||harness==='codex'||fs.existsSync(path.join(codexHome,'plugins/cache/game-dev-team-local'));
      const reg=hasCodex?options.codexList||codexRegistry(codexHome):{installed:[]};
      for(const e of reg.installed){
        if(e.name!==PLUGIN||!e.installed)continue;
        if(![e.marketplaceName,e.version].every(segment))throw Error('Codex 캐시 경로 식별자를 확인하지 못했다');
        const local=e.source?.source==='local'&&typeof e.source.path==='string';
        const source=explicit||(local?{kind:e.marketplaceSource?.sourceType==='local'?'directory':'git',origin:e.marketplaceSource?.source||e.source.path,root:e.source.path,version:versionAt(e.source.path)}:null);
        installations.push({harness:'codex',pluginId:e.pluginId,scope:'global',enabled:e.enabled,version:e.version,installPath:path.join(codexHome,'plugins/cache',e.marketplaceName,PLUGIN,e.version),source});
      }
    }catch(e){discoveryGaps.push(e.message);}
  }
  for(const r of installations){
    r.code=3;
    try{
      if(!r.source?.root||!r.source.version||!r.installPath)throw Error('소스 또는 설치 경로·버전을 확인하지 못했다');
      Object.assign(r,compareInstallation(r.source.root,r.installPath));
      r.code=r.missing.length||r.changed.length||r.extra.length||r.version!==r.source.version?1:r.source.kind==='git'?3:0;
      r.reason=r.code===1?'배포 파일 또는 버전 불일치':r.code===3?'로컬 클론과 일치하나 원격은 미확인':'지정한 로컬 소스와 배포 파일 일치';
    }catch(e){r.reason=e.message;}
  }
  if(!installations.length)discoveryGaps.push('대상 하네스의 설치 기록이 없다');
  const code=installations.some(x=>x.code===1)?1:discoveryGaps.length||installations.some(x=>x.code===3)?3:0;
  return {code,verdict:code===0?'일치':code===1?'불일치':'측정 불가',installations,discoveryGaps};
}
function format(result){
  const lines=[];
  for(const r of result.installations){
    lines.push(r.harness+' / '+r.scope+(r.enabled===false?' (비활성)':''),'  소스 출처: '+(r.source?.origin||'미확인'),'  소스 버전: '+(r.source?.version||'미확인'),'  설치 경로: '+(r.installPath||'미확인'),'  설치 버전: '+r.version,'  결과: '+r.reason);
    for(const [key,label] of [['missing','누락'],['changed','변경'],['extra','추가']])if(r[key]?.length)lines.push('  '+label+' '+r[key].length+'개: '+r[key].slice(0,8).join(', ')+(r[key].length>8?' …':''));
    if(r.comparedFiles!==undefined)lines.push('  비교 파일: '+r.comparedFiles+'개 / 일치 '+r.sameFiles+'개');
  }
  lines.push(...result.discoveryGaps,'판정: '+result.verdict+'. 원격 최신성·실행 품질·현재 세션 재로드 여부는 검사하지 않는다.');
  if(result.code===1)lines.push('소스와 미러 확인 뒤 공식 install.ps1 또는 install.sh로 갱신한다. 갱신 뒤 세션을 다시 불러온다.');
  return lines.join('\n');
}
export function staleReport(projectDir){
  const r=inspectInstallations(projectDir);return r.code===1?format(r):null;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),options={};let json=false;
  while(args.length){
    const key=args.shift();if(key==='--json'){json=true;continue;}
    if(!['--source','--harness'].includes(key)||!args.length){console.error('usage: check-plugin-version.mjs [--source dir] [--harness both|claude|codex] [--json]');process.exit(2);}
    options[key.slice(2)]=args.shift();
  }
  if(options.harness&&!['both','claude','codex'].includes(options.harness)){console.error('하네스는 both, claude, codex 중 하나다');process.exit(2);}
  const r=inspectInstallations(process.env.CLAUDE_PROJECT_DIR||process.cwd(),options);
  console.log(json?JSON.stringify(r,null,2):format(r));process.exit(r.code);
}
