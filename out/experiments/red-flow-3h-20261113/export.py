from pathlib import Path
from PIL import Image
import json,base64,io
root=Path('out/experiments/red-flow-3h-20261113');data=json.loads((root/'qa/browser-capture.json').read_text(encoding='utf8'))
(root/'qa/browser-results.json').write_text(json.dumps(data['results'],ensure_ascii=False,indent=2),encoding='utf8')
(root/'gifs').mkdir(exist_ok=True);exports=[];thumbs=[]
for name,capture in data['captures'].items():
    out=root/'qa/captures'/name;out.mkdir(parents=True,exist_ok=True);frames=[]
    for i,url in enumerate(capture['frames']):
        raw=base64.b64decode(url.split(',')[1]);(out/f'frame_{i:04d}.png').write_bytes(raw)
        frames.append(Image.open(io.BytesIO(raw)).convert('RGB').resize((720,345),Image.Resampling.NEAREST))
    if name in ['dust','chain','guard','escape','dust-off']:
        sheet=Image.new('RGB',(1920,92*((len(frames)+9)//10)))
        for i,f in enumerate(frames):sheet.paste(f.resize((192,92),Image.Resampling.NEAREST),((i%10)*192,(i//10)*92))
        palette=sheet.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
        indexed=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
        file=root/'gifs'/f'{name}.gif';indexed[0].save(file,save_all=True,append_images=indexed[1:],duration=capture['step'],loop=0,optimize=False,disposal=2)
        gif=Image.open(file);duration=0
        for i in range(gif.n_frames):gif.seek(i);duration+=gif.info['duration']
        assert duration==capture['duration'],(name,duration,capture['duration'])
        exports.append({'file':str(file),'frames':gif.n_frames,'durationMs':duration,'size':gif.size})
    if name in ['dust','chain','guard','escape']:
        index={'dust':24,'chain':20,'guard':12,'escape':11}[name];thumbs.append(frames[index])
sheet=Image.new('RGB',(1440,690))
for i,f in enumerate(thumbs):sheet.paste(f,((i%2)*720,(i//2)*345))
sheet.save(root/'qa/visual-strip.png')
(root/'qa/gif-export.json').write_text(json.dumps(exports,indent=2),encoding='utf8')
print(exports)
