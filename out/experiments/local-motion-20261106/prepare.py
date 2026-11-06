from pathlib import Path
import hashlib,json
from PIL import Image

root=Path(__file__).resolve().parent
project=root.parents[2]
seed=project/'out/2d-gpt-20261106/silver-swordswoman-gpt-v1.png'
driver=project/'out/experiments/gpt-walk-20261106/ludo-silver/cycle26'
dest=root/'input';dest.mkdir(exist_ok=True)
W,H=384,448
def box(im):return im.getchannel('A').point(lambda a:255 if a>10 else 0).getbbox()
def place(im,bounds,scale):
    im=im.crop(bounds)
    im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
    out=Image.new('RGB',(W,H),'white')
    out.paste(im,((W-im.width)//2,H-16-im.height),im.getchannel('A'))
    return out
ref=Image.open(seed).convert('RGBA');b=box(ref)
scale=min((W-32)/(b[2]-b[0]),(H-32)/(b[3]-b[1]))
place(ref,b,scale).save(dest/'gpt-reference.png')
files=sorted(driver.glob('*.png'));ims=[Image.open(p).convert('RGBA') for p in files]
boxes=[box(i) for i in ims];bounds=(min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes))
scale=min((W-32)/(bounds[2]-bounds[0]),(H-32)/(bounds[3]-bounds[1]))
for i in range(29):place(ims[i%26],bounds,scale).save(dest/f'driver_{i:03}.png')
contact=Image.new('RGB',(W*4,H),'#dddddd')
for j,i in enumerate([0,6,13,20]):contact.paste(Image.open(dest/f'driver_{i:03}.png'),(j*W,0))
contact.save(root/'driver-contact.png')
meta={'reference':str(seed),'driver':str(driver),'driverKind':'paid Ludo output reused as motion reference; no new paid generation','canvas':[W,H],'length':29,'cycleLength':26,'fps':14.4,'mapping':[i%26 for i in range(29)],'inputFiles':[{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [seed,*files]],'limitations':['same-character calibration, not proof of arbitrary new motion','white composite, no new art generated in preparation']}
(root/'input-manifest.json').write_text(json.dumps(meta,indent=2,ensure_ascii=False),encoding='utf-8')
print('Prepared GPT reference and 29 driving frames; original PNGs preserved.')
