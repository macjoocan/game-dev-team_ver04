"""Split-model GitHub release transfer. Credentials stay in Git's credential helper."""
import argparse
import hashlib
import json
import os
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests

def digest(file):
    h = hashlib.sha256()
    with open(file, 'rb') as stream:
        for data in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(data)
    return h.hexdigest()

class SliceReader:
    def __init__(self, file, offset, size, progress=None):
        self.stream = open(file, 'rb'); self.stream.seek(offset)
        self.size = size; self.remaining = size
        self.progress = progress
    def __len__(self): return self.size
    def read(self, size=-1):
        data = self.stream.read(min(self.remaining, size if size >= 0 else self.remaining))
        self.remaining -= len(data)
        if self.progress: self.progress(self.size-self.remaining)
        return data
    def close(self): self.stream.close()

def session(repo):
    result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                            text=True, capture_output=True, check=True)
    values = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    client = requests.Session(); client.auth = (values['username'], values['password'])
    client.headers['Accept'] = 'application/vnd.github+json'
    return client

def upload(args):
    catalog = json.loads(Path(args.catalog).read_text(encoding='utf-8'))
    local = json.loads(Path(args.local).read_text(encoding='utf-8'))
    client = session(args.repo); base = 'https://api.github.com/repos/' + args.repo
    r = client.get(base + '/releases/tags/' + args.tag, timeout=30)
    if r.status_code == 404:
        drafts=client.get(base+'/releases',params={'per_page':100},timeout=30)
        drafts.raise_for_status()
        existing=next((item for item in drafts.json() if item['tag_name']==args.tag),None)
        if existing:
            r=client.get(base+f"/releases/{existing['id']}",timeout=30)
    if r.status_code == 404:
        r = client.post(base + '/releases', json={'tag_name':args.tag,'target_commitish':'main',
            'name':'Company sprite models '+args.tag,'draft':True,
            'body':'Split model files. Restore with scripts/model-release.py. See catalog for hashes and upstream terms.'}, timeout=30)
    r.raise_for_status(); release = r.json(); upload_url = release['upload_url'].split('{')[0]
    assets = {}
    page = 1
    while True:
        r = client.get(base + f"/releases/{release['id']}/assets", params={'per_page':100,'page':page}, timeout=30)
        r.raise_for_status(); rows = r.json(); assets.update({a['name']:a for a in rows})
        if len(rows)<100: break
        page += 1
    lock=threading.Lock();positions={};completed={};last_write=[0]
    def progress(name,size,done=False,force=False):
        with lock:
            positions[name]=size
            if done: completed[name]=size;positions.pop(name,None)
            if args.progress and (force or time.time()-last_write[0]>5):
                target=Path(args.progress);target.parent.mkdir(parents=True,exist_ok=True)
                temp=target.with_suffix('.tmp')
                temp.write_text(json.dumps({'state':'uploading','releaseId':release['id'],
                    'totalBytes':catalog['totalBytes'],'uploadedBytes':sum(completed.values()),
                    'sentBytesIncludingInflight':sum(completed.values())+sum(positions.values()),
                    'completedParts':len(completed),'updatedAt':time.time()}))
                os.replace(temp,target);last_write[0]=time.time()
    def send(name, reader, size, expected=None):
        if name in assets:
            if assets[name]['size'] != size: raise RuntimeError('Existing asset size differs: '+name)
            if expected and assets[name].get('digest') and assets[name]['digest'] != 'sha256:'+expected:
                raise RuntimeError('Existing asset digest differs: '+name)
            progress(name,size,done=True,force=True);print('resume '+name, flush=True); return
        transfer=requests.Session();transfer.auth=client.auth
        r = transfer.post(upload_url, params={'name':name}, data=reader,
                        headers={'Content-Type':'application/octet-stream','Content-Length':str(size)}, timeout=(30,1800))
        r.raise_for_status(); assets[name]=r.json()
        if expected and assets[name].get('digest') and assets[name]['digest'] != 'sha256:'+expected:
            raise RuntimeError('Uploaded asset digest differs: '+name)
        progress(name,size,done=True,force=True)
        print('uploaded '+name,flush=True)
    tasks=[]
    for model in catalog['models']:
        file = Path(local[model['path']])
        if file.stat().st_size != model['bytes']: raise RuntimeError('Local size changed: '+model['path'])
        for part in model['parts']:tasks.append((file,part))
    def transfer_part(task):
        file,part=task
        for attempt in range(8):
            reader=SliceReader(file,part['offset'],part['bytes'],lambda n:progress(part['asset'],n))
            try:
                send(part['asset'],reader,part['bytes'],part['sha256']);return
            except requests.RequestException as error:
                if attempt==7:raise
                print(f"retry {part['asset']} attempt {attempt+1}: {type(error).__name__}",flush=True)
                time.sleep(min(60,2**attempt))
                existing=None;page=1
                while True:
                    check=client.get(base+f"/releases/{release['id']}/assets",params={'per_page':100,'page':page},timeout=30)
                    check.raise_for_status();rows=check.json()
                    existing=next((a for a in rows if a['name']==part['asset']),None)
                    if existing or len(rows)<100:break
                    page+=1
                if existing:
                    if existing and existing['state']=='starter':
                        # Only this release's incomplete asset with the exact declared name.
                        removed=client.delete(base+f"/releases/assets/{existing['id']}",timeout=30);removed.raise_for_status()
                    elif existing:assets[part['asset']]=existing
            finally:reader.close()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:list(pool.map(transfer_part,tasks))
    for file in [Path(args.catalog), *Path(args.terms).glob('*')]:
        if file.is_file():
            with open(file,'rb') as reader: send(file.name,reader,file.stat().st_size)
    r=client.patch(base+f"/releases/{release['id']}",json={'draft':False},timeout=30);r.raise_for_status()
    if args.progress:
        Path(args.progress).write_text(json.dumps({'state':'complete','totalBytes':catalog['totalBytes'],
            'uploadedBytes':catalog['totalBytes'],'url':r.json()['html_url'],'updatedAt':time.time()}))
    print('PUBLISHED '+r.json()['html_url'],flush=True)

