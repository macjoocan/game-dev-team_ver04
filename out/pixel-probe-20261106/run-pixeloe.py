from pathlib import Path
import os,sys,json,time,hashlib,subprocess
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'vendor/PixelOE/src'))
sys.path.insert(0,str(ROOT/'deps'))
os.environ['PIXELOE_BACKEND']='torch'
import numpy as np
from PIL import Image,ImageDraw
import torch
from scipy.ndimage import distance_transform_edt
from pixeloe.torch.pixelize import pixelize

torch.set_num_threads(4)
torch.manual_seed(7)
source=ROOT.parent/'experiments/local-motion-20261106/c-alpha'
paths=sorted(source.glob('frame_*.png'))
assert len(paths)==26
ims=[Image.open(p).convert('RGBA') for p in paths]
source_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
# One palette from the whole input clip; no per-frame palette or bbox alignment.
samples=np.concatenate([np.asarray(im)[np.asarray(im)[...,3]>=128,:3][::4] for im in ims])
palette_img=Image.fromarray(samples.reshape(1,-1,3)).quantize(colors=32,method=Image.Quantize.MEDIANCUT)
palette=np.array(palette_img.getpalette()[:96],dtype=np.uint8).reshape(32,3)
pal=Image.new('P',(1,1));pal.putpalette(palette.flatten().tolist()+palette[-1].tolist()*224)
(ROOT/'palette.json').write_text(json.dumps({'scope':'shared across all frames and variants','colors':palette.tolist()},indent=2))
variants=[('nearest96',96,False),('pixeloe64',64,True),('pixeloe96',96,True),('pixeloe128',128,True)]
records=[];started=time.time()
device='cuda' if torch.cuda.is_available() else 'cpu'
print('backend=torch device='+device,flush=True)
for name,h,oe in variants:
    folder=ROOT/name;folder.mkdir(exist_ok=True)
    w=round(480*h/512);frames=[];metrics=[]
    for i,im in enumerate(ims):
        # Keep a shared canvas and derive a binary alpha mask independently.
        small=im.resize((w,h),Image.Resampling.BOX)
        alpha=np.asarray(small)[...,3]>=128
        if oe:
            pre=im.resize((w*4,h*4),Image.Resampling.BICUBIC)
            a=np.asarray(pre);opaque=a[...,3]>=128
            distance,indices=distance_transform_edt(~opaque,return_indices=True)
            rgb=a[...,:3].copy()
            near=(~opaque)&(distance<=12)
            rgb[near]=rgb[indices[0][near],indices[1][near]]
            rgb[(~opaque)&(~near)]=[40,48,60]
            t=torch.from_numpy(rgb.copy()).permute(2,0,1).unsqueeze(0).float().to(device)/255
            with torch.inference_mode():
                result=pixelize(t,pixel_size=4,thickness=2,mode='contrast',do_color_match=False,do_quant=False,no_post_upscale=True,backend='torch')
            rgb=(result[0].permute(1,2,0).cpu().numpy()*255).clip(0,255).round().astype(np.uint8)
            rgbim=Image.fromarray(rgb)
        else:
            rgbim=im.resize((w,h),Image.Resampling.NEAREST).convert('RGB')
        q=rgbim.quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB')
        rgba=np.dstack([np.asarray(q),alpha.astype(np.uint8)*255]);rgba[~alpha,:3]=0
        resultim=Image.fromarray(rgba);resultim.save(folder/f'frame_{i:04}.png');frames.append(resultim)
        colors=len(np.unique(rgba[alpha,:3],axis=0))
        border=int(alpha[0].sum()+alpha[-1].sum()+alpha[:,0].sum()+alpha[:,-1].sum())
        metrics.append({'frame':i,'colors':colors,'semiAlpha':0,'borderPixels':border,'opaquePixels':int(alpha.sum())})
    gif=[]
    for im in frames:
        bg=Image.new('RGBA',im.size,(27,35,48,255));bg.alpha_composite(im);gif.append(bg.convert('RGB').resize((w*3,h*3),Image.Resampling.NEAREST))
    gif[0].save(ROOT/(name+'.gif'),save_all=True,append_images=gif[1:],duration=70,loop=0)
    records.append({'id':name,'pixelOE':oe,'canvas':[w,h],'frames':26,'metrics':metrics})
    print(name+' completed',flush=True)
# Original is copied only for independent preview hosting.
original=ROOT/'original';original.mkdir(exist_ok=True)
for i,im in enumerate(ims):im.save(original/f'frame_{i:04}.png')
sheet=Image.new('RGB',(5*260,3*300),(25,33,46));draw=ImageDraw.Draw(sheet)
columns=[('original','Original')]+[(v[0],v[0]) for v in variants]
for col,(name,label) in enumerate(columns):
    for row,idx in enumerate([0,7,18]):
        im=Image.open(ROOT/name/f'frame_{idx:04}.png').convert('RGBA')
        im=im.resize((240,256),Image.Resampling.LANCZOS if name=='original' else Image.Resampling.NEAREST)
        sheet.paste(im,(col*260+10,row*300+30),im)
        draw.text((col*260+10,row*300+8),f'{label} / {idx}',fill='white')
sheet.save(ROOT/'comparison.png')
assert all(hashlib.sha256(p.read_bytes()).hexdigest()==source_hashes[p.name] for p in paths)
manifest={'id':'chr.silver.pixeloe.walk','status':'review','productionApproved':False,'tool':'PixelOE','revision':subprocess.check_output(['git','-C',str(ROOT/'vendor/PixelOE'),'rev-parse','HEAD'],text=True).strip(),'license':'Apache-2.0','api':'pixeloe.torch.pixelize.pixelize','backend':'torch','device':device,'settings':{'pixel_size':4,'thickness':2,'mode':'contrast','do_color_match':False,'do_quant':False,'sharedPaletteColors':32,'dithering':False,'alphaThreshold':128},'adapter':'PixelOE RGB processing; separate fixed-size original alpha mask; shared palette quantization with Pillow. No per-frame crop or recenter.','frameDurationMs':70,'source':str(source.relative_to(ROOT.parent.parent)).replace('\\','/'),'sourceHashes':source_hashes,'sourceUnchanged':True,'paidCalls':0,'seconds':round(time.time()-started,2),'variants':records}
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'seconds':manifest['seconds'],'variants':len(records),'frames':len(records)*26}),flush=True)
