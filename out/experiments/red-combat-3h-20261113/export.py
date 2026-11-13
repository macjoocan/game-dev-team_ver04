from pathlib import Path
from PIL import Image,ImageDraw
import json,base64,io,hashlib
root=Path(__file__).resolve().parent;data=json.loads((root/'qa/capture.json').read_text(encoding='utf8'));records=[];(root/'gifs').mkdir(exist_ok=True)
for action,urls in data['clips'].items():
    folder=root/'qa'/('capture-'+action);folder.mkdir(exist_ok=True)
    for i,url in enumerate(urls):(folder/f'frame_{i:04}.png').write_bytes(base64.b64decode(url.split(',')[1]))
    if '-' in action:continue
    frames=[Image.open(folder/f'frame_{i:04}.png').convert('RGB').crop((120,40,840,400)) for i in range(len(urls))]
    samples=Image.new('RGB',(120,60*len(frames)))
    for i,im in enumerate(frames):samples.paste(im.resize((120,60),Image.Resampling.NEAREST),(0,i*60))
    pal=samples.quantize(colors=256,method=Image.Quantize.MEDIANCUT);frames=[im.quantize(palette=pal,dither=Image.Dither.NONE) for im in frames];p=root/'gifs'/f'{action}.gif';frames[0].save(p,save_all=True,append_images=frames[1:],duration=20,loop=0,disposal=2)
    with Image.open(p) as im:
        total=0
        for i in range(im.n_frames):im.seek(i);total+=im.info['duration']
        records.append({'id':action,'frames':im.n_frames,'durationMs':total,'size':im.size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    print(action+' GIF complete',flush=True)
sheet=Image.new('RGB',(960,1300),(20,33,43));draw=ImageDraw.Draw(sheet)
for row,action in enumerate(['combo1','combo2','combo3','dash','spin']):
    for col,frame in enumerate([0,3,4,7]):
        im=Image.open(root/'pixel'/action/f'frame_{frame:04}.png').convert('RGBA').resize((240,240),Image.Resampling.NEAREST);sheet.paste(im,(col*240,row*260+20),im);draw.text((col*240+8,row*260+4),f'{action} / {frame}',fill=(220,190,140))
sheet.save(root/'contact.png');(root/'qa/gifs.json').write_text(json.dumps(records,indent=2),encoding='utf8');print(json.dumps(records))