def restore(args):
    catalog=json.loads(Path(args.catalog).read_text(encoding='utf-8'))
    root=Path(args.root).resolve(); root.mkdir(parents=True,exist_ok=True)
    client=requests.Session()
    for model in catalog['models']:
        dest=(root/model['path']).resolve()
        if root not in dest.parents: raise ValueError('Unsafe model target')
        if dest.exists():
            if digest(dest)==model['sha256']: print('verified '+model['path'],flush=True);continue
            raise RuntimeError('Existing model differs; move it aside manually: '+str(dest))
        if getattr(args,'source','release')=='upstream' and not model.get('upstream_file') and getattr(args,'skip_unverified',False):
            print('skipped (no exact upstream match): '+model['path'],flush=True);continue
        dest.parent.mkdir(parents=True,exist_ok=True); pieces=[]
        for part in model['parts']:
            piece=dest.parent/(dest.name+'.'+part['asset']+'.part');pieces.append(piece)
            if not piece.exists() or piece.stat().st_size!=part['bytes'] or digest(piece)!=part['sha256']:
                headers={}
                if getattr(args,'source','release')=='upstream':
                    if not model.get('upstream_file'):raise RuntimeError('No verified upstream file for '+model['path'])
                    url=f"https://huggingface.co/{model['repo']}/resolve/{model['revision']}/{model['upstream_file']}?range_start={part['offset']}"
                    headers={'Range':f"bytes={part['offset']}-{part['offset']+part['bytes']-1}"}
                else:url=catalog['release_url']+'/download/'+catalog['tag']+'/'+part['asset']
                with client.get(url,headers=headers,stream=True,timeout=(30,180)) as response:
                    response.raise_for_status()
                    if headers and not (response.status_code==206 and response.headers.get('Content-Range','').startswith(
                        f"bytes {part['offset']}-{part['offset']+part['bytes']-1}/") or
                        response.status_code==200 and part['offset']==0 and part['bytes']==model['bytes']):
                        raise RuntimeError('Upstream did not honor the requested range')
                    with open(piece,'wb') as output:
                        for data in response.iter_content(8*1024*1024): output.write(data)
                if piece.stat().st_size!=part['bytes'] or digest(piece)!=part['sha256']: raise RuntimeError('Part hash mismatch')
            print('verified '+part['asset'],flush=True)
        temporary=dest.with_suffix(dest.suffix+'.assembling')
        with open(temporary,'wb') as output:
            for piece in pieces:
                with open(piece,'rb') as stream:
                    for data in iter(lambda:stream.read(8*1024*1024),b''):output.write(data)
        if digest(temporary)!=model['sha256']: raise RuntimeError('Restored model hash mismatch')
        os.replace(temporary,dest)
        for piece in pieces: piece.unlink()
        print('restored '+model['path'],flush=True)

def main():
    parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='command',required=True)
    up=sub.add_parser('upload');up.add_argument('--repo',required=True);up.add_argument('--tag',required=True)
    up.add_argument('--catalog',required=True);up.add_argument('--local',required=True);up.add_argument('--terms',required=True)
    up.add_argument('--workers',type=int,default=4);up.add_argument('--progress')
    down=sub.add_parser('restore');down.add_argument('--catalog',required=True);down.add_argument('--root',required=True)
    down.add_argument('--source',choices=['release','upstream'],default='release')
    down.add_argument('--skip-unverified',action='store_true',help='Explicitly skip unmatched optional previews in upstream mode')
    args=parser.parse_args();upload(args) if args.command=='upload' else restore(args)
if __name__=='__main__': main()
