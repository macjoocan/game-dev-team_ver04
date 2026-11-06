import pathlib,json,math,hashlib,shutil
from PIL import Image,ImageDraw
b=pathlib.Path(__file__).resolve().parent
items=[]
for kind,title in [('rig','A · 뼈대 자동 변형'),('gpt-sheet','B · GPT 걷기 시트'),('rigid','참고 · 뼈대 강체 분리')]:
    folder=b/kind/'frames'
    if not folder.exists():continue
    paths=sorted(folder.glob('frame_*.png'));assert len(paths)==8
    desc={'kind':'sprite-gen-asset','version':1,'anchor':[256,480],'frames':[{'file':'frames/'+p.name,'duration':0.125} for p in paths]}
    (b/kind/'sequence.json').write_text(json.dumps(desc,indent=2),encoding='utf-8')
    ims=[Image.open(p).convert('RGBA') for p in paths]
    preview=[]
    sheet=Image.new('RGB',(256*4,280*2),'#e4e7eb');draw=ImageDraw.Draw(sheet)
    for i,im in enumerate(ims):
        x=i%4*256;y=i//4*280
        thumb=im.resize((256,256),Image.Resampling.LANCZOS)
        sheet.paste(thumb,(x,y),thumb);draw.text((x+5,y+258),str(i),fill='black')
        bg=Image.new('RGB',(256,256),'#e4e7eb');bg.paste(thumb,mask=thumb);preview.append(bg)
    sheet.save(b/kind/'contact-large.png')
    preview[0].save(b/kind/'preview.gif',save_all=True,append_images=preview[1:],duration=125,loop=0)
    items.append({'id':kind,'title':title,'frames':[f'{kind}/frames/{p.name}' for p in paths],'status':'concept','approved':False})
tele=json.loads((b/'rig/frames/kinematics.json').read_text())
rig=json.loads((b/'rig.json').read_text())
gaps=[];lengths=[];targets=[];tips=[]
for row,frame in zip(tele,rig['frames']):
    bones={x['name']:x for x in row['bones']};s=bones['sword'];h=bones['near_forearm']['end']
    gaps.append(math.dist(s['start'],h));lengths.append(math.dist(s['start'],s['end']));tips.append(s['end'])
    for c in frame['contacts']:targets.append(math.dist(bones[c['bone']]['end'],[c['x'],c['y']]))
metrics={'measurement':'rig bone coordinates only; does NOT prove raster pixels follow bones','handSwordJointMaxGapPx':max(gaps),'swordBoneLengthRangePx':[min(lengths),max(lengths)],'swordTipTravelRangePx':[max(p[0] for p in tips)-min(p[0] for p in tips),max(p[1] for p in tips)-min(p[1] for p in tips)],'maxAnkleTargetErrorPx':max(targets)}
(b/'rig/kinematic-check.json').write_text(json.dumps(metrics,indent=2),encoding='utf-8')
(b/'review-items.json').write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf-8')
html='''<!doctype html><html lang="ko"><meta charset="utf-8"><link rel="icon" href="data:,"><title>GPT 원화 · 걷기 방식 비교</title><style>body{font:16px system-ui;background:#17212d;color:#edf3fa;margin:24px}h1{font-size:24px}.note{max-width:1100px;color:#bdc9d8;line-height:1.6}section{display:flex;gap:16px;flex-wrap:wrap}.panel{padding:12px;background:#263547;border-radius:12px}canvas,img{width:256px;height:256px;object-fit:contain;background:#e4e7eb}.small canvas,.small img{width:128px;height:128px}button,select{font:inherit;padding:8px;margin:4px}input{width:220px}a{color:#a2d8ff}.dark canvas,.dark img{background:#202b38}</style><h1>GPT 원화 · 걷기 방식 비교</h1><p class="note">같은 원화, 512×512 캔버스, 8프레임·8 FPS. A는 sprite-maker의 원본 Rust 변형 렌더러, B는 GPT 시트 생성 후 sprite-gen으로 분할한 결과입니다. 세 번째는 변형을 끄고 파츠를 딱딱하게 나눈 원인 확인용 결과입니다. 모두 미승인 실험본입니다.</p><div><button id="play">일시정지</button><label>FPS <select id="fps"><option>4</option><option selected>8</option><option>12</option></select></label><button id="size">128px로 보기</button><button id="bg">어두운 배경</button><label>프레임 <input id="frame" type="range" min="0" max="7" value="0"><span id="number">0</span></label></div><section id="panels"><div class="panel"><p>공통 GPT 원화</p><img src="input/master.png"></div></section><p class="note">A: 칼 휨·하체 변형. B: 발 접지·다리 교차·루프 경계 재검토. 참고: 칼 휨은 줄지만 파츠 틈과 겹침 발생. 아래 선은 캔버스 기준선일 뿐 실제 접지 판정이 아닙니다. 크기는 비교용이며 실제 게임 화면은 아직 검증하지 않았습니다.</p><a href="REPORT.md">검증 보고서</a><script>const data=DATA;let frame=0,playing=true,last=0;const panels=document.querySelector('#panels');const entries=data.map(item=>{const div=document.createElement('div');div.className='panel';const p=document.createElement('p');p.textContent=item.title;const c=document.createElement('canvas');c.width=c.height=512;div.append(p,c);panels.append(div);return{c,imgs:item.frames.map(p=>{const im=new Image;im.src=p;return im})}});function draw(){entries.forEach(e=>{const ctx=e.c.getContext('2d');ctx.clearRect(0,0,512,512);if(e.imgs[frame].complete)ctx.drawImage(e.imgs[frame],0,0);ctx.strokeStyle='#8b9bac';ctx.beginPath();ctx.moveTo(0,480);ctx.lineTo(512,480);ctx.stroke()});document.querySelector('#number').textContent=frame;document.querySelector('#frame').value=frame}function tick(t){if(playing&&t-last>1000/Number(document.querySelector('#fps').value)){frame=(frame+1)%8;last=t}draw();requestAnimationFrame(tick)}requestAnimationFrame(tick);document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'일시정지':'재생'};document.querySelector('#frame').oninput=e=>{frame=Number(e.target.value);playing=false;document.querySelector('#play').textContent='재생';draw()};document.querySelector('#size').onclick=()=>{panels.classList.toggle('small');document.querySelector('#size').textContent=panels.classList.contains('small')?'256px로 보기':'128px로 보기'};document.querySelector('#bg').onclick=()=>panels.classList.toggle('dark');</script></html>'''
(b/'review.html').write_text(html.replace('DATA',json.dumps(items,ensure_ascii=False)),encoding='utf-8')
print(json.dumps({'candidates':len(items),'kinematics':metrics}))
