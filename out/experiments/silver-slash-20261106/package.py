from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib
root=Path(__file__).resolve().parent
feel=json.loads((root/'feel.json').read_text(encoding='utf-8'))
files=sorted((root/'alpha-repaired').glob('frame_*.png'));assert len(files)==25
ims=[Image.open(p).convert('RGBA') for p in files]
dest=root/'preview';dest.mkdir(exist_ok=True)
rows=[]
for i,(p,im) in enumerate(zip(files,ims)):
 a=np.asarray(im)[:,:,3];ys,xs=np.where(a>16)
 rows.append({'frame':i,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],'borderPixels':int((a[0]>16).sum()+(a[-1]>16).sum()+(a[:,0]>16).sum()+(a[:,-1]>16).sum())})
for name in ['uniform','snappy']:
 spec=feel['clips'][name];render=[]
 sheet=Image.new('RGB',(4*320,((len(spec['sourceFrames'])+3)//4)*282),'#1c2c3c');draw=ImageDraw.Draw(sheet)
 for i,source in enumerate(spec['sourceFrames']):
  im=ims[source];bg=Image.new('RGBA',im.size,(23,37,54,255));bg.alpha_composite(im);rgb=bg.convert('RGB');render.append(rgb)
  x=i%4*320;y=i//4*282;sheet.paste(rgb.resize((320,256),Image.Resampling.LANCZOS),(x,y+26));draw.text((x+6,y+7),f'{source} / {spec["durations"][i]}ms',fill='white')
 sheet.save(dest/(name+'-contact.png'))
 # GIF stores centiseconds. Round cumulative times, not every frame separately.
 elapsed=0;rounded=0;durations=[]
 for d in spec['durations']:
  elapsed+=d;n=round(elapsed/10)*10;durations.append(max(10,n-rounded));rounded=n
 durations[-1]+=700
 render[0].save(dest/(name+'.gif'),save_all=True,append_images=render[1:],duration=durations,loop=0,disposal=2)
selected=feel['clips']['snappy']['sourceFrames'];sel=[rows[i] for i in selected]
result={'canvas':[640,512],'frames':25,'selectedFrames':selected,'excludedWeaponOcclusionFrames':[8,9,10,11,12],'selectedBorderTouchFrames':[r['frame'] for r in sel if r['borderPixels']],'allBorderTouchFrames':[r['frame'] for r in rows if r['borderPixels']],'minimumMarginsLTRB':[min(r['bounds'][0] for r in sel),min(r['bounds'][1] for r in sel),min(640-r['bounds'][2] for r in sel),min(512-r['bounds'][3] for r in sel)],'timingMs':{k:sum(v['durations']) for k,v in feel['clips'].items()},'gifNote':'centisecond rounding; 700ms pause after each attack; HTML uses exact milliseconds','framesEvidence':rows}
(dest/'bounds.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='framesEvidence'}))
