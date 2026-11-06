from pathlib import Path
import importlib.metadata as metadata,json,sys
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'deps'))
names=['numpy','Pillow','torch','torchvision','kornia','scipy','opencv-python-headless']
data={'python':sys.version,'packages':{n:metadata.version(n) for n in names},'PixelOE':{'version':'1.0.1','commit':'7ce444b36d3876a151d845d4493240e904454d89','url':'https://github.com/KohakuBlueleaf/PixelOE','license':'Apache-2.0'},'note':'Observed environment, not a claim of cross-platform reproduction. Preview only needs a static HTTP server.'}
(root/'environment.json').write_text(json.dumps(data,indent=2),encoding='utf8')
print(json.dumps(data,indent=2))
