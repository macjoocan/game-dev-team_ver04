from PIL import Image, ImageDraw
from pathlib import Path
import json
root=Path('out/experiments/red-flow-3h-20261113')
feet={}
for clip in ['walk','run','evade']:
    feet[clip]={}
    for i in ([0,4] if clip!='evade' else [5]):
        im=Image.open(root/'pixel'/clip/f'frame_{i:04d}.png').convert('RGBA')
        alpha=im.getchannel('A'); b=alpha.getbbox(); points=[]
        for y in range(b[3]-3,b[3]):
            for x in range(b[0],b[2]):
                if alpha.getpixel((x,y))>127:points.append(x)
        points.sort();feet[clip][i]=points[int(len(points)*(.8 if i==0 else .2))]
(root/'feet.json').write_text(json.dumps(feet,indent=2))
sheet=Image.new('RGB',(8*240,3*260),(24,36,45));d=ImageDraw.Draw(sheet)
for r,clip in enumerate(['evade','guard','run']):
    for i,p in enumerate(sorted((root/'pixel'/clip).glob('*.png'))):
        im=Image.open(p).convert('RGBA').resize((240,240),Image.Resampling.NEAREST)
        sheet.paste(im,(i*240,r*260),im);d.text((i*240+8,r*260+242),f'{clip} {i}',fill='white')
sheet.save(root/'contact.png')
print(feet)
