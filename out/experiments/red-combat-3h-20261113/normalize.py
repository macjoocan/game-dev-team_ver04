from pathlib import Path
from PIL import Image
import json,shutil
root=Path(__file__).resolve().parent;m=json.loads((root/'manifest.json').read_text(encoding='utf8'));records=[]
for c in m['clips']:
    src=root/'pixel'/c['id'];backup=root/'pixel-before-anchor'/c['id'];backup.mkdir(parents=True,exist_ok=True)
    for p in src.glob('*.png'):
        if not (backup/p.name).exists():shutil.copyfile(p,backup/p.name)
    reference=Image.open(backup/'frame_0000.png').getbbox()[3]-1
    for i in range(8):
        im=Image.open(backup/f'frame_{i:04}.png').convert('RGBA');bottom=im.getbbox()[3]-1;airborne=c['id']=='dash' and i in [2,3,4];dy=95-(reference if airborne else bottom);out=Image.new('RGBA',(120,120));out.paste(im,(0,dy));before=sum(a>=128 for a in im.getchannel('A').getdata());after=sum(a>=128 for a in out.getchannel('A').getdata());assert before==after,'clipped during normalization';out.save(src/f'frame_{i:04}.png');records.append({'action':c['id'],'frame':i,'dy':dy,'airborne':airborne,'beforeOpaque':before,'afterOpaque':after,'bottom':out.getbbox()[3]-1})
idle=root/'pixel/idle';idle.mkdir(exist_ok=True)
for i in range(8):
    im=Image.open(root.parent/'red-mercenary-20261113/pixel-idle-v2/3h'/f'frame_{i:04}.png').convert('RGBA');out=Image.new('RGBA',(120,120));out.paste(im,(12,12));out.save(idle/f'frame_{i:04}.png')
(root/'qa/normalization.json').write_text(json.dumps({'records':records,'idleSource':'approved idle v2, unchanged pixels padded by 12px','targetBaseline':95},indent=2),encoding='utf8');print('Normalized 40 combat frames and padded 8 approved idle frames')
