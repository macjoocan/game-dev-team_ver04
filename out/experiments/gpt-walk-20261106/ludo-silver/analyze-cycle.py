from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json
b=Path(__file__).resolve().parent
files=sorted((b/'export/animation-pack/Right-facing-side-vi').glob('*.png'))
ims=[Image.open(p).convert('RGBA') for p in files]
sheet=Image.new('RGB',(9*185,4*235),'#eeeeee');d=ImageDraw.Draw(sheet)
for i,im in enumerate(ims):
    thumb=im.copy();thumb.thumbnail((180,208))
    x=(i%9)*185;y=(i//9)*235
    sheet.paste(thumb,(x,y+20),thumb);d.text((x+4,y+3),f'{i:02}',fill='black')
sheet.save(b/'contact-all.png')
small=[]
for im in ims:
    a=np.asarray(im.resize((104,122)),dtype=np.float32)/255
    a[:,:,:3]*=a[:,:,3:4];small.append(a)
def dist(i,j):return float(np.abs(small[i]-small[j]).mean())
adj=[dist(i,i+1) for i in range(len(ims)-1)]
candidates=[]
for n in range(18,33):
    for start in range(len(ims)-n):
        end=start+n
        candidates.append(dict(start=start,endExclusive=end,frames=n,closingMatch=dist(start,end),seam=dist(end-1,start),localStep=float(np.median(adj[start:end-1]))))
candidates.sort(key=lambda x:x['closingMatch'])
(b/'cycle-search.json').write_text(json.dumps({'method':'Premultiplied RGBA mean absolute difference, fixed canvas, no registration; candidate ranking only, not gait validation','candidates':candidates[:25],'fullSeam':dist(35,0),'adjacentMedian':float(np.median(adj))},indent=2))
print(json.dumps(candidates[:8],indent=2))
