from pathlib import Path
import os,sys,json,time,hashlib
ROOT=Path(__file__).resolve().parent
VENDOR=ROOT.parent.parent/'pixel-probe-20261106'
sys.path.insert(0,str(VENDOR/'vendor/PixelOE/src'));sys.path.insert(0,str(VENDOR/'deps'))
os.environ['PIXELOE_BACKEND']='torch'
import numpy as np
from PIL import Image,ImageDraw
import torch
from scipy.ndimage import distance_transform_edt
from pixeloe.torch.pixelize import pixelize
torch.set_num_threads(4);torch.manual_seed(7)
device='cuda' if torch.cuda.is_available() else 'cpu'
manifest=json.loads((ROOT/'source-manifest.json').read_text(encoding='utf8'))
paths=sorted((ROOT/'source').glob('*/*/frame_*.png'))
assert len(paths)==120
samples=[]
for p in paths:
    a=np.asarray(Image.open(p).convert('RGBA'));samples.append(a[a[...,3]>=128,:3][::3])
colors=Image.fromarray(np.concatenate(samples).reshape(1,-1,3)).quantize(colors=32,method=Image.Quantize.MEDIANCUT).getpalette()[:96]
pal=Image.new('P',(1,1));pal.putpalette(colors+colors[-3:]*224)
(ROOT/'palette.json').write_text(json.dumps({'scope':'all three proportions and fifteen clips','colors':[colors[i:i+3] for i in range(0,96,3)]},indent=2))
durations={'idle':[140]*8,'walk':[85]*8,'run':[60]*8,'slash':[20,70,25,35,30,85,60,55],'hurt':[30,40,70,100,60,60,60,80]}
records=[];started=time.time()
for heads,size in [(2,64),(3,96),(5,128)]:
    for motion in manifest['motions']:
        folder=ROOT/'pixel'/f'{heads}h'/motion;folder.mkdir(parents=True,exist_ok=True)
        outframes=[];metrics=[]
        for i in range(8):
            p=ROOT/'source'/f'{heads}h'/motion/f'frame_{i:04}.png';im=Image.open(p).convert('RGBA')
            alpha=np.asarray(im.resize((size,size),Image.Resampling.BOX))[...,3]>=128
            pre=np.asarray(im.resize((size*4,size*4),Image.Resampling.BICUBIC));mask=pre[...,3]>=128
            distance,indices=distance_transform_edt(~mask,return_indices=True);rgb=pre[...,:3].copy();near=(~mask)&(distance<=12)
            rgb[near]=rgb[indices[0][near],indices[1][near]];rgb[(~mask)&(~near)]=[32,40,48]
            t=torch.from_numpy(rgb.copy()).permute(2,0,1).unsqueeze(0).float().to(device)/255
            with torch.inference_mode(): result=pixelize(t,pixel_size=4,thickness=1,mode='contrast',do_color_match=False,do_quant=False,no_post_upscale=True,backend='torch')
            rgb=(result[0].permute(1,2,0).cpu().numpy()*255).clip(0,255).round().astype(np.uint8)
            q=np.asarray(Image.fromarray(rgb).quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB'))
            rgba=np.dstack([q,alpha.astype(np.uint8)*255]);rgba[~alpha,:3]=0
            out=Image.fromarray(rgba);out.save(folder/f'frame_{i:04}.png');outframes.append(out)
            metrics.append({'frame':i,'colors':len(np.unique(rgba[alpha,:3],axis=0)),'semiAlpha':0,'borderPixels':int(alpha[0].sum()+alpha[-1].sum()+alpha[:,0].sum()+alpha[:,-1].sum()),'foregroundPixels':int(alpha.sum())})
        gif=[];zoom={2:4,3:3,5:2}[heads]
        for im in outframes:
            bg=Image.new('RGBA',im.size,(21,33,43,255));bg.alpha_composite(im);gif.append(bg.convert('RGB').resize((size*zoom,size*zoom),Image.Resampling.NEAREST))
        gd=durations[motion].copy()
        if motion in ['slash','hurt']:gd[-1]+=620
        (ROOT/'gifs').mkdir(exist_ok=True)
        gif[0].save(ROOT/'gifs'/f'{heads}h-{motion}.gif',save_all=True,append_images=gif[1:],duration=gd,loop=0,disposal=2)
        records.append({'heads':heads,'motion':motion,'canvas':[size,size],'frames':8,'durationsMs':durations[motion],'gifDurationsMs':[(x//10)*10 for x in gd],'displayZoom':zoom,'metrics':metrics})
        print(f'{heads}h {motion} done',flush=True)
sheet=Image.new('RGB',(3*320,5*310),(21,33,43));draw=ImageDraw.Draw(sheet)
for col,h in enumerate([2,3,5]):
    for row,motion in enumerate(manifest['motions']):
        idx=3 if motion in ['slash','hurt'] else 0
        im=Image.open(ROOT/'pixel'/f'{h}h'/motion/f'frame_{idx:04}.png').convert('RGBA').resize((280,280),Image.Resampling.NEAREST)
        sheet.paste(im,(col*320+20,row*310+25),im);draw.text((col*320+16,row*310+7),f'{h} heads / {motion}',fill=(200,220,210))
sheet.save(ROOT/'comparison.png')
assert all(hashlib.sha256(Path(f['file']).read_bytes()).hexdigest()==f['sha256'] for f in manifest['frames'])
result={'id':manifest['id'],'status':'review','productionApproved':False,'tool':'PixelOE 1.0.1','device':device,'settings':{'pixel_size':4,'thickness':1,'mode':'contrast','colors':32,'dither':False,'alphaThreshold':128},'note':'PixelOE RGB plus source alpha mask and fixed cast palette; target head proportions are art direction, not anatomical measurement.','seconds':round(time.time()-started,2),'sourceUnchanged':True,'clips':records}
(ROOT/'manifest.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'clips':len(records),'frames':120,'seconds':result['seconds'],'device':device}),flush=True)
