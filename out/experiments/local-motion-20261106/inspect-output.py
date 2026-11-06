from pathlib import Path
from PIL import Image,ImageDraw
import json,sys
root=Path(__file__).resolve().parent
name=sys.argv[1] if len(sys.argv)>1 else 'a-motion'
run=json.loads((root/(name+'-run.json')).read_text(encoding='utf-8'))
if run['status']!='success':raise SystemExit('Generation not successful yet')
files=[root/'output'/i['subfolder']/i['filename'] for i in run['history']['outputs']['18']['images']]
out=root/name;out.mkdir(exist_ok=True)
frames=[Image.open(f).convert('RGB') for f in files]
w,h=frames[0].size
thumb_w=192;thumb_h=round(h*thumb_w/w)
sheet=Image.new('RGB',(thumb_w*6,(thumb_h+22)*5),'#202b39');draw=ImageDraw.Draw(sheet)
for i,im in enumerate(frames):
 x=(i%6)*thumb_w;y=(i//6)*(thumb_h+22)
 sheet.paste(im.resize((thumb_w,thumb_h),Image.Resampling.LANCZOS),(x,y+22));draw.text((x+5,y+4),str(i),fill='white')
sheet.save(out/'contact.png')
frames[0].save(out/'cycle26.gif',save_all=True,append_images=frames[1:26],duration=70,loop=0,optimize=False)
for i,im in enumerate(frames[:26]):im.save(out/f'frame_{i:04}.png')
(out/'manifest.json').write_text(json.dumps({'status':'concept','source':'local Wan Animate 2','frames':len(frames),'candidateFrames':26,'inputMotion':'Ludo reference reused','additionalPaidGeneration':0,'originalFiles':[str(f.relative_to(root)) for f in files],'humanApproved':False},indent=2),encoding='utf-8')
print(out/'contact.png')
