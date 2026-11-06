import pathlib,json,shutil,hashlib
from PIL import Image,ImageSequence
import numpy as np
b=pathlib.Path(__file__).resolve().parent
root=b.parents[2]
out=b/'home-compare';out.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
items=[]
for key,title,mode in [('ludo','① 집 · Ludo 한 주기 24장','alpha'),('home-comfy','② 집 · 은발 검사 ComfyUI','white'),('gpt-b','참고 · 현재 GPT B','alpha')]:
    dest=out/key;dest.mkdir(exist_ok=True)
    files=[];durations=[];sources=[]
    if key=='ludo':
        folder=root/'samples/art-comparison-2026-10-16/ludo-cycle/walk'
        manifest=json.loads((folder.parent/'manifest.json').read_text(encoding='utf-8'))
        for i,entry in enumerate(manifest['clip']['frames']):
            src=folder/pathlib.Path(entry['path']).name
            assert sha(src)==entry['sha256'],src
            dst=dest/f'frame_{i:02}.png';shutil.copy2(src,dst)
            files.append(dst);durations.append(1000/manifest['clip']['fps']);sources.append({'file':src.relative_to(root).as_posix(),'sha256':sha(src)})
        timing='13.5 FPS는 과거 원본 영상 길이에서 추정한 비교 속도'
        note='다른 캐릭터. 무료 출력의 LUDO 워터마크를 그대로 보존'
    elif key=='home-comfy':
        src=root/'samples/2d-sprite-motion-pilot/video-probe-walk.gif'
        shutil.copy2(src,dest/'original.gif')
        with Image.open(src) as gif:
            for i,fr in enumerate(ImageSequence.Iterator(gif)):
                dst=dest/f'frame_{i:02}.png';fr.convert('RGBA').save(dst)
                files.append(dst);durations.append(fr.info.get('duration',100))
        sources.append({'file':src.relative_to(root).as_posix(),'sha256':sha(src)})
        timing='보존된 GIF의 프레임별 duration 사용. 원본 25프레임 전체가 아닌 후반 발췌본'
        note='흰 배경 원본 보존. 포니테일 소실은 별도 외형 결함'
    else:
        for i,src in enumerate(sorted((b/'gpt-sheet/frames').glob('frame_*.png'))):
            dst=dest/f'frame_{i:02}.png';shutil.copy2(src,dst)
            files.append(dst);durations.append(125);sources.append({'file':src.relative_to(root).as_posix(),'sha256':sha(src)})
        timing='현재 실험에서 지정한 8 FPS'
        note='현재 선택한 B. 발 접지·반복 경계는 추가 검수 필요'
    first=np.array(Image.open(files[0]).convert('RGBA'))
    mask=first[:,:,3]>32
    if mode=='white':mask &= first[:,:,:3].min(axis=2)<235
    ys,xs=np.where(mask);bounds=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
    items.append({'id':key,'title':title,'frames':[p.relative_to(out).as_posix() for p in files],'durations':durations,'period':sum(durations),'firstBounds':bounds,'size':[first.shape[1],first.shape[0]],'timing':timing,'note':note,'sources':sources,'frameHashes':[sha(p) for p in files]})
