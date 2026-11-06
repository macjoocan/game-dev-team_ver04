from pathlib import Path
from PIL import Image
import json,hashlib
b=Path(__file__).resolve().parent
items=[]
for key,title,folder,note in [('cycle26','은발 Ludo · 한 주기 후보 26장',b/'cycle26','원본 04~29번. 픽셀 변경 없이 연속 구간 선택. 최종 루프 승인 전'),('original36','은발 Ludo · 전체 36장',b/'export/animation-pack/Right-facing-side-vi','서비스에서 내보낸 전체 프레임. 반복 끝점은 아직 미승인')]:
    files=sorted(folder.glob('*.png')); im=Image.open(files[0]).convert('RGBA'); bounds=im.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
    items.append(dict(id=key,title=title,frames=[p.relative_to(b).as_posix() for p in files],durations=[1000/14.4]*len(files),period=len(files)/14.4*1000,firstBounds=bounds,size=list(im.size),timing='14.4 FPS는 36장/원본 2.5초에서 추정한 비교 속도',note=note))
old=json.loads((b.parent/'home-compare/comparison.json').read_text(encoding='utf-8'))
if isinstance(old,dict): old=old.get('clips',old.get('items',[]))
for e in old:
    if e['id'] in ['ludo','gpt-b']:
        e['frames']=['../home-compare/'+p for p in e['frames']];items.append(e)
html=(b.parent/'home-compare/index.html').read_text(encoding='utf-8')
start=html.index('const data=');end=html.index(';let playing=',start)
html=html[:start]+'const data='+json.dumps(items,ensure_ascii=False)+html[end:]
html=html.replace('집에서 만든 결과 · 나란히 비교','은발 검사 · Ludo 걷기 결과').replace('집 결과 비교 · Ludo / ComfyUI / GPT B','은발 Ludo 걷기 검수')
a=html.index('<p class="note">');z=html.index('</p>',a)
html=html[:a]+'<p class="note">새 Ludo 은발 걷기와 무료 후처리로 고른 26프레임 후보입니다. 아래에 집 Ludo 24장과 GPT B도 함께 놓았습니다. 포니테일·검·발 교차와 반복 경계를 비교하세요. 생성 1회 9크레딧, 후처리 추가 크레딧 0.</p>'+html[z+4:]
(b/'index.html').write_text(html,encoding='utf-8');(b/'comparison.json').write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf-8')
gif=[]
for p in sorted((b/'cycle26').glob('*.png')):
    im=Image.open(p).convert('RGBA');bg=Image.new('RGBA',im.size,'#eeeeee');bg.alpha_composite(im);gif.append(bg.convert('RGB'))
gif[0].save(b/'cycle26-preview.gif',save_all=True,append_images=gif[1:],duration=70,loop=0)
manifest={'id':'chr.silver.ludo-hydra.walk','status':'concept','humanApproved':False,'source':'Ludo Hydra from GPT keypose','license':'not independently reviewed','fpsEstimate':14.4,'sourceVideoSeconds':2.5,'sourceFrames':36,'cycleFrames':26,'selectionZeroBased':list(range(4,30)),'credits':9,'postprocessCredits':0,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [b/'original.mp4',b/'original.webp',b/'export.zip']}}
(b/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'clips':[(e['id'],len(e['frames'])) for e in items],'selection':'4..29 (26 frames)','gifFrameMilliseconds':70}))
