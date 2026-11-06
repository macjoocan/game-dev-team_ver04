from pathlib import Path
from PIL import Image,ImageDraw
import json,sys
root=Path(__file__).resolve().parent
name=sys.argv[1] if len(sys.argv)>1 else 'a-slash'
run=json.loads((root/(name+'-run.json')).read_text(encoding='utf-8'))
assert run['status']=='success'
server=root.parent/'local-motion-20261106'
dest=root/name;dest.mkdir(exist_ok=True)
files=[server/'output'/f['subfolder']/f['filename'] for f in run['history']['outputs']['18']['images']]
frames=[Image.open(p).convert('RGB') for p in files]
sheet=Image.new('RGB',(6*256,5*227),'#253144');draw=ImageDraw.Draw(sheet)
for i,im in enumerate(frames):
 im.save(dest/f'frame_{i:04}.png');x=i%6*256;y=i//6*227;sheet.paste(im.resize((256,205)),(x,y+22));draw.text((x+5,y+5),str(i),fill='white')
sheet.save(dest/'contact.png')
frames[0].save(dest/'preview.gif',save_all=True,append_images=frames[1:],duration=64,loop=0)
print(dest/'contact.png')
