from pathlib import Path
import json,hashlib,math
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent;repo=root.parents[2]
server=repo/'out/experiments/local-motion-20261106'
source=repo/'samples/motion-court/drivers/slash'
motion=json.loads((source/'motion.json').read_text(encoding='utf-8'))
files=sorted((source/'frames').glob('frame_*.png'))
ims=[Image.open(f).convert('RGBA') for f in files]
W,H=640,512;sw,sh=ims[0].size
pixels=sh/motion['projection']['ortho_scale']
root0=motion['motion'][0]['joints']['root'][0]
shifts=[(m['joints']['root'][0]-root0)*pixels for m in motion['motion']]
boxes=[im.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox() for im in ims]
union=(min(b[0]-dx for b,dx in zip(boxes,shifts)),min(b[1] for b in boxes),max(b[2]-dx for b,dx in zip(boxes,shifts)),max(b[3] for b in boxes))
scale=min((W-80)/(union[2]-union[0]),(H-64)/(union[3]-union[1]))
ox=(W-scale*(union[2]-union[0]))/2-scale*union[0];oy=H-32-scale*union[3]
dest=root/'input';dest.mkdir(exist_ok=True)
def white(im):
 bg=Image.new('RGB',im.size,'white');bg.paste(im,mask=im.getchannel('A'));return bg
records=[]
for i,(im,dx,p) in enumerate(zip(ims,shifts,files)):
 affine=(1/scale,0,dx-ox/scale,0,1/scale,-oy/scale)
 framed=im.transform((W,H),Image.Transform.AFFINE,affine,Image.Resampling.BICUBIC)
 white(framed).save(dest/f'driver_{i:03}.png')
 records.append({'source':str(p.relative_to(repo)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'rootRemovedPx':dx,'bbox':framed.getbbox()})
seed=repo/'out/2d-gpt-20261106/silver-swordswoman-gpt-v1.png'
ref=Image.open(seed).convert('RGBA');ref=ref.crop(ref.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox())
# Match first-frame head-to-ground height, not the raised sword's maximum height.
headz=motion['motion'][0]['joints']['DEF-head'][2]+.20
feetZ=min(motion['motion'][0]['joints']['DEF-foot.L'][2],motion['motion'][0]['joints']['DEF-foot.R'][2])
bodyheight=(headz-feetZ)*pixels*scale
ref=ref.resize((round(ref.width*bodyheight/ref.height),round(bodyheight)),Image.Resampling.LANCZOS)
ground=(sh/2+motion['projection']['center_z']*pixels)*scale+oy
rootX=(sw/2+(root0-motion['projection']['center_x'])*pixels)*scale+ox
refcanvas=Image.new('RGBA',(W,H));refcanvas.alpha_composite(ref,(round(rootX-ref.width*.48),round(ground-ref.height)))
white(refcanvas).save(dest/'reference.png')
contact=Image.new('RGB',(6*213,5*193),'#263346');draw=ImageDraw.Draw(contact)
for i in range(25):
 im=Image.open(dest/f'driver_{i:03}.png');x=i%6*213;y=i//6*193;contact.paste(im.resize((213,170)),(x,y+23));draw.text((x+4,y+4),str(i),fill='white')
contact.save(root/'driver-contact.png')
g=json.loads((server/'c-motion.api.json').read_text(encoding='utf-8'))
for k in list(g):
 if 125<=int(k)<=128 or 225<=int(k)<=228:del g[k]
for i in range(25):g[str(100+i)]['inputs']['image']=f'slash_driver_{i:03}.png'
g['1']['inputs']['image']='slash_reference.png'
g['10']['inputs'].update(width=W,height=H,length=25,pose_video=['224',0])
g['3']['inputs']['text']='A full body right-facing silver-haired female sword knight performs one powerful overhead sword slash. Long silver high ponytail, teal cape, charcoal armor with gold trim, brown leather boots and gloves. One straight silver sword with gold hilt firmly in her right hand. She raises the sword above and behind her head, coils her torso and knees, then rotates shoulders and hips and swings the sword downward and forward in a wide decisive arc, finishes in a deep forward stance. Keep the complete sword visible and connected to her hand in every frame, including above her head. Preserve the reference face, hair, cape and costume. Fixed orthographic side view, isolated pure white background, no effects or trails, no camera motion.'
g['5']['inputs']['text']='A right-facing person performs one overhead sword slash: anticipates, raises the right hand with a sword over the shoulder and head, swings downward and forward while shifting weight to the front leg, and follows through into a forward lunge. Fixed side view. Follow the driving body and weapon motion.'
g['18']['inputs']['filename_prefix']='silver-slash-20261106/a-slash/frame'
g['19']['inputs']['filename_prefix']='silver-slash-20261106/a-slash/latent'
(root/'a-slash.api.json').write_text(json.dumps(g,indent=2),encoding='utf-8')
meta={'canvas':[W,H],'driver':str(source.relative_to(repo)),'author':motion['author'],'license':motion['license'],'sourceSha256':motion['source_sha256'],'inputReferenceSha256':hashlib.sha256(seed.read_bytes()).hexdigest(),'scale':scale,'offset':[ox,oy],'ground':ground,'rootX':rootX,'bodyHeight':bodyheight,'sourceDuration':motion['duration_seconds'],'mapping':list(range(25)),'rootMotion':'removed in driver; stationary slash prototype','paidCalls':0,'frames':records}
(root/'inputs.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
# The isolated ComfyUI server already owns this input root.
servinput=server/'input'
for p in dest.glob('*.png'):(servinput/('slash_'+p.name)).write_bytes(p.read_bytes())
print(json.dumps({'canvas':[W,H],'bodyHeight':bodyheight,'rootX':rootX,'ground':ground,'frames':len(files)}))
