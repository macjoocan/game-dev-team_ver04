import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = 'out/experiments/silver-gpt-qa-20261111';
const candidate = 'v3';
const qa = JSON.parse(fs.readFileSync(`${root}/${candidate}/qa/sprite-qa.json`));
const motion = JSON.parse(fs.readFileSync(`${root}/${candidate}/qa/motion-qa.json`));
const original = 'out/experiments/local-motion-20261106/c-alpha';
fs.mkdirSync(`${root}/reference`, { recursive: true });
const referenceFiles = fs.readdirSync(original).filter(f => /\.png$/i.test(f)).sort();
for (const f of referenceFiles) fs.copyFileSync(path.join(original, f), `${root}/reference/${f}`);
const newFiles = fs.readdirSync(`${root}/${candidate}/frames`).filter(f => /\.png$/i.test(f)).sort();
const clips = [
  { title: '수정 전 · v1', subtitle: '사용자 피드백: 팔 고정·다리 교차 부족', fps: 8, files: newFiles.map(f => `v1/frames/${f}`) },
  { title: '팔·다리 수정 · v3', subtitle: '색·디자인 유지 요청 + 기존 C의 보행 포즈 참조', fps: 8, files: newFiles.map(f => `${candidate}/frames/${f}`) },
];
const margins = Object.values(qa.crop.sides).map(s => s.minimumMarginPx);
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>새 은발 스프라이트 검증</title><style>
*{box-sizing:border-box}body{margin:0;background:#0b1220;color:#e5ecf6;font:16px/1.65 system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:32px 22px}h1{font-size:30px;line-height:1.3;margin:6px 0}h2{font-size:20px;margin:0}p{margin:8px 0;color:#b4c3d8}.tag{color:#80dec9;font-weight:700}.stats,.controls,.grid{display:flex;gap:14px;flex-wrap:wrap}.stats{margin:24px 0}.stats>div{flex:1;min-width:180px;background:#182438;padding:18px;border-radius:12px}.stats strong{font-size:25px;display:block;color:#e8fff8}button,select,input{font:inherit}button,select{background:#263851;border:1px solid #627792;color:#fff;border-radius:7px;padding:7px 12px}button{cursor:pointer}.controls{align-items:center;margin:16px 0}.grid{display:grid;grid-template-columns:1fr 1fr}article{border:1px solid #35465f;border-radius:14px;overflow:hidden;background:#142033}.info{padding:18px}.stage{height:420px;display:grid;place-items:center;background-color:#242d39;background-image:linear-gradient(45deg,#313e4d 25%,transparent 25%),linear-gradient(-45deg,#313e4d 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#313e4d 75%),linear-gradient(-45deg,transparent 75%,#313e4d 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}.stage.light{background:#f1f1ec}.stage.dark{background:#090f19}.stage img{height:320px;max-width:100%;object-fit:contain}.stage.small img{height:128px}.frame{color:#89e4d2;font-variant-numeric:tabular-nums}input[type=range]{width:100%}aside{margin:24px 0;padding:20px;background:#322e22;border-left:4px solid #eac88c;border-radius:7px}aside p{color:#ead9b9}details{margin-top:22px}details img{width:100%;background:#172231}a{color:#90d6ff}.foot{font-size:13px;margin-top:25px}@media(max-width:720px){main{padding:18px 12px}.grid{grid-template-columns:1fr}.stage{height:360px}h1{font-size:25px}}
</style><main><span class="tag">GPT 새 이미지 · 검수 도구 실증</span><h1>은발 검객, 새 걷기 시트 확인</h1><p>이번 개선은 입력과 잘림을 검사하는 기능입니다. 자동 검사 통과가 자연스러운 걷기를 보장하지는 않습니다.</p>
<div class="stats"><div>v3 입력·색·형태<strong>${qa.verdict}</strong>8장 모두 계산 · 사람 승인과 별도</div><div>v3 캔버스 경계 접촉<strong>0 / 8장</strong>네 방향 최소 여백 ${Math.min(...margins)}px</div><div>v3 하단 윤곽 변화량<strong>${motion.motion.liftRange.toFixed(3)}</strong>모션 품질 점수 아님</div></div>
<div class="controls"><button id="play">일시정지</button><label>배경 <select id="background"><option value="checker">체커</option><option value="light">밝게</option><option value="dark">어둡게</option></select></label><label>표시 <select id="size"><option value="large">크게 · 캔버스 높이 320px</option><option value="small">작게 · 캔버스 높이 128px</option></select></label><label>속도 <select id="speed"><option value="1">1×</option><option value="0.5">0.5×</option></select></label></div>
<div class="grid">${clips.map((c,i)=>`<article><div class="info"><h2>${c.title}</h2><p>${c.subtitle}</p></div><div class="stage" id="stage${i}"><img id="sprite${i}" src="${c.files[0]}" alt="${c.title}"></div><div class="info"><span class="frame" id="counter${i}">1 / ${c.files.length}</span> · ${c.fps}fps 프리뷰<input id="frame${i}" type="range" min="0" max="${c.files.length-1}" value="0" aria-label="${c.title} 프레임"></div></article>`).join('')}</div>
<aside><strong>남은 확인</strong><p>알파 가장자리·내부 빈 공간·작은 분리 영역 경고가 있습니다. 머리카락·팔다리 사이의 의도된 빈 공간도 포함될 수 있습니다.</p><p>팔·다리 포즈를 C 모션에 맞춰 수정했습니다. 체중 이동과 마지막→첫 프레임 연결은 여전히 사람 검수가 필요합니다. 원본을 8칸으로 나눴으며 위치 보정이나 보간은 하지 않았습니다.</p></aside>
<details><summary>수정 시트 원본과 검사 기록</summary><img src="raw/silver-walk-${candidate}.png" alt="팔과 다리를 수정한 8포즈 시트"><p><a href="${candidate}/qa/sprite-qa.md">스프라이트 검사 원문</a> · <a href="${candidate}/qa/motion-qa.md">모션 관찰 원문</a> · <a href="prompt-${candidate}.txt">수정 프롬프트</a> · <a href="gait-reference.png">참고한 C 보행 포즈</a></p></details>
<p class="foot">검토용 후보 · 게임 자산 교체 없음 · 기본 image_gen으로 수정 · 동일 8fps 비교</p></main><script>
const clips=${JSON.stringify(clips)}; let playing=true,speed=1,last=performance.now();const elapsed=clips.map(()=>0),indices=clips.map(()=>0);
const button=document.getElementById('play');function toggle(){playing=!playing;button.textContent=playing?'일시정지':'재생'}button.onclick=toggle;
function show(i,n){indices[i]=n;document.getElementById('sprite'+i).src=clips[i].files[n];document.getElementById('counter'+i).textContent=(n+1)+' / '+clips[i].files.length;document.getElementById('frame'+i).value=n}
clips.forEach((c,i)=>{c.files.forEach(f=>{const image=new Image();image.src=f});document.getElementById('frame'+i).oninput=e=>{if(playing)toggle();show(i,Number(e.target.value));elapsed[i]=0}});
document.getElementById('background').onchange=e=>document.querySelectorAll('.stage').forEach(x=>{x.classList.remove('light','dark');if(e.target.value!=='checker')x.classList.add(e.target.value)});
document.getElementById('size').onchange=e=>document.querySelectorAll('.stage').forEach(x=>x.classList.toggle('small',e.target.value==='small'));
document.getElementById('speed').onchange=e=>speed=Number(e.target.value);
function animate(now){const dt=Math.min(now-last,100);last=now;if(playing)clips.forEach((c,i)=>{elapsed[i]+=dt*speed;const step=1000/c.fps;if(elapsed[i]>=step){const advance=Math.floor(elapsed[i]/step);elapsed[i]%=step;show(i,(indices[i]+advance)%c.files.length)}});requestAnimationFrame(animate)}requestAnimationFrame(animate);
</script></html>`;
fs.writeFileSync(`${root}/review.html`, html);
const files = [`raw/silver-walk-${candidate}.png`,`prompt-${candidate}.txt`,...newFiles.map(f=>`${candidate}/frames/${f}`),`${candidate}/qa/sprite-qa.json`,`${candidate}/qa/motion-qa.json`,'gait-reference.png'];
fs.writeFileSync(`${root}/evidence.json`, JSON.stringify({ id:'chr.silver.gpt-qa-20261111',candidate,status:'review',baseCommit:'4ceb944',harness:'codex',generator:'built-in image_gen',frameCount:8,frameSize:[384,512],spriteVerdict:qa.verdict,crop:qa.crop.sides,warnings:qa.warns,motion:motion.motion,userFeedback:['색 분리는 잘되었는데 팔이랑 다리만 개선 할 수 있을깡?','다리가 교차로 걷는 모션이 제대로 안되고 칼든 팔은 그냥 그대로 같은 위치에 유지되어 있음'],poseGuide:{source:original,indices:[0,3,6,9,13,16,19,22]},files:Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(`${root}/${f}`)).digest('hex')]))},null,2));
console.log(`${root}/review.html`);
