from pathlib import Path
from PIL import Image
import json,shutil,hashlib
import numpy as np
root=Path(__file__).resolve().parent;old=root.parent/'red-combat-3h-20261113';merc=root.parent/'red-mercenary-20261113';(root/'qa').mkdir(exist_ok=True);(root/'raw').mkdir(exist_ok=True)
for name in ['feel.json','model.mjs','view.mjs']:shutil.copyfile(old/name,root/('previous-'+name))
for action in ['idle','combo1','combo2','combo3','dash','spin']:
    folder=root/'pixel'/action;folder.mkdir(parents=True,exist_ok=True)
    for p in (old/'pixel'/action).glob('frame_*.png'):shutil.copyfile(p,folder/p.name)
for action in ['walk','run']:
    folder=root/'pixel'/action;folder.mkdir(parents=True,exist_ok=True);seed=Image.open(merc/'pixel/3h'/action/'frame_0000.png');base=seed.getbbox()[3]-1+12
    for i in range(8):
        im=Image.open(merc/'pixel/3h'/action/f'frame_{i:04}.png').convert('RGBA');bottom=im.getbbox()[3]-1+12;dy=95-(bottom if action=='walk' or i in [0,4] else base);out=Image.new('RGBA',(120,120));out.paste(im,(12,12+dy));out.save(folder/f'frame_{i:04}.png')
source=Path('C:/Users/NHN/.codex/generated_images/01a1abb8-999d-70a1-a4f9-cceb6da754a4/exec-5e906ad9-09aa-4061-a70a-1bc12116b602.png');shutil.copyfile(source,root/'raw/transitions.png');im=Image.open(source).convert('RGBA');assert im.size==(1536,1024)
cells=[]
for n in range(12):
    col=n%4;row=n//4;y0=round(row*1024/3);y1=round((row+1)*1024/3);cell=im.crop((col*384,y0,(col+1)*384,y1));a=np.asarray(cell);ys,xs=np.where(a[...,3]>=128);assert len(xs)>0;assert xs.min()>0 and xs.max()<383;cells.append((cell,int(ys.max()),int(ys.min())))
scale=64/(cells[0][1]-cells[0][2]+1);records=[]
for n,(cell,bottom,top) in enumerate(cells):
    action='evade' if n<8 else 'guard';i=n if n<8 else n-8;folder=root/'source'/action;folder.mkdir(parents=True,exist_ok=True);anchor=cells[0][1] if n in [2,3] else cells[6][1] if n==4 else bottom
    out=Image.new('RGBA',(480,480));resized=cell.resize((round(cell.width*scale*4),round(cell.height*scale*4)),Image.Resampling.LANCZOS);x=round(240-192*scale*4);y=round(380-anchor*scale*4);out.paste(resized,(x,y));out.save(folder/f'frame_{i:04}.png');records.append({'action':action,'frame':i,'scale':scale,'anchor':anchor,'sourceCell':n})
(root/'source-manifest.json').write_text(json.dumps({'status':'review','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'newFrames':records,'existingFrames':'copied; old source files unchanged'},indent=2),encoding='utf8');print(json.dumps({'existingFrames':64,'newFrames':12,'uniformScale':scale}))
