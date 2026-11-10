from pathlib import Path
import json, shutil, subprocess
from PIL import Image
R=Path(__file__).resolve().parent;P=R.parents[1];Q=R/'qa';A=R/'assets'
m=json.loads((A/'manifest.json').read_text(encoding='utf-8'))
def tile(name,n):
    c=m['clips'][name];im=Image.open(A/f'{name}.png').convert('RGBA');w,h=c['width'],c['height'];x=n%c['columns']*w;y=n//c['columns']*h
    return im.crop((x,y,x+w,y+h))
cast=Q/'cast';cast.mkdir(exist_ok=True)
for n,clip in [('hero','hero-walk'),('enemy','enemy'),('boss','boss')]:tile(clip,0).save(cast/f'{n}.png')
(Q/'cast-sizes.json').write_text(json.dumps({'hero':148,'enemy':144,'boss':203}),encoding='utf-8')
frames=Q/'flash-proxy';frames.mkdir(exist_ok=True)
for i in range(9):
    im=Image.new('RGBA',(640,360),(16,24,34,255))
    if i<4:
        slash=tile('fx',i).resize((106,141),Image.Resampling.NEAREST)
        im.alpha_composite(slash,(245,170))
        spark=tile('fx',4+i).resize((82,109),Image.Resampling.NEAREST)
        im.alpha_composite(spark,(325,185))
    im.save(frames/f'frame_{i:04}.png')
jobs=[('cast',['skills/visual-qa/scripts/cast-distinct.mjs',str(cast),'--sizes',str(Q/'cast-sizes.json'),'--cvd','--out',str(Q/'cast-report')]),('flash',['skills/polish/scripts/flash-check.mjs',str(frames),'--fps','30','--loop','--blend','normal','--out',str(Q/'flash')])]
results=[]
for name,args in jobs:
    p=subprocess.run(['node',*args],cwd=P,capture_output=True,encoding='utf-8',errors='replace')
    (Q/f'{name}.txt').write_text(p.stdout+p.stderr,encoding='utf-8');results.append({'name':name,'exitCode':p.returncode,'command':['node',*args]})
(Q/'additional-results.json').write_text(json.dumps({'scope':'Cast at 960px viewport. Flash proxy: strongest generated FX at 640x360 screen scale, repeated every 300ms, normal compositing, dark background. Not a full gameplay recording or release certification.','runs':results},indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
for old in ['browser-playthrough','browser-controls']:
    f=Q/f'{old}.json'
    if f.exists():shutil.copy2(f,Q/f'{old}.txt')
