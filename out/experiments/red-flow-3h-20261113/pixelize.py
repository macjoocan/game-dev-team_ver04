from pathlib import Path
import os,sys,json
ROOT=Path(__file__).resolve().parent;vendor=ROOT.parent.parent/'pixel-probe-20261106';sys.path.insert(0,str(vendor/'vendor/PixelOE/src'));sys.path.insert(0,str(vendor/'deps'));os.environ['PIXELOE_BACKEND']='torch'
import numpy as np
from PIL import Image
import torch
from scipy.ndimage import distance_transform_edt
from pixeloe.torch.pixelize import pixelize
torch.set_num_threads(4);torch.manual_seed(7);device='cuda' if torch.cuda.is_available() else 'cpu';colors=json.loads((ROOT.parent/'red-mercenary-20261113/palette.json').read_text())['colors'];pal=Image.new('P',(1,1));pal.putpalette(sum(colors,[])+colors[-1]*224);records=[]
for action,count in [('evade',8),('guard',4)]:
    folder=ROOT/'pixel'/action;folder.mkdir(parents=True,exist_ok=True)
    for i in range(count):
        im=Image.open(ROOT/'source'/action/f'frame_{i:04}.png').convert('RGBA');alpha=np.asarray(im.resize((120,120),Image.Resampling.BOX))[...,3]>=128;a=np.asarray(im);mask=a[...,3]>=128;distance,idx=distance_transform_edt(~mask,return_indices=True);rgb=a[...,:3].copy();near=(~mask)&(distance<=12);rgb[near]=rgb[idx[0][near],idx[1][near]];rgb[(~mask)&(~near)]=[32,40,48];t=torch.from_numpy(rgb.copy()).permute(2,0,1).unsqueeze(0).float().to(device)/255
        with torch.inference_mode():r=pixelize(t,pixel_size=4,thickness=1,mode='contrast',do_color_match=False,do_quant=False,no_post_upscale=True,backend='torch')
        rgb=(r[0].permute(1,2,0).cpu().numpy()*255).clip(0,255).round().astype(np.uint8);q=np.asarray(Image.fromarray(rgb).quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB'));rgba=np.dstack([q,alpha.astype(np.uint8)*255]);rgba[~alpha,:3]=0;Image.fromarray(rgba).save(folder/f'frame_{i:04}.png');records.append({'action':action,'frame':i,'colors':len(np.unique(rgba[alpha,:3],axis=0)),'borderPixels':int(alpha[0].sum()+alpha[-1].sum()+alpha[:,0].sum()+alpha[:,-1].sum()),'semiAlpha':0})
    print(action+' complete',flush=True)
(ROOT/'qa/new-pixels.json').write_text(json.dumps({'device':device,'frames':records},indent=2),encoding='utf8')
