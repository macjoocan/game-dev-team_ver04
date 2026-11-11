from pathlib import Path
import json,re,zipfile,collections
base=Path('D:/99.기타')
meta=json.loads((base/'out_soulbound/sprite_metadata.json').read_text(encoding='utf8'))
print('SOULBOUND_TOP_KEYS',list(meta))
hits=[s for s in meta['sprites'] if re.search('attack|slash|thrust|combo|swing|sword',s['name'],re.I) and len(s['frames'])>1]
print('SOULBOUND_MULTI_ACTIONS',len(hits))
for s in hits[:45]: print(json.dumps(s,ensure_ascii=False))
for name in ['slayerlegend','wizardoflegend','ninjaskyfight','onceuponatower','idlemoonrabbit','catgunner']:
    root=base/('out_'+name)
    print('\nROOT',name)
    imgs=[p for p in root.rglob('*.png') if re.search('attack|slash|swing|combo|player|hero|run',p.name,re.I)]
    print('IMAGE_MATCHES',len(imgs))
    for p in imgs[:18]: print(p.relative_to(root).as_posix())
    for p in root.glob('*.zip'):
        if 'sprite' in p.name.lower(): continue
        with zipfile.ZipFile(p) as z:
            entries=z.namelist()
            print('ZIP',p.name,'folders',collections.Counter(x.split('/')[0] for x in entries).most_common(12))
            paths=[x for x in entries if re.search('anim|spine|skel',x,re.I)]
            print('ANIM_SAMPLE',paths[:16])
            if name=='catgunner':
                for n in paths:
                    if n.endswith('.json'):
                        try:
                            d=json.loads(z.read(n))
                            if 'animations' in d: print('SPINE',n,'animations',list(d['animations'])[:20])
                        except Exception: pass
