from pathlib import Path
import json,base64,io,hashlib
from PIL import Image
root=Path(__file__).resolve().parent
data=json.loads((root/'qa/fx-capture.json').read_text(encoding='utf8'))
for mode,frames in data['modes'].items():
    folder=root/'qa'/('flash-frames-'+mode);folder.mkdir(exist_ok=True)
    for i,src in enumerate(frames):(folder/f'frame_{i:04}.png').write_bytes(base64.b64decode(src.split(',')[1]))
records=[]
for col,h in enumerate([2,3,5]):
    frames=[Image.open(io.BytesIO(base64.b64decode(s.split(',')[1]))).convert('RGB').crop((col*420,0,(col+1)*420,360)) for s in data['modes']['normal']]
    p=root/'gifs'/f'{h}h-slash-fx.gif';frames[0].save(p,save_all=True,append_images=frames[1:],duration=20,loop=0,disposal=2)
    with Image.open(p) as im:
        ds=[]
        for i in range(im.n_frames):im.seek(i);ds.append(im.info['duration'])
        records.append({'path':str(p),'frames':im.n_frames,'durationMs':sum(ds),'size':im.size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(root/'qa/gif-export.json').write_text(json.dumps(records,indent=2),encoding='utf8')
print(json.dumps(records))
