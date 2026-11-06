from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib,shutil
root=Path(__file__).resolve().parent
source=root/'alpha';dest=root/'alpha-repaired';dest.mkdir(exist_ok=True)
for p in source.glob('frame_*.png'):shutil.copyfile(p,dest/p.name)
name='frame_0007.png'
raw=np.asarray(Image.open(root/'a-slash'/name).convert('RGB'),dtype=np.float32)
before=np.asarray(Image.open(source/name).convert('RGBA')).copy();out=before.copy()
roi=Image.new('L',(640,512));polygon=[(419,352),(559,383),(560,401),(419,376)];ImageDraw.Draw(roi).polygon(polygon,fill=255)
inside=np.asarray(roi)>0
delta=255-raw.min(axis=2)
candidate=np.where((delta>8)&inside,np.clip(delta/128,0,1),0)
alpha=before[:,:,3].astype(np.float32)/255
changed=(candidate>alpha+.015)&inside
newalpha=np.maximum(candidate,alpha)
foreground=np.clip((raw-255*(1-newalpha[:,:,None]))/np.maximum(newalpha[:,:,None],.02),0,255)
out[changed,:3]=foreground[changed].astype(np.uint8)
out[changed,3]=(newalpha[changed]*255).astype(np.uint8)
assert np.array_equal(out[~inside],before[~inside])
assert np.sum(out[360:405,435:555,3]>32)>150,'Blade recovery failed'
Image.fromarray(out).save(dest/name)
record={'frame':7,'method':'Recover only source-visible blurred blade alpha in inspected polygon; no new sword pixels painted','polygon':polygon,'background':255,'contrastThreshold':8,'alphaContrastScale':128,'changedPixels':int(changed.sum()),'outsidePolygonUnchanged':True,'originalGeneratedSha256':hashlib.sha256((root/'a-slash'/name).read_bytes()).hexdigest(),'originalAlphaSha256':hashlib.sha256((source/name).read_bytes()).hexdigest(),'outputSha256':hashlib.sha256((dest/name).read_bytes()).hexdigest(),'otherFramesUnchanged':all((source/p.name).read_bytes()==p.read_bytes() for p in dest.glob('*.png') if p.name!=name)}
(dest/'repair.json').write_text(json.dumps(record,indent=2),encoding='utf-8');print(json.dumps(record))
