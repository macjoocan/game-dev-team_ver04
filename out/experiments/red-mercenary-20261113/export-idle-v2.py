from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parent
m=json.loads((root/'manifest-v2.json').read_text(encoding='utf8'))
for c in m['clips']:
    if c['motion']!='idle':continue
    frames=[]
    for i in range(8):
        im=Image.open(root/c['frameFolder']/f'frame_{i:04}.png').convert('RGBA');bg=Image.new('RGBA',im.size,(21,33,43,255));bg.alpha_composite(im);frames.append(bg.convert('RGB').resize((im.width*c['displayZoom'],im.height*c['displayZoom']),Image.Resampling.NEAREST))
    frames[0].save(root/'gifs'/f"{c['heads']}h-idle-v2.gif",save_all=True,append_images=frames[1:],duration=c['durationsMs'],loop=0,disposal=2)
print('idle v2 GIFs: 3')
