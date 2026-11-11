import os, json, zipfile, collections, re
from pathlib import Path
base=Path('D:/99.기타')
dest=Path(__file__).parent
results=[]
for root in sorted(base.glob('out_*')):
    if not root.is_dir() or root.is_symlink(): continue
    files=[]; archives=[]; errors=[]
    for folder, dirs, names in os.walk(root, followlinks=False):
        if root.name in ['out_dkbi','out_dkbi_probe'] and Path(folder)!=root:
            dirs[:]=[]
            continue
        dirs[:]=[d for d in dirs if not Path(folder,d).is_symlink() and d not in ['node_modules','.git','__pycache__']]
        for name in names:
            p=Path(folder,name)
            if p.is_symlink(): continue
            rel=p.relative_to(root).as_posix()
            files.append(rel)
            if p.suffix.lower()=='.zip':
                try:
                    with zipfile.ZipFile(p) as z:
                        entries=[{'name':x.filename,'size':x.file_size} for x in z.infolist() if not x.is_dir()]
                    archives.append({'path':rel,'entries':entries})
                except Exception as e: errors.append({'path':rel,'error':str(e)})
    result={'root':str(root),'files':files,'archives':archives,'errors':errors}
    results.append(result)
    (dest/'inventory.json').write_text(json.dumps(results,ensure_ascii=False),encoding='utf8')
    names=files+[e['name'] for a in archives for e in a['entries']]
    exts=collections.Counter(Path(f).suffix.lower() for f in names)
    motion=[f for f in names if re.search(r'attack|slash|thrust|combo|sword|swing|\.anim$|\.skel$|\.atlas$',f,re.I)]
    print(json.dumps({'root':root.name,'loose':len(files),'zipEntries':sum(len(a['entries']) for a in archives),'extensions':exts.most_common(7),'motionCount':len(motion),'motionExamples':motion[:7],'errors':errors},ensure_ascii=False),flush=True)
(dest/'inventory.json').write_text(json.dumps(results,ensure_ascii=False),encoding='utf8')
