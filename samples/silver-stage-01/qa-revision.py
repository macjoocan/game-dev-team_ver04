"""Re-run checks for combo, sprint and enlarged FX without replacing v1 evidence."""
from pathlib import Path
import json, subprocess, math
from PIL import Image
R=Path(__file__).resolve().parent; P=R.parents[1]; Q=R/'qa'/'v2'; Q.mkdir(exist_ok=True)
f=json.loads((R/'feel.json').read_text(encoding='utf-8'))
m=json.loads((R/'assets/manifest.json').read_text(encoding='utf-8'))['clips']['fx']
sheet=Image.open(R/'assets/fx.png').convert('RGBA')
frames=Q/'flash-proxy';frames.mkdir(exist_ok=True)
fps=60; count=math.ceil(f['pace']['actionIntervalMs']*fps/1000)
for i in range(count):
    im=Image.new('RGBA',(640,360),(16,24,34,255)); age=i*1000/fps
    for start,life,scale,anchor in [(0,f['visual']['slashDurationMs'],max(f['visual']['slashScales']),(330,220)),(4,f['visual']['sparkDurationMs'],1.7,(380,220))]:
        if age>=life:continue
        n=start+min(3,int(age/life*4));x=n%m['columns']*m['width'];y=n//m['columns']*m['height']
        w=round(m['width']*scale/2);h=round(m['height']*scale/2)
        tile=sheet.crop((x,y,x+m['width'],y+m['height'])).resize((w,h),Image.Resampling.NEAREST)
        im.alpha_composite(tile,(anchor[0]-w//2,anchor[1]-h//2))
    im.save(frames/f'frame_{i:04}.png')
jobs=[('combat',['--test',str(R/'game.test.mjs')]),('syntax',['--check',str(R/'main.mjs')]),('feel',[str(P/'skills/polish/scripts/feel-audit.mjs'),str(R/'feel.json'),'--out',str(Q/'feel')]),('flash',[str(P/'skills/polish/scripts/flash-check.mjs'),str(frames),'--fps',str(fps),'--loop','--blend','normal','--out',str(Q/'flash')]),('plugin',[str(P/'scripts/validate-plugin.mjs')])]
results=[]
for name,args in jobs:
    p=subprocess.run(['node',*args],cwd=P,capture_output=True,encoding='utf-8',errors='replace')
    (Q/f'{name}.txt').write_text(p.stdout+p.stderr,encoding='utf-8');results.append({'name':name,'exitCode':p.returncode,'command':['node',*args]})
(Q/'results.json').write_text(json.dumps({'scope':'FX proxy: maximum scale 3.5, dark 640x360 screen, full alpha, 16 frames at 60fps. Full gameplay compositing not measured.','runs':results},indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
