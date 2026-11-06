from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib
root=Path(__file__).resolve().parent
frames=sorted((root/'c-alpha').glob('frame_*.png'))
assert len(frames)==26,'Wait for all 26 alpha frames'
out=root/'c-preview';out.mkdir(exist_ok=True)
ims=[Image.open(p).convert('RGBA') for p in frames]
records=[];preview=[]
contact=Image.new('RGB',(6*240,5*280),(25,34,47));draw=ImageDraw.Draw(contact)
for i,(p,im) in enumerate(zip(frames,ims)):
 a=np.asarray(im)[:,:,3];ys,xs=np.where(a>16)
 margins=[int(xs.min()),int(ys.min()),int(im.width-1-xs.max()),int(im.height-1-ys.max())]
 records.append({'frame':i,'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'alpha16MarginsLTRB':margins,'borderPixels':int((a[0]>16).sum()+(a[-1]>16).sum()+(a[:,0]>16).sum()+(a[:,-1]>16).sum())})
 bg=Image.new('RGBA',im.size,(35,46,63,255));bg.alpha_composite(im)
 preview.append(bg.convert('RGB'))
 small=bg.convert('RGB').resize((240,256),Image.Resampling.LANCZOS)
 x=i%6*240;y=i//6*280;contact.paste(small,(x,y+24));draw.text((x+5,y+5),str(i),fill='white')
contact.save(out/'contact.png')
preview[0].save(out/'cycle26.gif',save_all=True,append_images=preview[1:],duration=70,loop=0,disposal=2)
manifest={'id':'chr.silver.local-wan-animate2.walk','status':'review','canvas':[480,512],'frameCount':26,'fps':14.4,'fpsSource':'estimated from existing Ludo export','origin':'top-left','pivot':[240,464],'pivotStatus':'proposed fixed ground anchor; engine validation pending','normalization':'Common input padding and output canvas; no per-frame bbox recentering or scaling','source':'GPT still + existing Ludo cycle26 pose driver, local Wan Animate 2','generationReceipt':'c-motion-run.json','paidGenerationCalls':0,'productionApproved':False,'frames':records}
manifest['pivot']=[260,462]
manifest['pivotStatus']='Ludo toolbox measured feet anchor; engine validation pending'
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
summary={'frames':len(records),'canvas':[480,512],'borderTouchFrames':[r['frame'] for r in records if r['borderPixels']],'minimumMarginsLTRB':[min(r['alpha16MarginsLTRB'][j] for r in records) for j in range(4)]}
(out/'bounds.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary))
