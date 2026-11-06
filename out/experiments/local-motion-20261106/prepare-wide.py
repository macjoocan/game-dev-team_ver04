from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parent
for p in (root/'input').glob('*.png'):
 if p.name.startswith('wide_'):continue
 im=Image.open(p).convert('RGB')
 if im.size!=(384,448):continue
 canvas=Image.new('RGB',(480,512),'white')
 canvas.paste(im,(48,32))
 canvas.save(root/'input'/('wide_'+p.name))
g=json.loads((root/'b-motion.api.json').read_text(encoding='utf-8-sig'))
for n in g.values():
 if n['class_type']=='LoadImage':n['inputs']['image']='wide_'+n['inputs']['image']
g['10']['inputs'].update(width=480,height=512)
g['18']['inputs']['filename_prefix']='c-motion/frame'
g['19']['inputs']['filename_prefix']='c-motion/latent'
(root/'c-motion.api.json').write_text(json.dumps(g,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'wide-framing.json').write_text(json.dumps({'sourceCanvas':[384,448],'canvas':[480,512],'offset':[48,32],'scale':1,'reason':'prevent generated sword from crossing frame; keep original reference pixel scale'},indent=2),encoding='utf-8')
print('Prepared 480x512 padded references without scaling original pixels.')
