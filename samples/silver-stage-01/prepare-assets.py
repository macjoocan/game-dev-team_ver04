from pathlib import Path
import sys, json, shutil, hashlib, subprocess
from PIL import Image, ImageDraw
import numpy as np

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
ASSETS=ROOT/'assets'
WORK=ROOT/'build'
WORK.mkdir(exist_ok=True)
FORGE=REPO/'out/shorts-research-20261110/vendor/agent-sprite-forge/skills/video2dsprite/scripts'
sys.path.insert(0,str(FORGE))
import finish_frames as ff
palette=REPO/'out/pixel-probe-20261106/palette.json'
manifest={'status':'review','artSource':'built-in GPT image generation; existing GPT hero and local motion reused','clips':{},'files':[],'limitations':['Generated pose sheets use distinct key poses, not video motion synthesis.','Hero attack and walk reuse existing local motion.','Human gameplay approval pending.']}

def atlas(name,files,anchor):
    ims=[Image.open(f).convert('RGBA') for f in files]
    w,h=ims[0].size
    cols=min(8,len(ims)); rows=(len(ims)+cols-1)//cols
    out=Image.new('RGBA',(w*cols,h*rows))
    for i,im in enumerate(ims):out.paste(im,(i%cols*w,i//cols*h))
    out.save(ASSETS/f'{name}.png')
    edges=[]
    for i,im in enumerate(ims):
        a=np.asarray(im)[...,3]>0
        if a[0].any() or a[-1].any() or a[:,0].any() or a[:,-1].any():edges.append(i)
    manifest['clips'][name]={'url':f'assets/{name}.png','width':w,'height':h,'columns':cols,'count':len(ims),'anchor':anchor,'edgeTouchFrames':edges}

def finish(name,source,target=104,canvas='144x144',pal=None,anchor='72,128',version=''):
    out=WORK/(name+'-finished'+version)
    args=[sys.executable,str(FORGE/'finish_frames.py'),'hibit','--frames',str(source),'--output-dir',str(out),'--target-height',str(target),'--canvas',canvas,'--canvas-anchor',anchor,'--display-sizes','1x','--outline','none','--loop-policy','oneshot','--colors','32']
    if pal:args = args[:-2]+['--palette',str(pal)]
    if not out.exists():
        p=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace')
        (WORK/f'{name}.log').write_text(p.stdout+p.stderr,encoding='utf-8')
        if p.returncode: raise RuntimeError(p.stderr)
    meta=json.loads((out/'finish.json').read_text(encoding='utf-8'))
    atlas(name,sorted((out/'frames').glob('*.png')),meta['anchor'])
    manifest['clips'][name]['finish']=meta['qa']

def split(name,cols,rows):
    im=Image.open(ASSETS/'source'/f'{name}.png').convert('RGBA')
    folder=WORK/name;folder.mkdir(exist_ok=True)
    cw,ch=im.width//cols,im.height//rows
    cells=[]
    for i in range(cols*rows):
        cell=im.crop((i%cols*cw,i//cols*ch,(i%cols+1)*cw,(i//cols+1)*ch))
        a=np.array(cell);a[...,3]=np.where(a[...,3]>=160,255,0)
        a[a[...,3]==0,:3]=0
        cell=Image.fromarray(a)
        # Grounded key poses share one foot line. Horizontal pose movement is preserved.
        b=cell.getbbox()
        if b:
            shifted=Image.new('RGBA',(cw,ch+32));shifted.paste(cell,(0,ch-24-b[3]));cell=shifted
        cell.save(folder/f'frame_{i:04}.png')
        cells.append(cell)
    return folder

atlas('hero-walk',sorted((REPO/'out/shorts-research-20261110/hibit128/frames').glob('*.png')),[74,116])
finish('hero-attack',REPO/'out/experiments/silver-slash-20261106/alpha-repaired',pal=palette,canvas='192x176',anchor='96,160',version='-v2')
finish('hero-poses',split('hero-poses',3,2),pal=palette)
finish('enemy',split('enemy',4,2))
finish('boss',split('boss',4,2))

# FX preserve generated color shapes; remove low-alpha haze, reduce to a crisp grid.
fx=Image.open(ASSETS/'source/fx.png').convert('RGBA'); paths=[]
fxdir=WORK/'fx';fxdir.mkdir(exist_ok=True)
for i in range(8):
    cell=fx.crop((i%4*384,i//4*512,(i%4+1)*384,(i//4+1)*512))
    cell=cell.resize((96,128),Image.Resampling.BOX)
    a=np.array(cell);a[...,3]=np.where(a[...,3]>=175,255,0);a[a[...,3]==0,:3]=0
    f=fxdir/f'frame_{i:04}.png';Image.fromarray(a).save(f);paths.append(f)
atlas('fx',paths,[48,64])

bg=Image.open(ASSETS/'source/background.png').convert('RGB')
bg.save(ASSETS/'background.jpg',quality=94,subsampling=0)
for f in sorted(ASSETS.rglob('*')):
    if f.is_file() and f.name!='manifest.json':
        manifest['files'].append({'path':str(f.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size})
(ASSETS/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
contact=Image.new('RGB',(960,600),'#17212d');d=ImageDraw.Draw(contact)
for row,name in enumerate(['hero-walk','hero-attack','hero-poses','enemy','boss']):
    m=manifest['clips'][name];im=Image.open(ASSETS/f'{name}.png')
    for j,idx in enumerate([0,min(3,m['count']-1),min(4,m['count']-1),min(6,m['count']-1)]):
        w,h=m['width'],m['height'];tile=im.crop((idx%m['columns']*w,idx//m['columns']*h,(idx%m['columns']+1)*w,(idx//m['columns']+1)*h))
        tile.thumbnail((120,120),Image.Resampling.NEAREST);contact.paste(tile,(180+j*180,row*120),tile)
    d.text((8,row*120+45),name,fill='white')
contact.save(WORK/'contact.png')
print(json.dumps({k:{'size':[v['width'],v['height']],'count':v['count'],'anchor':v['anchor'],'edgeTouchFrames':v['edgeTouchFrames']} for k,v in manifest['clips'].items()},indent=2))
