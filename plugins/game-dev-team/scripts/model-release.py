"""Split-model GitHub release transfer. Credentials stay in Git's credential helper."""
import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path
import requests

def digest(file):
    h = hashlib.sha256()
    with open(file, 'rb') as stream:
        for data in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(data)
    return h.hexdigest()

class SliceReader:
    def __init__(self, file, offset, size):
        self.stream = open(file, 'rb'); self.stream.seek(offset)
        self.size = size; self.remaining = size
    def __len__(self): return self.size
    def read(self, size=-1):
        data = self.stream.read(min(self.remaining, size if size >= 0 else self.remaining))
        self.remaining -= len(data); return data
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
    def send(name, reader, size, expected=None):
        if name in assets:
            if assets[name]['size'] != size: raise RuntimeError('Existing asset size differs: '+name)
            if expected and assets[name].get('digest') and assets[name]['digest'] != 'sha256:'+expected:
                raise RuntimeError('Existing asset digest differs: '+name)
            print('resume '+name, flush=True); return
        r = client.post(upload_url, params={'name':name}, data=reader,
                        headers={'Content-Type':'application/octet-stream','Content-Length':str(size)}, timeout=(30,1800))
        r.raise_for_status(); assets[name]=r.json()
        if expected and assets[name].get('digest') and assets[name]['digest'] != 'sha256:'+expected:
            raise RuntimeError('Uploaded asset digest differs: '+name)
        print('uploaded '+name,flush=True)
    for model in catalog['models']:
        file = Path(local[model['path']])
        if file.stat().st_size != model['bytes']: raise RuntimeError('Local size changed: '+model['path'])
        for part in model['parts']:
            reader = SliceReader(file,part['offset'],part['bytes'])
            try: send(part['asset'],reader,part['bytes'],part['sha256'])
            finally: reader.close()
    for file in [Path(args.catalog), *Path(args.terms).glob('*')]:
        if file.is_file():
            with open(file,'rb') as reader: send(file.name,reader,file.stat().st_size)
    r=client.patch(base+f"/releases/{release['id']}",json={'draft':False},timeout=30);r.raise_for_status()
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
        dest.parent.mkdir(parents=True,exist_ok=True); pieces=[]
        for part in model['parts']:
            piece=dest.parent/(dest.name+'.'+part['asset']+'.part');pieces.append(piece)
            if not piece.exists() or piece.stat().st_size!=part['bytes'] or digest(piece)!=part['sha256']:
                url=catalog['release_url']+'/download/'+catalog['tag']+'/'+part['asset']
                with client.get(url,stream=True,timeout=(30,180)) as response:
                    response.raise_for_status()
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
    down=sub.add_parser('restore');down.add_argument('--catalog',required=True);down.add_argument('--root',required=True)
    args=parser.parse_args();upload(args) if args.command=='upload' else restore(args)
if __name__=='__main__': main()
