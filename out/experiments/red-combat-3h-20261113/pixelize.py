from pathlib import Path
import os,sys,json,time
ROOT=Path(__file__).resolve().parent
VENDOR=ROOT.parent.parent/'pixel-probe-20261106'
sys.path.insert(0,str(VENDOR/'vendor/PixelOE/src'));sys.path.insert(0,str(VENDOR/'deps'));os.environ['PIXELOE_BACKEND']='torch'
import numpy as np
from PIL import Image
import torch
from scipy.ndimage import distance_transform_edt
from pixeloe.torch.pixelize import pixelize
torch.set_num_threads(4);torch.manual_seed(7)
device='cuda' if torch.cuda.is_available() else 'cpu'
old=ROOT.parent/'red-mercenary-20261113';colors=json.loads((old/'palette.json').read_text())['colors'];flat=sum(colors,[]);pal=Image.new('P',(1,1));pal.putpalette(flat+colors[-1]*224)
records=[]
for action in ['combo1','combo2','combo3','dash','spin']:
    folder=ROOT/'pixel'/action;folder.mkdir(parents=True,exist_ok=True)
    metrics=[]
    for i in range(8):
        im=Image.open(ROOT/'source'/'3h'/action/f'frame_{i:04}.png').convert('RGBA');alpha=np.asarray(im.resize((120,120),Image.Resampling.BOX))[...,3]>=128
        pre=np.asarray(im.resize((480,480),Image.Resampling.BICUBIC));mask=pre[...,3]>=128;distance,indices=distance_transform_edt(~mask,return_indices=True);rgb=pre[...,:3].copy();near=(~mask)&(distance<=12);rgb[near]=rgb[indices[0][near],indices[1][near]];rgb[(~mask)&(~near)]=[32,40,48]
        t=torch.from_numpy(rgb.copy()).permute(2,0,1).unsqueeze(0).float().to(device)/255
        with torch.inference_mode(): result=pixelize(t,pixel_size=4,thickness=1,mode='contrast',do_color_match=False,do_quant=False,no_post_upscale=True,backend='torch')
        rgb=(result[0].permute(1,2,0).cpu().numpy()*255).clip(0,255).round().astype(np.uint8);q=np.asarray(Image.fromarray(rgb).quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB'));rgba=np.dstack([q,alpha.astype(np.uint8)*255]);rgba[~alpha,:3]=0;Image.fromarray(rgba).save(folder/f'frame_{i:04}.png')
        metrics.append({'frame':i,'colors':len(np.unique(rgba[alpha,:3],axis=0)),'semiAlpha':0,'borderPixels':int(alpha[0].sum()+alpha[-1].sum()+alpha[:,0].sum()+alpha[:,-1].sum())})
    records.append({'id':action,'frames':8,'canvas':[120,120],'metrics':metrics});print(action+' done',flush=True)
(ROOT/'palette.json').write_text(json.dumps({'scope':'same palette as approved red mercenary preview','colors':colors},indent=2))
(ROOT/'manifest.json').write_text(json.dumps({'id':'chr.red-mercenary.combat-3h','status':'review','productionApproved':False,'generator':'GPT imagegen','processor':'PixelOE','device':device,'clips':records},indent=2),encoding='utf8')
print('40 frames complete',flush=True)
