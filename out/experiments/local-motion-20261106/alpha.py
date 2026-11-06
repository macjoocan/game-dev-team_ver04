from pathlib import Path
import sys,json,time,hashlib
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'deps'))
import numpy as np
import onnxruntime as ort
from PIL import Image

source=Path(sys.argv[1]);dest=Path(sys.argv[2]);dest.mkdir(parents=True,exist_ok=True)
model=Path('D:/AI/models/rembg/birefnet-general-lite.onnx')
opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
session=ort.InferenceSession(str(model),sess_options=opts,providers=['CPUExecutionProvider'])
files=[source] if source.is_file() else sorted(source.glob('frame_*.png'))
records=[];started=time.time()
for i,p in enumerate(files):
 im=Image.open(p).convert('RGB');rgb=np.asarray(im,dtype=np.float32)/255
 x=np.asarray(im.resize((1024,1024),Image.Resampling.LANCZOS),dtype=np.float32)
 x=x/max(float(x.max()),1e-6)
 x=(x-np.array([.485,.456,.406],dtype=np.float32))/np.array([.229,.224,.225],dtype=np.float32)
 pred=session.run(None,{session.get_inputs()[0].name:x.transpose(2,0,1)[None]})[0][0,0]
 pred=1/(1+np.exp(-np.clip(pred,-80,80)))
 pred=(pred-pred.min())/max(float(pred.max()-pred.min()),1e-6)
 mask=Image.fromarray((pred*255).astype(np.uint8)).resize(im.size,Image.Resampling.LANCZOS)
 a=np.asarray(mask,dtype=np.float32)/255
 # Remove the known white background's contribution only at partially transparent edges.
 fg=np.clip((rgb-(1-a[...,None]))/np.maximum(a[...,None],.02),0,1)
 fg[a<.02]=0;a[a<.02]=0;a[a>.985]=1
 rgba=np.dstack(((fg*255).astype(np.uint8),(a*255).astype(np.uint8)))
 target=dest/f'frame_{i:04}.png';Image.fromarray(rgba).save(target)
 records.append({'source':str(p),'file':target.name,'opaquePixels':int((a==1).sum()),'nonzeroPixels':int((a>0).sum()),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
 print(f'{i+1}/{len(files)}',flush=True)
(dest/'alpha-report.json').write_text(json.dumps({'model':str(model),'modelMd5':hashlib.md5(model.read_bytes()).hexdigest(),'provider':session.get_providers(),'method':'BiRefNet general lite, published rembg preprocessing; white edge decontamination','seconds':round(time.time()-started,2),'frames':records},indent=2),encoding='utf-8')