(out/'comparison.json').write_text(json.dumps({'status':'concept','approved':False,'items':items,'policy':'Original pixels, order and durations retained. Fixed first-frame bounds used only for display. Same-cycle mode changes playback timing only.'},ensure_ascii=False,indent=2),encoding='utf-8')
html='''<!doctype html><html lang="ko"><meta charset="utf-8"><link rel="icon" href="data:,"><title>집 결과 비교 · Ludo / ComfyUI / GPT B</title><style>*{box-sizing:border-box}body{font:16px system-ui;background:#17212d;color:#edf3fa;margin:24px}h1{font-size:25px}.note{color:#becbd8;max-width:1080px;line-height:1.6}.controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:18px 0}button,select{font:inherit;padding:8px}section{display:flex;gap:18px;flex-wrap:wrap}.panel{padding:15px;background:#263547;border-radius:12px;width:340px}.panel h2{font-size:18px;margin:4px 0 10px}.panel p{font-size:13px;line-height:1.5;color:#c6d2df}canvas{width:310px;height:340px;background:#fff;display:block}.small canvas{width:155px;height:170px}.small .panel{width:185px}.stat{font-size:13px;color:#c6d2df;margin-top:8px}input{width:250px}a{color:#a5d7ff}.seam{outline:3px solid #e6b75a}</style><h1>집에서 만든 결과 · 나란히 비교</h1><p class="note">① 과거에 선택한 Ludo 24장, ② 집 PC의 은발 검사 ComfyUI GIF, ③ 현재 GPT B입니다. 캐릭터와 생성 조건이 달라 서비스 성능 순위를 매기는 비교는 아닙니다. 우선 다리 교차·몸의 리듬·반복 경계를 보세요.</p><div class="controls"><button id="play">일시정지</button><label>재생 방식 <select id="mode"><option value="native">보존된 속도</option><option value="cycle">같은 주기 · 1.78초</option></select></label><label>속도 <select id="speed"><option value="0.5">0.5배</option><option value="1" selected>1배</option></select></label><button id="size">작게 보기</button><button id="reset">처음부터</button><label>진행 <input id="seek" type="range" min="0" max="1000" value="0"></label></div><section id="panels"></section><p class="note">노란 테두리는 각 클립의 첫·끝 프레임입니다. ‘같은 주기’는 재생 시간만 맞춥니다. 발의 자세나 좌우 다리를 자동으로 대응시킨 것은 아닙니다. 첫 프레임의 크기·중심을 고정해 표시하며 매 프레임 재정렬하지 않습니다. 흰 배경·워터마크·원본 픽셀은 바꾸지 않았습니다.</p><a href="REPORT.md">비교 조건과 원본 경로</a><script>const data=DATA;let playing=true,elapsed=0,last=0;const panels=document.querySelector('#panels');const entries=data.map(item=>{const div=document.createElement('div');div.className='panel';const h=document.createElement('h2');h.textContent=item.title;const c=document.createElement('canvas');c.width=620;c.height=680;const stat=document.createElement('div');stat.className='stat';const p=document.createElement('p');p.textContent=item.frames.length+'프레임 · '+(item.period/1000).toFixed(2)+'초. '+item.timing+'. '+item.note;div.append(h,c,stat,p);panels.append(div);return{...item,c,stat,imgs:item.frames.map(src=>{const im=new Image;im.src=src;return im})}});function indexAt(e,time){let total=0;for(let i=0;i<e.durations.length;i++){total+=e.durations[i];if(time<total)return i}return e.durations.length-1}function draw(){const same=document.querySelector('#mode').value==='cycle';entries.forEach(e=>{const period=same?1777.7777778:e.period;const phase=(elapsed%period)/period;const index=indexAt(e,phase*e.period);const ctx=e.c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,620,680);const [x0,y0,x1,y1]=e.firstBounds;const scale=Math.min(540/(y1-y0),540/(x1-x0));const x=310-(x0+x1)/2*scale;const y=620-y1*scale;const im=e.imgs[index];if(im.complete&&im.naturalWidth)ctx.drawImage(im,x,y,im.naturalWidth*scale,im.naturalHeight*scale);e.stat.textContent='프레임 '+index+' / '+(e.frames.length-1);e.c.classList.toggle('seam',index===0||index===e.frames.length-1);e.current=index});const ref=same?1777.7777778:entries[0].period;document.querySelector('#seek').value=(elapsed%ref)/ref*1000}function tick(t){if(last&&playing)elapsed+=(t-last)*Number(document.querySelector('#speed').value);last=t;draw();requestAnimationFrame(tick)}requestAnimationFrame(tick);document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'일시정지':'재생'};document.querySelector('#reset').onclick=()=>{elapsed=0;draw()};document.querySelector('#mode').onchange=()=>{elapsed=0;draw()};document.querySelector('#seek').oninput=e=>{playing=false;document.querySelector('#play').textContent='재생';elapsed=Number(e.target.value)/1000*(document.querySelector('#mode').value==='cycle'?1777.7777778:entries[0].period);draw()};document.querySelector('#size').onclick=()=>{panels.classList.toggle('small');document.querySelector('#size').textContent=panels.classList.contains('small')?'크게 보기':'작게 보기'};</script></html>'''
(out/'index.html').write_text(html.replace('DATA',json.dumps(items,ensure_ascii=False)),encoding='utf-8')
print(json.dumps([{k:item[k] for k in ['id','period','size','firstBounds']}|{'frames':len(item['frames'])} for item in items],ensure_ascii=False))
